import './style.css';
import { THEMES } from 'virtual:themes';
import { browserPage, browserStorage, fetchRosterCsv } from './browser';
import { GAMES } from './games';
import { createNavigation } from './navigation';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 挂载点');
const root: HTMLDivElement = app;

const navigation = createNavigation({
  history,
  location,
  fetchRoster: fetchRosterCsv,
  storage: browserStorage(),
  random: Math.random,
  themes: THEMES,
  games: GAMES,
  page: browserPage(root),
});

window.addEventListener('hashchange', () => navigation.render());

// iOS（含微信）页面上没有 touchstart 监听就不套 :active，按下去没反馈；空的被动监听不拦滚动。
document.addEventListener('touchstart', () => {}, { passive: true });

// 页头的「换个主题」交给站内导航处理（ADR-0007）。挂在 `#app` 上：整页重建时链接会换，`#app` 不换。
root.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-to-picker]')) {
    navigation.handlePickerLinkClick(event);
  }
});

navigation.render();
