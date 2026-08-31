import './style.css';
import { mountWheel } from './games/wheel/ui';
import { fetchRosterCsv } from './games/wheel/loadRoster';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('缺少 #app 挂载点');

/** 加载失败时替掉 index.html 里的加载态，别把人晾在「正在加载」上。 */
function showLoadFailure(container: HTMLElement, cause: unknown): void {
  container.innerHTML = `
    <main class="wheel">
      <h1 class="wheel__title">今天吃哪家</h1>
      <p class="wheel__status" id="wheel-load-error" role="alert"></p>
    </main>
  `;
  const status = container.querySelector('#wheel-load-error');
  const detail = cause instanceof Error ? cause.message : String(cause);
  // 完整的错误界面由后续的票负责，这里先保证失败不静默。
  if (status) status.textContent = `名单没能加载：${detail}`;
}

// 取文件的是渲染层，会话只拿到文本（ADR-0001）。
// 在此之前页面显示 index.html 里的加载态，而不是空白或看似坏掉的转盘。
fetchRosterCsv().then(
  (csvText) => {
    mountWheel(root, { csvText });
  },
  (cause: unknown) => {
    showLoadFailure(root, cause);
  },
);
