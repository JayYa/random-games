/**
 * 站内导航的用例。背后是真的玩法页宿主，浏览器、取数、存储、页面和玩法清单都是替身。
 * 随机源恒为 0，抽玩法、抽中选总取第一个可抽的。
 *
 * 宿主用真计时器：中选在报停当下就揭晓，用例不必等那一拍。
 */

import { describe, expect, it } from 'vitest';
import { THEME_PICKER_HASH, gameHash, themeHash } from './address';
import type { RollHandle } from '../gamePage';
import type { Game } from '../games';
import { createNavigation, type NavigationPage, type PickerLinkClick } from './navigation';
import {
  csv,
  fakeBoard,
  fakeGamePage,
  fakeGames,
  fakeStorage,
  fakeThemes,
  roster,
  scriptedRandom,
  type FakeBoard,
  type FakeGamePage,
  type FakeStorage,
} from '../testHelpers';
import type { Theme } from '../theme';

interface FakeEntry {
  readonly hash: string;
  /** 新压进来的是 `null`。 */
  readonly state: unknown;
}

interface Trail {
  readonly hashes: readonly string[];
  /** 当前停在第几条，`-1` 是退出了站点。 */
  readonly at: number;
}

/**
 * 假浏览器。`visit` 是点链接或在地址栏里敲。与真的一样，改地址触发 `hashchange`，
 * `replaceState` 不触发。
 */
function fakeBrowser(initialHash: string) {
  const entries: FakeEntry[] = [{ hash: initialHash, state: null }];
  let index = 0;
  let onHashChange: () => void = () => {};

  const current = (): FakeEntry => entries[index]!;

  function moveTo(nextIndex: number): void {
    const before = current().hash;
    index = nextIndex;
    if (current().hash !== before) onHashChange();
  }

  return {
    history: {
      get state(): unknown {
        return current().state;
      },
      replaceState(data: unknown, _unused: string, url?: string | URL | null): void {
        entries[index] = { hash: url == null ? current().hash : String(url), state: structuredClone(data) };
      },
      /** 已经是第一条就退出站点。 */
      back(): void {
        if (index === 0) {
          index = -1;
          return;
        }
        moveTo(index - 1);
      },
    },
    location: {
      get hash(): string {
        return current().hash;
      },
      /** 原地换地址，记号清空。 */
      replace(url: string | URL): void {
        const before = current().hash;
        entries[index] = { hash: String(url), state: null };
        if (current().hash !== before) onHashChange();
      },
    },
    listen(listener: () => void): void {
      onHashChange = listener;
    },
    /** 丢掉前进的历史，压进一条新的。 */
    visit(hash: string): void {
      entries.splice(index + 1, entries.length, { hash, state: null });
      moveTo(index + 1);
    },
    trail(): Trail {
      return { hashes: entries.map((entry) => entry.hash), at: index };
    },
  };
}

/** 点「换个主题」，默认是普通左键单击。 */
function pickerLinkClick(init: Partial<Omit<PickerLinkClick, 'preventDefault'>> = {}) {
  const click = {
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    ...init,
    preventDefault(): void {
      click.defaultPrevented = true;
    },
  };
  return click;
}

