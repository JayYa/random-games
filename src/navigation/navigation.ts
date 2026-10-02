/**
 * 站内导航 (Navigation)：按 hash 地址画选主题页或玩法页（ADR-0005、ADR-0007）。
 *
 * `#/<主题>/<玩法>` 直接进；`#/<主题>` 先抽玩法再换成带玩法的地址；其余回落到选主题页，
 * 地址栏也改成 `#/`。名单取回之后当场打开，名单错误由这里交给页面，能开抽才把「抽一个中选」
 * 交给玩法页宿主（ADR-0012）。
 *
 * 不碰 DOM、不碰全局，依赖全部注入。
 */

import { THEME_PICKER_HASH, gameHash, resolveAddress } from './address';
import { createCooldown, type RecentStorage } from '../cooldown';
import { mountGamePage, type PageAdapter } from '../gamePage/index';
import type { Game } from '../games';
import type { RandomSource } from '../random';
import { openRoster, type OpenedRoster, type RosterError, type Theme } from '../theme';

/** 站内导航的页面适配器，在宿主的 `PageAdapter` 之上补齐站内导航自己画的几屏。 */
export interface NavigationPage extends PageAdapter {
  /** 列出的主题就是认地址用的那一份。 */
  showThemePicker(themes: readonly Theme[]): void;
  /** 名单在路上。 */
  showRosterLoading(theme: Theme): void;
  /** 名单开不了抽时替掉整页。四种名单错误都只从站内导航这一处画。 */
  showRosterError(theme: Theme, error: RosterError): void;
}

/** 取名单、打开名单的结果：能开抽的候选，或四种名单错误之一。 */
type FetchedRoster = OpenedRoster | { readonly ok: false; readonly error: RosterError };

/** 处理「换个主题」点击要用到的那几样，生产直接交 `MouseEvent`。 */
export interface PickerLinkClick {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface NavigationOptions {
  readonly history: Pick<History, 'state' | 'replaceState' | 'back'>;
  readonly location: Pick<Location, 'hash' | 'replace'>;
  /** 取回这个主题的名单原文，失败时抛错。 */
  readonly fetchRoster: (theme: Theme) => Promise<string>;
  /** 存最近玩法与最近中选（ADR-0011），拿不到就是 `undefined`。 */
  readonly storage: RecentStorage | undefined;
  /** 抽玩法和抽中选共用。 */
  readonly random: RandomSource;
  /** 认地址和画选主题页读同一份。 */
  readonly themes: readonly Theme[];
  /** 认地址和抽玩法读同一份。 */
  readonly games: readonly Game[];
  readonly page: NavigationPage;
}

export interface Navigation {
  /** 画当前地址，地址从注入的 `location` 读。 */
  render(): void;
  /** 处理页头「换个主题」的点击：后退，或原地换成选主题页。 */
  handlePickerLinkClick(click: PickerLinkClick): void;
}

/** 记在每条玩法页历史的 `history.state` 上，刷新不丢。 */
interface PageEntryState {
  /** 历史里的上一页就是选主题页，后退一步正好回去。 */
  readonly fromPicker: boolean;
}

/** 认不出就是刚压进来、还没记过的新历史。 */
function readEntryState(state: unknown): PageEntryState | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { fromPicker } = state as { fromPicker?: unknown };
  return typeof fromPicker === 'boolean' ? { fromPicker } : undefined;
}

/** 带修饰键、非左键或别人已经接手的点击交给浏览器照链接办。 */
function isPlainClick(click: PickerLinkClick): boolean {
  return (
    click.button === 0 &&
    !click.ctrlKey &&
    !click.metaKey &&
    !click.shiftKey &&
    !click.altKey &&
    !click.defaultPrevented
  );
}

export function createNavigation(options: NavigationOptions): Navigation {
  const { history, location, fetchRoster, storage, random, themes, games, page } = options;

  /** 抽玩法和抽中选共用这一个，整个生命周期只建一次（ADR-0011）。 */
  const cooldown = createCooldown({ storage, random });

  /** 每次 render 领一张号，晚回来的名单不是最新那张就作废。 */
  let latestTicket = 0;

  /** 上一个玩法页交回的拆卸。 */
  let teardown: (() => void) | undefined;

  /** 上一次画的是不是选主题页，新历史据此记下 `fromPicker`。 */
  let lastPageWasPicker = false;

  function render(): void {
    latestTicket += 1;
    const ticket = latestTicket;
    const isCurrent = (): boolean => ticket === latestTicket;

    teardown?.();
    teardown = undefined;

    const address = resolveAddress(location.hash, themes, games);
    const cameFromPicker = lastPageWasPicker;
    lastPageWasPicker = address.kind === 'picker';

    if (address.kind === 'picker') {
      // 认不出的地址改写成首页，免得被收藏或分享出去。
      if (!address.canonical) history.replaceState(null, '', THEME_PICKER_HASH);
      page.showThemePicker(themes);
      return;
    }

    // 只给还没记过的新历史记；前进后退回到老历史时不改。
    if (!readEntryState(history.state)) {
      const entry: PageEntryState = { fromPicker: cameFromPicker };
      history.replaceState(entry, '');
    }

    const { theme } = address;

    if (address.kind === 'pending-roll') {
      // 抽玩法后用 replaceState 换地址，不进历史（ADR-0007）。replaceState 不触发
      // hashchange，所以自己再画一次。只有这里算抽玩法，记进最近玩法（ADR-0011）。
      const rolled = cooldown.rollGame(games);
      history.replaceState(history.state, '', gameHash(theme, rolled));
      render();
      return;
    }

    page.showRosterLoading(theme);

    // 只有取不到才是「没取到」；挂玩法页抛错是程序写错，由链尾报到控制台。
    fetchRoster(theme)
      .then(
        (csvText): FetchedRoster => openRoster(csvText),
        (cause: unknown): FetchedRoster => ({ ok: false, error: { kind: 'load', cause } }),
      )
      .then((roster) => {
        // 打开名单没有副作用，晚回来的结果不论哪种都在这里作废。
        if (!isCurrent()) return;
        // 开不了抽时不挂盘面：空盘面看着像程序坏了。
        if (!roster.ok) {
          page.showRosterError(theme, roster.error);
          return;
        }
        // 什么时候抽由宿主定。
        const { candidates } = roster;
        const drawWinner = () => cooldown.drawWinner(theme, candidates);
        teardown = mountGamePage({
          theme,
          drawWinner,
          board: address.game.createBoard(),
          page,
        });
      })
      .catch((cause: unknown) => {
        console.error('挂玩法页时出错', cause);
      });
  }

  function handlePickerLinkClick(click: PickerLinkClick): void {
    if (!isPlainClick(click)) return;
    click.preventDefault();
    // 拿不准上一页是谁就原地换，不把人后退出站点。
    if (readEntryState(history.state)?.fromPicker) {
      history.back();
    } else {
      location.replace(THEME_PICKER_HASH);
    }
  }

  return { render, handlePickerLinkClick };
}
