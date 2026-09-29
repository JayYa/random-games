/**
 * 站内导航 (Navigation)：按地址决定这一次画选主题页还是玩法页。
 *
 * 用 hash 地址，不用 history API 的地址：后者在 GitHub Pages 的项目子路径下刷新会
 * 404，而地址必须能收藏、能发给别人、刷新后还留在原地。
 *
 * 地址分三档（解析在 `games.ts` 的 `resolveRoute`，玩法只在注入的玩法清单里认）：
 * `#/<主题>/<玩法>` 直接进那一页；
 * `#/<主题>` 是稳定入口，进来先抽一次玩法，再把抽到的写进地址（ADR-0007）；其余一切
 * （空 hash、`#/`、不认识的 slug、多余的路径段）回落到选主题页，地址栏也跟着改成
 * `#/`——站点不记住上次选的主题（ADR-0005），根地址永远落在首页。
 *
 * 「画当前地址」要照固定的先后做一串事：领一张号、拆掉上一页、给新压进来的历史记下
 * 「上一页是不是选主题页」、只定了主题的地址先抽玩法再换地址重画、取名单、晚回来的
 * 名单或失败一律作废。这串先后只住在这里，经这一个接口测。
 *
 * 页头的「换个主题」是后退，不是前往（ADR-0007）：从选主题页点进来的玩法页后退一步，
 * 不在历史上再压一页首页；从别人的链接、书签直接落进来的玩法页，上一页不是本站，
 * 后退会把人送出站点，改成把当前这页原地换成首页。靠的就是上面记下的那个记号——
 * 它记在每条玩法页历史自己的 `history.state` 上，刷新不丢。
 *
 * 它不碰 DOM、不碰全局：浏览器的历史与地址、取名单、存储、随机源、玩法清单和写页面
 * 的办法都从接口注入，生产由入口文件交真的，用例交替身。
 */

// 只取类型，编译后不留痕迹；玩法页宿主本身也不碰 DOM。
import type { GamePageHostOptions } from './gamePageHost';
import { gameHash, resolveRoute, rollGame, type Game } from './games';
import { recentGamesMemory, recentWinnersMemory, type RecentStorage } from './recentStorage';
import type { RandomSource } from './rosterSession';
import { THEME_PICKER_HASH, type Theme } from './themes';

/**
 * 挂一页玩法页要交给页面适配器的东西：站内导航替玩法页宿主备好的那几样（主题、
 * 名单原文、最近中选，各自的说明在 `GamePageHostOptions`），加上这一次的玩法——
 * 页面适配器凭它挑盘面。
 */
export type GamePageMount = Pick<GamePageHostOptions, 'theme' | 'csvText' | 'recentWinners'> & {
  readonly game: Game;
};

/**
 * 站内导航的页面适配器：它碰 DOM 的唯一出口。生产用 `browserPage.ts` 里的
 * `browserNavigationPage`，用例用一份记录调用的假页面。
 *
 * 与玩法页宿主的页面适配器是两个：这一个只管整页画哪一页，玩法页里面怎么接由宿主定。
 */
export interface NavigationPage {
  /** 画选主题页，浏览器标签标题设成站点名。 */
  showThemePicker(): void;
  /** 名单在路上：画这个主题的页头和「正在加载名单…」，标签标题设成主题标题。 */
  showRosterLoading(theme: Theme): void;
  /** 名单文件取不到（404 / 断网 / 服务器出错）：画取不到文件的错误页。 */
  showRosterLoadFailure(theme: Theme, cause: unknown): void;
  /** 挂上一页玩法页，交回拆掉它的办法，换页前调。 */
  mountGamePage(mount: GamePageMount): () => void;
}

/**
 * 一次点在「换个主题」上的点击，处理它要用到的那几样。生产直接交浏览器的
 * `MouseEvent`；认出点的是不是那个链接是入口文件的事。
 */
export interface PickerLinkClick {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  /** 别人已经接手了这次点击。 */
  readonly defaultPrevented: boolean;
  /** 不让浏览器再照链接走。 */
  preventDefault(): void;
}

export interface NavigationOptions {
  /** 浏览器的历史，生产传 `window.history`。 */
  readonly history: Pick<History, 'state' | 'replaceState' | 'back'>;
  /** 浏览器的地址，生产传 `window.location`。 */
  readonly location: Pick<Location, 'hash' | 'replace'>;
  /** 取回 `public/` 下某份名单文件的原文，失败时抛错。 */
  readonly fetchRoster: (rosterFile: string) => Promise<string>;
  /**
   * 这台浏览器的存储（生产为 localStorage），存最近玩法与最近中选（ADR-0011）。
   * 禁用存储时拿不到就是 `undefined`，照常能抽，只是没有冷却。
   */
  readonly storage: RecentStorage | undefined;
  /** 抽玩法用的随机源，生产传 `Math.random`。 */
  readonly random: RandomSource;
  /**
   * 玩法清单：地址解析在这份里认玩法，替人抽玩法也在这份里抽，两处读的是同一份。
   * 生产传全部玩法（`GAMES`），用例交一份临时造的假玩法清单。
   */
  readonly games: readonly Game[];
  readonly page: NavigationPage;
}

export interface Navigation {
  /**
   * 画当前地址。地址自己经注入的 `location` 读——替人抽完玩法之后重画也要重读，
   * 调用方不传 hash，免得有两个来源。入口文件把 `hashchange` 接到这里，起步调一次。
   */
  render(): void;

