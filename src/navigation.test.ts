/**
 * 站内导航的用例：按地址画哪一页、地址被换成什么、挂上的是哪个玩法的盘面、盘面上
 * 揭晓的中选从哪份名单来、换了玩法或主题之后谁还在冷却、上一页有没有被拆，以及点
 * 「换个主题」之后历史怎么走。
 *
 * 只有一道接缝：站内导航的接口。背后挂的是真的玩法页宿主，其余全是替身——
 * - 假浏览器：一串历史，每条带着地址和记号。照实模拟两条最容易写错的规矩：
 *   `replaceState` 不触发 `hashchange`；改地址（点链接、后退、原地换）触发
 *   `hashchange`，用例把它接到「画当前地址」上，与入口文件的接法一样。
 * - 假点击：默认是普通的左键单击，记得自己有没有被拦下。
 * - 假取数：用例说什么时候回、回成功还是失败。
 * - 内存里的假 Storage：同一份交给第二个站内导航，就是刷新了页面。
 * - 两份记录调用的假页面适配器：站内导航自己的那一份记下画了选主题页、加载中还是
 *   取不到文件的错误页；宿主的那一份是 `testHelpers.ts` 里现成的假页面，挂载点交
 *   一个空对象。两份与假盘面记进同一份 `log`，先后看得见。
 * - 可预测的随机源：恒给 0，抽玩法、抽中选都在还能抽的里面总取第一个。
 * - 本地造的假玩法清单：每个假玩法只是一个 slug 加一个造假盘面的办法，不引入全部
 *   真玩法——真盘面挂上时要碰 DOM。清单记下它造过的每个盘面，用例从挂上那一刻拿到
 *   宿主交给盘面的开抽句柄，开抽、报停，再看盘面上揭晓了谁。
 *
 * 揭晓那一拍用宿主自己的真计时器：中选在报停那一刻就揭晓、记进最近中选，用例不必
 * 等那一拍走完；换页时宿主的拆卸会掐掉它。
 */

import { describe, expect, it } from 'vitest';
import type { RollHandle } from './gamePageHost';
import { gameHash, type Game } from './games';
import { createNavigation, type NavigationPage, type PickerLinkClick } from './navigation';
import {
  fakeBoard,
  fakeGamePage,
  fakeStorage,
  roster,
  scriptedRandom,
  type FakeBoard,
  type FakeStorage,
} from './testHelpers';
import { THEMES, THEME_PICKER_HASH, themeHash, type Theme } from './themes';

/** 一条历史：它的地址，和它身上记着的东西（新压进来的是 `null`）。 */
interface FakeEntry {
  readonly hash: string;
  readonly state: unknown;
}

/** 这个标签页的历史走到了哪儿：每条历史的地址，和当前停在第几条（`-1` 是退出了站点）。 */
interface Trail {
  readonly hashes: readonly string[];
  readonly at: number;
}

/**
 * 一个假浏览器：历史与地址共用一串历史记录。
 *
 * `history` 与 `location` 交给站内导航，使用者按后退也是 `history.back`；`visit` 是
 * 使用者点链接、在地址栏里敲。改了地址就触发 `hashchange`，`replaceState` 不触发。
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
      // 与真的一样：换掉当前这条历史，不触发 `hashchange`。
      replaceState(data: unknown, _unused: string, url?: string | URL | null): void {
        entries[index] = { hash: url == null ? current().hash : String(url), state: structuredClone(data) };
      },
      /** 退回上一条历史；已经是这个标签页的第一条，就退出了站点。 */
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
      /** 把当前这条历史换成新地址，记号清空；地址变了就触发 `hashchange`。 */
      replace(url: string | URL): void {
        const before = current().hash;
        entries[index] = { hash: String(url), state: null };
        if (current().hash !== before) onHashChange();
      },
    },
    listen(listener: () => void): void {
      onHashChange = listener;
    },
    /** 点一个链接：丢掉前进的那几条，压进一条新历史。 */
    visit(hash: string): void {
      entries.splice(index + 1, entries.length, { hash, state: null });
      moveTo(index + 1);
    },
    trail(): Trail {
      return { hashes: entries.map((entry) => entry.hash), at: index };
    },
  };
}

/** 点一下「换个主题」：默认是普通的左键单击，`init` 改其中几样。 */
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

