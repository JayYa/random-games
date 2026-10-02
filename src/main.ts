import './style.css';
import { THEMES } from 'virtual:themes';
import { browserPage } from './browserPage';
import type { RecentStorage } from './cooldown';
import { GAMES } from './games/allGames';
import { fetchRosterCsv } from './loadRoster';
import { createNavigation } from './navigation';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 挂载点');
const root: HTMLDivElement = app;

/** 这台浏览器的 localStorage（ADR-0011）。禁用存储时连取值都会抛错，拿不到就当没有记忆。 */
function browserStorage(): RecentStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

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

// 页头的「换个主题」交给站内导航处理（ADR-0007）。挂在 `#app` 上：整页重建时链接会换，`#app` 不换。
root.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('[data-to-picker]')) {
    navigation.handlePickerLinkClick(event);
  }
});

navigation.render();
