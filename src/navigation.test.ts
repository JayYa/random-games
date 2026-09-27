/**
 * 站内导航的用例：按地址画哪一页、地址被换成什么、历史上记了什么、挂了哪个主题
 * 哪个玩法、拿到了什么名单原文、上一页有没有被拆。
 *
 * 只有一道接缝：站内导航的接口。背后全是替身——
 * - 假浏览器：一串历史，每条带着地址和记号。照实模拟两条最容易写错的规矩：
 *   `replaceState` 不触发 `hashchange`；改地址（点链接、后退）触发 `hashchange`，
 *   用例把它接到「画当前地址」上，与入口文件的接法一样。
 * - 假取数：用例说什么时候回、回成功还是失败。
 * - 内存里的假 Storage：同一份交给第二个站内导航，就是刷新了页面。
 * - 记录调用的假页面适配器：挂玩法页只做记录，玩法页宿主在它自己的接缝上测透了。
 * - 可预测的随机源：恒给 0，抽玩法在还能抽的里面总取第一个。
 */

import { describe, expect, it } from 'vitest';
import type { RecentMemory } from './cooldown';
import { GAMES, gameHash, type Game } from './games';
import { pickerReturn } from './backToPicker';
import { createNavigation, type NavigationPage } from './navigation';
import type { RecentStorage } from './recentStorage';
import { scriptedRandom } from './testHelpers';
import { THEMES, THEME_PICKER_HASH, themeHash, type Theme } from './themes';

/** 一条历史：它的地址，和它身上记着的东西（新压进来的是 `null`）。 */
interface FakeEntry {
  readonly hash: string;
  readonly state: unknown;
}

/**
 * 一个假浏览器：历史与地址共用一串历史记录。
 *
 * `history` 与 `location` 交给站内导航；`visit` / `back` 是使用者的动作——
 * 点链接、在地址栏里敲、按后退——它们改了地址就触发 `hashchange`。
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
    },
    location: {
      get hash(): string {
        return current().hash;
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
    back(): void {
      moveTo(index - 1);
    },
  };
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
    async succeed(file: string, text = `${file} 的原文`): Promise<void> {
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

/** 一个基于 Map 的假 Storage，和 localStorage 一样只存字符串。 */
function mapStorage(): RecentStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, String(value));
    },
  };
}

/** 假页面记下的一次挂玩法页。 */
interface RecordedMount {
  readonly game: string;
  readonly csvText: string;
  readonly recentWinners: RecentMemory;
}

/**
 * 记录调用的假页面适配器。`log` 按先后记下每一下：`picker`、`loading <主题>`、
 * `load-failure <主题>`、`mount <主题>/<玩法>`，以及挂上的那一页被拆时的
 * `teardown <主题>/<玩法>`。
 */
function fakeNavigationPage() {
  const log: string[] = [];
  const mounts: RecordedMount[] = [];
  const page: NavigationPage = {
    showThemePicker() {
      log.push('picker');
    },
    showRosterLoading(theme) {
      log.push(`loading ${theme.slug}`);
    },
    showRosterLoadFailure(theme) {
      log.push(`load-failure ${theme.slug}`);
    },
    mountGamePage({ theme, game, csvText, recentWinners }) {
      const name = `${theme.slug}/${game.slug}`;
      log.push(`mount ${name}`);
      mounts.push({ game: game.slug, csvText, recentWinners });
      return () => log.push(`teardown ${name}`);
    },
  };
  return { page, log, mounts };
}

interface StartOptions {
  /** 这台浏览器的存储，默认一份新的；刷新页面就是把同一份再交一次。 */
  readonly storage?: RecentStorage;
}

/** 在一个新开的标签页里打开 `hash`：造好站内导航、接上 `hashchange`、起步画一次。 */
function open(hash: string, { storage = mapStorage() }: StartOptions = {}) {
  const browser = fakeBrowser(hash);
  const fetch = fakeFetch();
  const { page, log, mounts } = fakeNavigationPage();
  const navigation = createNavigation({
    history: browser.history,
    location: browser.location,
    fetchRoster: fetch.fetchRoster,
    storage,
    random: scriptedRandom([0]),
    page,
  });
  browser.listen(() => navigation.render());
  navigation.render();
  return { browser, fetch, log, mounts };
}

const [theme, otherTheme] = THEMES as readonly [Theme, Theme, ...Theme[]];
const [firstGame, secondGame] = GAMES as readonly [Game, Game, ...Game[]];

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
    ['多余的路径段', `${gameHash(theme, firstGame)}/detail`],
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
    expect(open(gameHash(theme, secondGame)).log).toEqual([`loading ${theme.slug}`]);
  });

  it('名单回来后挂上地址里的那个玩法', async () => {
    const { fetch, mounts } = open(gameHash(theme, secondGame));
    await fetch.succeed(theme.rosterFile);
    expect(mounts.map((mount) => mount.game)).toEqual([secondGame.slug]);
  });

  it('挂玩法页拿到当前主题的名单原文', async () => {
    const { fetch, mounts } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme.rosterFile, '沙县小吃,true');
    expect(mounts[0]?.csvText).toBe('沙县小吃,true');
  });

  it('取不到文件时画取不到文件的错误页', async () => {
    const { fetch, log } = open(gameHash(theme, firstGame));
    await fetch.fail(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, `load-failure ${theme.slug}`]);
  });
});