  /**
   * 处理一次点在「换个主题」上的点击：要不要接走、接走了是后退还是原地换成首页，
   * 都在这里定。入口文件认出点的是那个链接就转交过来。
   */
  handlePickerLinkClick(click: PickerLinkClick): void;
}

/** 一条玩法页历史上记的东西。 */
interface PageEntryState {
  /** 历史里紧挨着的上一页就是选主题页，后退一步正好回去。 */
  readonly fromPicker: boolean;
}

/**
 * 从 `history.state` 里认出这条历史记过的东西。
 *
 * 认不出就是 `undefined`：这条历史是刚压进来的新页，还没记过。
 */
function readEntryState(state: unknown): PageEntryState | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { fromPicker } = state as { fromPicker?: unknown };
  return typeof fromPicker === 'boolean' ? { fromPicker } : undefined;
}

/**
 * 普通的左键单击。只有它才接走；带修饰键或者非左键的点击本来就是要新开标签页、
 * 新开窗口、下载，别人已经接手的也不抢，都交给浏览器照链接办。
 */
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
  const { history, location, fetchRoster, storage, random, games, page } = options;

  /**
   * 领号的计数：名单在路上时地址可能已经变了，晚回来的那份 CSV 属于上一个主题，
   * 不能再往页面上贴。用序号而不是取消请求——一次 `fetch` 取消与否都不影响谁该上屏，
   * 真正要判的只有一件事：我回来的时候，我还是最新的那一次吗。
   */
  let latestTicket = 0;

  /**
   * 上一页玩法页交回的拆卸。换页时整块 DOM 连同挂在它上面的监听一起被替换掉，只有
   * 活过 DOM 的东西（揭晓那一拍还没到点的计时器、盘面挂在 `window` 上的监听、还在跑
   * 的动画帧）要收拾——怎么收拾、按什么顺序由玩法页宿主定。
   */
  let teardown: (() => void) | undefined;

  /**
   * 上一次画的是不是选主题页。新压进来的玩法页历史靠它记下「上一页是不是首页」，
   * 页头的「换个主题」据此决定后退还是原地换（ADR-0007）。
   */
  let lastPageWasPicker = false;

  function render(): void {
    latestTicket += 1;
    const ticket = latestTicket;
    const isCurrent = (): boolean => ticket === latestTicket;

    teardown?.();
    teardown = undefined;

    const hash = location.hash;
    const route = resolveRoute(hash, games);
    const cameFromPicker = lastPageWasPicker;
    lastPageWasPicker = !route;

    if (!route) {
      // `#/foo`、`#/eat/xyz` 画的是首页，地址栏就该写首页——不然收藏下来、发出去的
      // 都是一个坏地址，后退也会退到它上面。根地址本来就是首页，不去动它。
      if (hash !== '' && hash !== THEME_PICKER_HASH) {
        history.replaceState(null, '', THEME_PICKER_HASH);
      }
      // 选主题页不发任何请求：几个按钮不该等任何网络往返。
      page.showThemePicker();
      return;
    }

    // 新压进来的这条历史还没记过上一页是谁，现在记下。记过的不改：前进后退回到
    // 一条老历史时，上一次画的是哪一页和它在历史里挨着谁无关。
    if (!readEntryState(history.state)) {
      const entry: PageEntryState = { fromPicker: cameFromPicker };
      history.replaceState(entry, '');
    }

    const { theme, game } = route;

    if (!game) {
      // 只定了主题的地址：抽一次玩法，用 replaceState 换成带玩法的地址——不进历史，
      // 后退键才从玩法页直接回首页，而不是回到一个「再抽一次」的中间页（ADR-0007）。
      // replaceState 不触发 hashchange，所以得自己再画一次；新的这次领一张新号，
      // 把这一次作废掉，不会画两遍。换地址时带上刚记下的记号：抽玩法不改「上一页是不是首页」。
      //
      // 只有这里真正替人抽玩法，所以只有这里带上最近玩法（ADR-0011）：上一次抽出的
      // 这一次不出。直接打开带玩法的地址不走这里，也就不会被记下。
      const rolled = rollGame(random, { recentGames: recentGamesMemory(storage), games });
      history.replaceState(history.state, '', gameHash(theme, rolled));
      render();
      return;
    }

    page.showRosterLoading(theme);

    // 进玩法页时才取，一次只取一个主题的名单。取不到文件在这里呈现；名单读不懂、
    // 没有一个启用的候选由玩法页宿主呈现，共用同一套版式（`rosterFailure.ts`）。
    fetchRoster(theme.rosterFile).then(
      (csvText) => {
        if (!isCurrent()) return;
        // 名单、开抽与结果卡片由玩法页宿主接，玩法只交盘面（ADR-0012）。最近中选存在
        // 哪里是站内导航的事，宿主拿去建名单会话，盘面碰不到它（ADR-0011）。
        teardown = page.mountGamePage({
          theme,
          game,
          csvText,
          recentWinners: recentWinnersMemory(storage, theme.slug),
        });
      },
      (cause: unknown) => {
        if (!isCurrent()) return;
        page.showRosterLoadFailure(theme, cause);
      },
    );
  }

  function handlePickerLinkClick(click: PickerLinkClick): void {
    if (!isPlainClick(click)) return;
    click.preventDefault();
    // 拿不准上一页是谁时都原地换：宁可历史里少一页玩法页，也不把人送出站点。
    if (readEntryState(history.state)?.fromPicker) {
      history.back();
    } else {
      location.replace(THEME_PICKER_HASH);
    }
  }

  return { render, handlePickerLinkClick };
}