/** 由用例决定何时回、成败的假取数，按主题交出名单原文。 */
function fakeFetch() {
  const pending: Array<{
    readonly theme: Theme;
    readonly resolve: (text: string) => void;
    readonly reject: (cause: unknown) => void;
  }> = [];

  /** 取走这个主题所有在路上的请求。 */
  function takeAll(theme: Theme) {
    const isFor = (request: { readonly theme: Theme }) => request.theme.slug === theme.slug;
    const taken = pending.filter(isFor);
    if (taken.length === 0) throw new Error(`没有在路上的 ${theme.slug} 名单`);
    pending.splice(0, pending.length, ...pending.filter((request) => !isFor(request)));
    return taken;
  }

  return {
    fetchRoster(theme: Theme): Promise<string> {
      return new Promise((resolve, reject) => pending.push({ theme, resolve, reject }));
    },
    /** 带着原文回来，等回调跑完。 */
    async succeed(theme: Theme, text = roster(3)): Promise<void> {
      for (const request of takeAll(theme)) request.resolve(text);
      await settle();
    },
    /** 取不到，等回调跑完。 */
    async fail(theme: Theme): Promise<void> {
      for (const request of takeAll(theme)) request.reject(new Error('HTTP 404'));
      await settle();
    },
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 在共用的 `fakeGamePage` 上补齐站内导航多出的两项，都记进 `log`；选主题页每次收到的主题清单
 * 记进 `pickerThemes`。
 *
 * 往共用的假页面上加方法而不用对象展开：展开会把取值器求成定值。
 */
function fakeNavigationPage(
  log: string[],
  pickerThemes: (readonly Theme[])[],
): NavigationPage & FakeGamePage {
  return Object.assign(fakeGamePage(log), {
    showThemePicker(themes: readonly Theme[]) {
      log.push('picker');
      pickerThemes.push(themes);
    },
    showRosterLoading(theme: Theme) {
      log.push(`loading ${theme.slug}`);
    },
  });
}

interface BoardRecord {
  /** 哪个玩法造的。 */
  readonly game: string;
  readonly board: FakeBoard;
  /** 名单写坏、没挂上时为 undefined。 */
  readonly roll: RollHandle | undefined;
}

// 随机源恒为 0，抽玩法总抽到前一个。
const [firstGame, secondGame] = fakeGames(['spin', 'drop']) as [Game, Game];

/**
 * 与 `firstGame`、`secondGame` 同 slug 的两种假玩法，盘面是 `fakeBoard`。`boards` 记下造过的
 * 每个盘面；挂上、拆掉时往 `log` 记 `board mount <玩法>`、`board teardown <玩法>`。
 * 每个标签页造一份新的。`mountThrows` 时盘面挂载当下抛错，模拟程序写错。
 */
function trackedGames(log: string[], mountThrows: boolean) {
  const boards: BoardRecord[] = [];
  const games: readonly Game[] = [firstGame, secondGame].map(({ slug }) => ({
    slug,
    createBoard() {
      let roll: RollHandle | undefined;
      const board = fakeBoard({
        onMount(handle) {
          roll = handle;
          log.push(`board mount ${slug}`);
          if (mountThrows) throw new Error('盘面挂不上');
        },
        onTeardown() {
          log.push(`board teardown ${slug}`);
        },
      });
      boards.push({
        game: slug,
        board,
        get roll() {
          return roll;
        },
      });
      return board;
    },
  }));
  return { games, boards };
}

function mountedGames(boards: readonly BoardRecord[]): string[] {
  return boards.filter((record) => record.board.mountCount > 0).map((record) => record.game);
}

/** 开抽、报停，交回揭晓的名字。 */
function revealOn(record: BoardRecord | undefined): string | undefined {
  record?.roll?.begin();
  record?.roll?.boardStopped();
  return record?.board.revealed?.name;
}

interface StartOptions {
  /** 同一份再交一次就是刷新页面。 */
  readonly storage?: FakeStorage;
  /** 盘面挂载时抛错。 */
  readonly mountThrows?: boolean;
}

/** 在新标签页里打开 `hash`。 */
function open(hash: string, { storage = fakeStorage(), mountThrows = false }: StartOptions = {}) {
  const browser = fakeBrowser(hash);
  const fetch = fakeFetch();
  const log: string[] = [];
  const pickerThemes: (readonly Theme[])[] = [];
  const { games, boards } = trackedGames(log, mountThrows);
  const page = fakeNavigationPage(log, pickerThemes);
  const navigation = createNavigation({
    history: browser.history,
    location: browser.location,
    fetchRoster: fetch.fetchRoster,
    storage,
    random: scriptedRandom([0]),
    themes: fakeThemes,
    games,
    page,
  });
  browser.listen(() => navigation.render());
  navigation.render();
  return { browser, navigation, fetch, log, boards, pickerThemes, page };
}

const [theme, otherTheme] = fakeThemes;

describe('选主题页', () => {
  const pickerHashes = [
    ['空 hash', ''],
    ['选主题页的地址', THEME_PICKER_HASH],
  ];

  it.each(pickerHashes)('%s画选主题页', (_case, hash) => {
    expect(open(hash).log).toEqual(['picker']);
  });

  it.each(pickerHashes)('%s不改地址', (_case, hash) => {
    expect(open(hash).browser.location.hash).toBe(hash);
  });

  it('认不出的地址画选主题页', () => {
    expect(open('#/foo').log).toEqual(['picker']);
  });

  it('认不出的地址把地址换成选主题页的地址', () => {
    expect(open('#/foo').browser.location.hash).toBe(THEME_PICKER_HASH);
  });

  // 列出的与认得的是同一份，不会有点进去却回落首页的入口。
  it('选主题页收到的主题清单就是注入的那一份', () => {
    expect(open('').pickerThemes[0]).toBe(fakeThemes);
  });
});

describe('带玩法的地址', () => {
  it('名单在路上时画这个主题的加载中', () => {
    expect(open(gameHash(theme, secondGame)).log).toEqual([`loading ${theme.slug}`]);
  });

  it('名单回来后挂上地址里的那个玩法', async () => {
    const { fetch, boards } = open(gameHash(theme, secondGame));
    await fetch.succeed(theme);
    expect(mountedGames(boards)).toEqual([secondGame.slug]);
  });

  it('盘面上揭晓的候选来自这一次取回的名单原文', async () => {
    const { fetch, boards } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme, '沙县小吃,true');
    expect(revealOn(boards[0])).toBe('沙县小吃');
  });

  it.each([
    [
      '某一行读不懂',
      csv('沙县小吃,true', '"没关引号,true'),
      { kind: 'parse-error', line: 2, reason: 'bad-quote' },
    ],
    ['文件里一条候选都没有', '', { kind: 'empty-file' }],
    [
      '候选全部停用',
      csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no'),
      { kind: 'all-disabled', disabledCount: 3 },
    ],
  ])('%s：名单错误原样交给页面，不写玩法页，不挂盘面', async (_case, csvText, error) => {
    const { fetch, log, page, boards } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme, csvText);
    expect(log).toEqual([`loading ${theme.slug}`, `page roster-error ${error.kind}`]);
    expect(page.rosterErrors).toEqual([{ theme, error }]);
    expect(page.gamePages).toEqual([]);
    expect(mountedGames(boards)).toEqual([]);
  });

  it('取不到文件时交出没取到的名单错误，带上取不到的原因', async () => {
    const { fetch, log, page } = open(gameHash(theme, firstGame));
    await fetch.fail(theme);
    expect(log).toEqual([`loading ${theme.slug}`, 'page roster-error load']);
    expect(page.rosterErrors).toEqual([
      { theme, error: { kind: 'load', cause: new Error('HTTP 404') } },
    ]);
  });

  // 留下未处理的 rejection 时 vitest 判整轮失败。
  it('名单回来后挂盘面抛错，不当成没取到', async () => {
    const { fetch, page } = open(gameHash(theme, firstGame), { mountThrows: true });
    await fetch.succeed(theme);
    expect(page.rosterErrors).toEqual([]);
  });
});

