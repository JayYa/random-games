import './style.css';
import { showRosterLoading } from './gamePage';
import { showRosterLoadFailure } from './rosterFailure';
import { fetchRosterCsv } from './loadRoster';
import { renderThemePicker } from './themePicker';
import { createRenderGuard } from './renderGuard';
import { SITE_TITLE } from './themes';
import { gameHash, resolveRoute, rollGame, type GameTeardown } from './games';
import { recentGamesMemory, recentWinnersMemory, type RecentStorage } from './recentStorage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 挂载点');
const root: HTMLDivElement = app;

/**
 * hash 路由。history 路由在 GitHub Pages 的项目子路径下刷新会 404，
 * 而地址必须能收藏、能发给别人、刷新后还留在原地。
 *
 * 地址分三档（解析在 `games.ts` 的 `resolveRoute`）：
 * `#/<主题>/<玩法>` 直接进那一页；`#/<主题>` 是稳定入口，进来先抽一次玩法，
 * 再把抽到的写进地址（ADR-0007）；其余一切（空 hash、`#/`、不认识的 slug、
 * 多余的路径段）回落到选主题页——站点不记住上次选的主题（ADR-0005），
 * 根地址永远落在首页。
 */

/**
 * 名单在路上时 hash 可能已经变了，回来的 CSV 属于上一个主题，不能再往页面上贴。
 * 判「我还是最新的那次吗」这件事本身在 `renderGuard.ts` 里，那里测得到。
 */
const guard = createRenderGuard();

/**
 * 上一页留下的拆卸函数。换页时整块 DOM 连同挂在它上面的监听一起被替换掉，
 * 只有活过 DOM 的东西（挂在 `window` 上的监听、还在跑的动画帧、揭晓那一拍
 * 还没到点的计时器）要在这里收拾。
 */
let teardown: GameTeardown | undefined;

/**
 * 这台浏览器的 localStorage，存最近中选和最近玩法用（ADR-0011）。
 *
 * 禁用存储时连取 `window.localStorage` 这一下都会抛错，所以包一层：拿不到就是
 * `undefined`，存储适配把它当成没有记忆，照常能抽。
 */
function browserStorage(): RecentStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function render(): void {
  const isCurrent = guard.begin();

  teardown?.();
  teardown = undefined;

  const route = resolveRoute(window.location.hash);
  if (!route) {
    document.title = SITE_TITLE;
    // 选主题页不发任何请求：三个按钮不该等任何网络往返。
    renderThemePicker(root);
    return;
  }

  const { theme } = route;

  if (!route.game) {
    // `#/eat` 这样只定了主题的地址：抽一次玩法，用 replaceState 换成带玩法的地址
    // ——不进历史，后退键才从玩法页直接回首页，而不是回到一个「再抽一次」的中间页
    //（ADR-0007）。replaceState 不触发 hashchange，所以得自己再画一次；
    // 新的这次会领一张新号，把上面那张作废掉，不会画两遍。
    //
    // 只有这里真正替人抽玩法，所以只有这里带上最近玩法（ADR-0011）：上一次抽出的
    // 这一次不出。直接打开带玩法的地址不走这里，也就不会被记下。
    const recentGames = recentGamesMemory(browserStorage());
    history.replaceState(null, '', gameHash(theme, rollGame(Math.random, { recentGames })));
    render();
    return;
  }

  const game = route.game;

  document.title = theme.title;
  showRosterLoading(root, theme);

  // 取文件的是路由层，玩法只拿到文本（ADR-0001）。进玩法页时才取，一次只取一个主题的名单。
  //
  // 三类错误——取不到文件、某行读不懂、没有一个启用的候选——都落在页面上，
  // 而且共用同一套版式（`rosterFailure.ts`）：取不到文件在这里呈现，
  // 另外两类在玩法的挂载函数里呈现。
  fetchRosterCsv(theme.rosterFile).then(
    (csvText) => {
      if (!isCurrent()) return;
      const recentWinners = recentWinnersMemory(browserStorage(), theme.slug);
      const disposer = game.mount(root, { csvText, theme, recentWinners });
      teardown = typeof disposer === 'function' ? disposer : undefined;
    },
    (cause: unknown) => {
      if (!isCurrent()) return;
      showRosterLoadFailure(root, theme, cause);
    },
  );
}

// 切换 hash 时整页重建：盘面、动画、监听都随着 DOM 一起换掉，不留上一页的残余。
window.addEventListener('hashchange', render);
render();