/** 一个用例说什么时候回、回成功还是失败的假取数。 */
function fakeFetch() {
  const pending: Array<{
    readonly file: string;
    readonly resolve: (text: string) => void;
    readonly reject: (cause: unknown) => void;
  }> = [];

  /** 取走这份名单所有还在路上的请求：同一份文件被取了几次，就一起回来几次。 */
  function takeAll(file: string) {
    const taken = pending.filter((request) => request.file === file);
    if (taken.length === 0) throw new Error(`没有在路上的 ${file}`);
    pending.splice(0, pending.length, ...pending.filter((request) => request.file !== file));
    return taken;
  }

  return {
    fetchRoster(file: string): Promise<string> {
      return new Promise((resolve, reject) => pending.push({ file, resolve, reject }));
    },
    /** 让某份名单带着这段原文回来，等回调跑完。 */
    async succeed(file: string, text = roster(3)): Promise<void> {
      for (const request of takeAll(file)) request.resolve(text);
      await settle();
    },
    /** 让某份名单取不到，等回调跑完。 */
    async fail(file: string): Promise<void> {
      for (const request of takeAll(file)) request.reject(new Error('HTTP 404'));
      await settle();
    },
  };
}

/** 等已经回来的名单把回调跑完。 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 站内导航自己的假页面适配器，往 `log` 里按先后记下每一下：`picker`、
 * `loading <主题>`、`load-failure <主题>`。
 */
function fakeNavigationPage(log: string[]): NavigationPage {
  return {
    showThemePicker() {
      log.push('picker');
    },
    showRosterLoading(theme) {
      log.push(`loading ${theme.slug}`);
    },
    showRosterLoadFailure(theme) {
      log.push(`load-failure ${theme.slug}`);
    },
  };
}

/** 假玩法清单记下的一个盘面：哪个玩法造的、盘面本身、挂上时拿到的开抽句柄。 */
interface BoardRecord {
  /** 哪个玩法造的。 */
  readonly game: string;
  readonly board: FakeBoard;
  /** 宿主挂上它时交给它的真开抽句柄；没挂上（名单写坏）时为 undefined。 */
  readonly roll: RollHandle | undefined;
}

// 假玩法清单里两种假玩法的 slug，按清单里的先后：随机源恒给 0，抽玩法总抽到前一个。
const firstSlug = 'spin';
const secondSlug = 'drop';

/** 这个主题下某个假玩法的地址：地址怎么写仍只由 `gameHash` 定。 */
function gameAddress(theme: Theme, slug: string): string {
  return gameHash(theme, { slug, createBoard: () => fakeBoard() });
}

/**
 * 站内导航用例的假玩法清单：两种假玩法，slug 与真玩法都不同，盘面是 `fakeBoard`。
 * 两种就够看玩法轮流；地址里认不认得出、抽出的是哪一种，都只在这份清单里定。
 *
 * 每开一个标签页造一份新的，免得造过的盘面串到别的用例里：`boards` 按先后记下它
 * 造过的每个盘面；盘面挂上、被拆时往 `log` 里记一行 `board mount <玩法>`、
 * `board teardown <玩法>`。
 */