describe('只定了主题的地址', () => {
  it('抽一次玩法，把地址换成带玩法的地址', () => {
    expect(open(themeHash(theme)).browser.location.hash).toBe(gameHash(theme, firstGame));
  });

  it('接着只画一遍抽到的那个玩法：加载中一次，挂上一次', async () => {
    const { fetch, log } = open(themeHash(theme));
    await fetch.succeed(theme);
    expect(log).toEqual([`loading ${theme.slug}`, 'page game', `board mount ${firstGame.slug}`]);
  });
});

describe('最近玩法', () => {
  // 同一份存储交给第二个站内导航，就是刷新了页面。
  it('两次进同一个主题，玩法轮流', () => {
    const storage = fakeStorage();
    open(themeHash(theme), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameHash(theme, secondGame));
  });

  it('直接打开带玩法的地址不记进最近玩法', () => {
    const storage = fakeStorage();
    open(gameHash(theme, firstGame), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameHash(theme, firstGame));
  });
});

describe('最近中选', () => {
  /**
   * 先在 `theme` 抽出「候选1」，再换到 `to` 的 `game` 开抽，交回第二次揭晓的名字：
   * 「候选1」冷却着就是「候选2」。
   */
  async function revealedAfter(to: Theme, game: Game): Promise<string | undefined> {
    const { browser, fetch, boards } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme, roster(2));
    revealOn(boards[0]);
    browser.visit(gameHash(to, game));
    await fetch.succeed(to, roster(2));
    return revealOn(boards[1]);
  }

  it('同一个主题上刚中选的候选，换一种玩法再开抽，揭晓的不是它', async () => {
    expect(await revealedAfter(theme, secondGame)).toBe('候选2');
  });

  it('一个主题上中选的候选，不影响另一个主题开抽时揭晓它', async () => {
    expect(await revealedAfter(otherTheme, firstGame)).toBe('候选1');
  });
});