describe('只定了主题的地址', () => {
  it('抽一次玩法，把地址换成带玩法的地址', () => {
    expect(open(themeHash(theme)).browser.location.hash).toBe(gameHash(theme, firstGame));
  });

  it('接着只画一遍抽到的那个玩法：加载中一次，挂上一次', async () => {
    const { fetch, log } = open(themeHash(theme));
    await fetch.succeed(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, `mount ${theme.slug}/${firstGame.slug}`]);
  });
});

describe('最近玩法', () => {
  // 同一份存储交给第二个站内导航：刷新之后还记得，说明最近玩法落进了存储。
  it('两次进同一个主题，玩法轮流', () => {
    const storage = mapStorage();
    open(themeHash(theme), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameHash(theme, secondGame));
  });

  it('直接打开带玩法的地址不记进最近玩法', () => {
    const storage = mapStorage();
    open(gameHash(theme, firstGame), { storage });
    expect(open(themeHash(theme), { storage }).browser.location.hash).toBe(gameHash(theme, firstGame));
  });
});

describe('最近中选', () => {
  /** 在 `theme` 的一页上记下一个中选，再换到 `to` 主题的 `game`，交回那一页拿到的最近中选。 */
  async function recentWinnersAfter(to: Theme, game: Game): Promise<readonly string[]> {
    const { browser, fetch, mounts } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme.rosterFile);
    mounts[0]?.recentWinners.remember('甲');
    browser.visit(gameHash(to, game));
    await fetch.succeed(to.rosterFile);
    return mounts[1]?.recentWinners.read() ?? ['没挂上'];
  }

  it('同一个主题换一种玩法，拿到的是同一份最近中选', async () => {
    expect(await recentWinnersAfter(theme, secondGame)).toEqual(['甲']);
  });

  it('不同主题的最近中选互不相干', async () => {
    expect(await recentWinnersAfter(otherTheme, firstGame)).toEqual([]);
  });
});

describe('换页', () => {
  it('名单在路上时地址变了，晚回来的名单不挂', async () => {
    const { browser, fetch, mounts } = open(gameHash(theme, firstGame));
    browser.visit(gameHash(otherTheme, firstGame));
    await fetch.succeed(theme.rosterFile);
    expect(mounts).toEqual([]);
  });

  it('名单在路上时地址变了，晚回来的失败不画错误页', async () => {
    const { browser, fetch, log } = open(gameHash(theme, firstGame));
    browser.visit(gameHash(otherTheme, firstGame));
    await fetch.fail(theme.rosterFile);
    expect(log).toEqual([`loading ${theme.slug}`, `loading ${otherTheme.slug}`]);
  });

  it('先拆上一页，再画下一页', async () => {
    const { browser, fetch, log } = open(gameHash(theme, firstGame));
    await fetch.succeed(theme.rosterFile);
    browser.visit(THEME_PICKER_HASH);
    expect(log.slice(-2)).toEqual([`teardown ${theme.slug}/${firstGame.slug}`, 'picker']);
  });
});

/**
 * 玩法页历史上记的「上一页是不是选主题页」，经「换个主题」会怎么走来读：
 * `back` 是后退一步，`replace` 是原地换成选主题页。
 */
describe('历史上的记号', () => {
  it('从选主题页点进来的玩法页，「换个主题」后退', () => {
    const { browser } = open('');
    browser.visit(gameHash(theme, firstGame));
    expect(pickerReturn(browser.history.state)).toBe('back');
  });

  it('直接落进来的玩法页，「换个主题」原地换', () => {
    const { browser } = open(gameHash(theme, firstGame));
    expect(pickerReturn(browser.history.state)).toBe('replace');
  });

  it('替人抽玩法换地址时，保留「上一页是选主题页」', () => {
    const { browser } = open('');
    browser.visit(themeHash(theme));
    expect(pickerReturn(browser.history.state)).toBe('back');
  });

  // 直接落进玩法页，去选主题页，再后退回来：上一次画的是选主题页，
  // 但这条历史当初记的是「直接落进来」，不改。
  it('后退回到一条老历史时，不改写它的记号', () => {
    const { browser } = open(gameHash(theme, firstGame));
    browser.visit(THEME_PICKER_HASH);
    browser.back();
    expect(pickerReturn(browser.history.state)).toBe('replace');
  });
});