function fakeGames(log: string[]) {
  const boards: BoardRecord[] = [];
  const games: readonly Game[] = [firstSlug, secondSlug].map((slug) => ({
    slug,
    createBoard() {
      let roll: RollHandle | undefined;
      const board = fakeBoard({
        onMount(handle) {
          roll = handle;
          log.push(`board mount ${slug}`);
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

/** 挂上过的盘面是哪几个玩法的，按先后。 */
function mountedGames(boards: readonly BoardRecord[]): string[] {
  return boards.filter((record) => record.board.mountCount > 0).map((record) => record.game);
}

/**
 * 在这个盘面上开抽一次、报停，就像真盘面按「转」、转完报一声；交回盘面上揭晓的
 * 名字。盘面没造出来或没挂上就什么都揭晓不了，是 undefined。
 */
function revealOn(record: BoardRecord | undefined): string | undefined {
  record?.roll?.begin();
  record?.roll?.boardStopped();
  return record?.board.revealed?.name;
}

interface StartOptions {
  /** 这台浏览器的存储，默认一份新的；刷新页面就是把同一份再交一次。 */
  readonly storage?: FakeStorage;
}

/** 在一个新开的标签页里打开 `hash`：造好站内导航、接上 `hashchange`、起步画一次。 */
function open(hash: string, { storage = fakeStorage() }: StartOptions = {}) {
  const browser = fakeBrowser(hash);
  const fetch = fakeFetch();
  const log: string[] = [];
  const { games, boards } = fakeGames(log);
  const navigation = createNavigation({
    history: browser.history,
    location: browser.location,
    fetchRoster: fetch.fetchRoster,
    storage,
    random: scriptedRandom([0]),
    games,
    page: fakeNavigationPage(log),
    // 站内导航不碰挂载点，只原样交给宿主：一个空对象就够。
    root: {} as HTMLElement,
    hostPage: fakeGamePage(log),
  });
  browser.listen(() => navigation.render());
  navigation.render();
  return { browser, navigation, fetch, log, boards };
}

const [theme, otherTheme] = THEMES as readonly [Theme, Theme, ...Theme[]];

describe('选主题页', () => {
  it('空 hash 画选主题页', () => {
    expect(open('').log).toEqual(['picker']);
  });

  it('空 hash 不改地址', () => {
    expect(open('').browser.location.hash).toBe('');
  });

  const unknownAddresses = [
    ['不认识的主题', '#/foo'],
    ['不认识的玩法', `#/${theme.slug}/xyz`],
    ['多余的路径段', `${gameAddress(theme, firstSlug)}/detail`],
  ];

  it.each(unknownAddresses)('%s画选主题页', (_case, hash) => {
    expect(open(hash).log).toEqual(['picker']);
  });

  it.each(unknownAddresses)('%s把地址换成选主题页的地址', (_case, hash) => {
    expect(open(hash).browser.location.hash).toBe(THEME_PICKER_HASH);
  });
});

describe('带玩法的地址', () => {
  it('名单在路上时画这个主题的加载中', () => {
    expect(open(gameAddress(theme, secondSlug)).log).toEqual([`loading ${theme.slug}`]);
  });

  it('名单回来后挂上地址里的那个玩法', async () => {
    const { fetch, boards } = open(gameAddress(theme, secondSlug));
    await fetch.succeed(theme.rosterFile);
    expect(mountedGames(boards)).toEqual([secondSlug]);
  });

  it('盘面上揭晓的候选来自这一次取回的名单原文', async () => {
    const { fetch, boards } = open(gameAddress(theme, firstSlug));
    await fetch.succeed(theme.rosterFile, '沙县小吃,true');
    expect(revealOn(boards[0])).toBe('沙县小吃');
  });

  it('名单写坏时画名单错误页，不挂盘面', async () => {
    const { fetch, log } = open(gameAddress(theme, firstSlug));
    await fetch.succeed(theme.rosterFile, '"没关引号,true');
    expect(log).toEqual([`loading ${theme.slug}`, 'page roster-failure parse-error']);
  });

  it('取不到文件时画取不到文件的错误页', async () => {
    const { fetch, log } = open(gameAddress(theme, firstSlug));
    await fetch.fail(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, `load-failure ${theme.slug}`]);
  });
});

describe('只定了主题的地址', () => {
  it('抽一次玩法，把地址换成带玩法的地址', () => {
    expect(open(themeHash(theme)).browser.location.hash).toBe(gameAddress(theme, firstSlug));
  });

  it('接着只画一遍抽到的那个玩法：加载中一次，挂上一次', async () => {
    const { fetch, log } = open(themeHash(theme));
    await fetch.succeed(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, 'page game', `board mount ${firstSlug}`]);
  });
});

describe('最近玩法', () => {
  // 同一份存储交给第二个站内导航：刷新之后还记得，说明最近玩法落进了存储。
  it('两次进同一个主题，玩法轮流', () => {
    const storage = fakeStorage();
    open(themeHash(theme), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameAddress(theme, secondSlug));
  });

  it('直接打开带玩法的地址不记进最近玩法', () => {
    const storage = fakeStorage();
    open(gameAddress(theme, firstSlug), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameAddress(theme, firstSlug));
  });
});

describe('最近中选', () => {
  /**
   * 在 `theme` 的 `firstSlug` 上开抽一次，再换到 `to` 主题的 `slug` 开抽一次，交回
   * 第二次揭晓的名字。两份名单都是 `roster(2)`，随机源恒给 0：第一次揭晓「候选1」；
   * 第二次它不在冷却里就还是「候选1」，冷却着就是「候选2」。
   */
  async function revealedAfter(to: Theme, slug: string): Promise<string | undefined> {
    const { browser, fetch, boards } = open(gameAddress(theme, firstSlug));
    await fetch.succeed(theme.rosterFile, roster(2));
    revealOn(boards[0]);
    browser.visit(gameAddress(to, slug));
    await fetch.succeed(to.rosterFile, roster(2));
    return revealOn(boards[1]);
  }

  it('同一个主题上刚中选的候选，换一种玩法再开抽，揭晓的不是它', async () => {
    expect(await revealedAfter(theme, secondSlug)).toBe('候选2');
  });

  it('一个主题上中选的候选，不影响另一个主题开抽时揭晓它', async () => {
    expect(await revealedAfter(otherTheme, firstSlug)).toBe('候选1');
  });
});

describe('换页', () => {
  it('名单在路上时地址变了，晚回来的名单不挂', async () => {
    const { browser, fetch, boards } = open(gameAddress(theme, firstSlug));
    browser.visit(gameAddress(otherTheme, firstSlug));
    await fetch.succeed(theme.rosterFile);
    expect(mountedGames(boards)).toEqual([]);
  });

  it('名单在路上时地址变了，晚回来的失败不画错误页', async () => {
    const { browser, fetch, log } = open(gameAddress(theme, firstSlug));
    browser.visit(gameAddress(otherTheme, firstSlug));
    await fetch.fail(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, `loading ${otherTheme.slug}`]);
  });

  it('先拆上一页，再画下一页', async () => {
    const { browser, fetch, log } = open(gameAddress(theme, firstSlug));
    await fetch.succeed(theme.rosterFile);
    browser.visit(THEME_PICKER_HASH);
    expect(log.slice(-2)).toEqual([`board teardown ${firstSlug}`, 'picker']);
  });
});

/**
 * 页头的「换个主题」（ADR-0007）：从选主题页点进来的后退一步，直接落进来的原地换成
 * 选主题页。看的是点完之后这个标签页的历史——后退是停到了上一条，原地换是当前这条
 * 变成了 `#/`。
 */
describe('换个主题', () => {
  it('从选主题页点进来的玩法页，后退一步', () => {
    const { browser, navigation } = open('');
    browser.visit(gameAddress(theme, firstSlug));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: ['', gameAddress(theme, firstSlug)], at: 0 });
  });

  // 从别人的链接、书签直接落进来的：后退会出站，只能原地换成首页。
  it('直接落进来的玩法页，原地换成选主题页', () => {
    const { browser, navigation } = open(gameAddress(theme, firstSlug));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: [THEME_PICKER_HASH], at: 0 });
  });

  it('替人抽玩法换了地址，从选主题页点进来的照样后退一步', () => {
    const { browser, navigation } = open('');
    browser.visit(themeHash(theme));
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: ['', gameAddress(theme, firstSlug)], at: 0 });
  });

  // 直接落进玩法页，去选主题页，再后退回来：上一次画的是选主题页，
  // 但这条历史当初记的是「直接落进来」，不改。
  it('后退回到一条直接落进来的老历史，照样原地换', () => {
    const { browser, navigation } = open(gameAddress(theme, firstSlug));
    browser.visit(THEME_PICKER_HASH);
    browser.history.back();
    navigation.handlePickerLinkClick(pickerLinkClick());
    expect(browser.trail()).toEqual({ hashes: [THEME_PICKER_HASH, THEME_PICKER_HASH], at: 0 });
  });

  // 接走了就不能再让浏览器照链接走，否则历史上又多压一页首页。
  it('接走的点击不再照链接走', () => {
    const { navigation } = open(gameAddress(theme, firstSlug));
    const click = pickerLinkClick();
    navigation.handlePickerLinkClick(click);
    expect(click.defaultPrevented).toBe(true);
  });

  // 新开标签页、新开窗口、下载，或者别人已经接手了：这个标签页的历史一动不动。
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
    browser.visit(gameAddress(theme, firstSlug));
    navigation.handlePickerLinkClick(pickerLinkClick(init));
    expect(browser.trail()).toEqual({ hashes: ['', gameAddress(theme, firstSlug)], at: 1 });
  });
});
