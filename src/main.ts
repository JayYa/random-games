import './style.css';
import { mountWheel, showRosterLoadFailure, showRosterLoading } from './games/wheel/ui';
import { fetchRosterCsv } from './games/wheel/loadRoster';
import { renderThemePicker } from './themePicker';
import { SITE_TITLE, resolveTheme } from './themes';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 挂载点');
const root: HTMLDivElement = app;

/**
 * hash 路由。history 路由在 GitHub Pages 的项目子路径下刷新会 404，
 * 而地址必须能收藏、能发给别人、刷新后还留在原地。
 *
 * `#/<slug>` 进那个主题的转盘页，其余一切（空 hash、`#/`、不认识的 slug）
 * 回落到选主题页——站点不记住上次选的主题（ADR-0004），根地址永远落在首页。
 */

/**
 * 当前这次渲染的序号。名单在路上时 hash 可能已经变了，
 * 回来的 CSV 属于上一个主题，不能再往页面上贴。
 */
let renderToken = 0;

function render(): void {
  renderToken += 1;
  const token = renderToken;

  const theme = resolveTheme(window.location.hash);
  if (!theme) {
    document.title = SITE_TITLE;
    // 选主题页不发任何请求：三个按钮不该等任何网络往返。
    renderThemePicker(root);
    return;
  }

  document.title = theme.title;
  showRosterLoading(root, theme);

  // 取文件的是渲染层，会话只拿到文本（ADR-0001）。进转盘页时才取，一次只取一个主题的名单。
  //
  // 三类错误——取不到文件、某行读不懂、没有一个候选能上盘——都落在页面上，
  // 而且共用同一套版式：取不到文件在这里呈现，另外两类由 mountWheel 呈现。
  fetchRosterCsv(theme.rosterFile).then(
    (csvText) => {
      if (token !== renderToken) return;
      mountWheel(root, { csvText, theme });
    },
    (cause: unknown) => {
      if (token !== renderToken) return;
      showRosterLoadFailure(root, theme, cause);
    },
  );
}

// 切换 hash 时整页重建：转盘、动画、监听都随着 DOM 一起换掉，不留上一页的残余。
window.addEventListener('hashchange', render);
render();
