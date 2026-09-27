import './style.css';
import { browserNavigationPage } from './browserPage';
import { fetchRosterCsv } from './loadRoster';
import { createNavigation } from './navigation';
import { THEME_PICKER_HASH } from './themes';
import type { RecentStorage } from './recentStorage';
import { isPlainClick, pickerReturn } from './backToPicker';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('缺少 #app 挂载点');
const root: HTMLDivElement = app;

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

// 按地址画哪一页的规矩全在站内导航里（`navigation.ts`），这里只把真的依赖交给它。
const navigation = createNavigation({
  history,
  location,
  fetchRoster: fetchRosterCsv,
  storage: browserStorage(),
  random: Math.random,
  page: browserNavigationPage(root),
});

// 切换 hash 时整页重建：盘面、动画、监听都随着 DOM 一起换掉，不留上一页的残余。
window.addEventListener('hashchange', () => navigation.render());

// 页头的「换个主题」：普通左键单击改成后退，或者在直接落进来的页上原地换成首页
//（ADR-0007）。挂在 `#app` 上而不是链接上：整页重建时链接换了，`#app` 不换。
root.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  if (!event.target.closest('[data-to-picker]') || !isPlainClick(event)) return;
  event.preventDefault();
  if (pickerReturn(history.state) === 'back') {
    history.back();
  } else {
    location.replace(THEME_PICKER_HASH);
  }
});

navigation.render();