describe('换页', () => {
  it('名单在路上时地址变了，晚回来的名单不挂', async () => {
    const { browser, fetch, boards } = open(gameHash(theme, firstGame));
    browser.visit(gameHash(otherTheme, firstGame));
    await fetch.succeed(theme);
    expect(mountedGames(boards)).toEqual([]);
  });

  it('名单在路上时地址变了，晚回来的失败不画错误页', async () => {
    const { browser, fetch, log } = open(gameHash(theme, firstGame));
    browser.visit(gameHash(otherTheme, firstGame));
    await fetch.fail(theme);
    expect(log).toEqual([`loading ${theme.slug}`, `loading ${otherTheme.slug}`]);
  });

  it('先拆上一页，再画下一页', async () => {
    const { browser, fetch, log } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme);
    browser.visit(THEME_PICKER_HASH);
    expect(log.slice(-2)).toEqual([`board teardown ${firstGame.slug}`, 'picker']);
  });
});

/** 「换个主题」：从选主题页点进来的后退一步，直接落进来的原地换（ADR-0007）。 */
describe('换个主题', () => {
  it('从选主题页点进来的玩法页，后退一步', () => {
    const { browser, navigation } = open('');
    browser.visit(gameHash(theme, firstGame));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: ['', gameHash(theme, firstGame)], at: 0 });
  });

  // 后退会出站。
  it('直接落进来的玩法页，原地换成选主题页', () => {
    const { browser, navigation } = open(gameHash(theme, firstGame));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: [THEME_PICKER_HASH], at: 0 });
  });

  it('替人抽玩法换了地址，从选主题页点进来的照样后退一步', () => {
    const { browser, navigation } = open('');
    browser.visit(themeHash(theme));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: ['', gameHash(theme, firstGame)], at: 0 });
  });

  // 这条历史记的是「直接落进来」，上一页画的是什么不影响它。
  it('后退回到一条直接落进来的老历史，照样原地换', () => {
    const { browser, navigation } = open(gameHash(theme, firstGame));
    browser.visit(THEME_PICKER_HASH);
    browser.history.back();
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: [THEME_PICKER_HASH, THEME_PICKER_HASH], at: 0 });
  });

  // 否则历史上会多压一页选主题页。
  it('接走的点击不再照链接走', () => {
    const { navigation } = open(gameHash(theme, firstGame));
    const click = pickerLinkClick();
    navigation.handlePickerLinkClick(click);
    expect(click.defaultPrevented).toBe(true);
  });

  // 新开标签页、窗口、下载，或已被别人接手。
  it.each([
    ['按着 Ctrl', { ctrlKey: true }],
    ['按着 Meta', { metaKey: true }],
    ['按着 Shift', { shiftKey: true }],
    ['按着 Alt', { altKey: true }],
    ['中键', { button: 1 }],
    ['右键', { button: 2 }],
    ['已经被拦下', { defaultPrevented: true }],
  ])('%s的点击不接走', (_case, init) => {
    const { browser, navigation } = open('');
    browser.visit(gameHash(theme, firstGame));
    navigation.handlePickerLinkClick(pickerLinkClick(init));
    expect(browser.trail()).toEqual({ hashes: ['', gameHash(theme, firstGame)], at: 1 });
  });
});
