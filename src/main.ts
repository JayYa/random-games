import './style.css';
import { mountWheel, showRosterLoadFailure } from './games/wheel/ui';
import { fetchRosterCsv } from './games/wheel/loadRoster';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('缺少 #app 挂载点');

// 取文件的是渲染层，会话只拿到文本（ADR-0001）。
// 在此之前页面显示 index.html 里的加载态，而不是空白或看似坏掉的转盘。
//
// 三类错误——取不到文件、某行读不懂、没有一家能上盘——都落在页面上，
// 而且共用同一套版式：取不到文件在这里呈现，另外两类由 mountWheel 呈现。
fetchRosterCsv().then(
  (csvText) => {
    mountWheel(root, { csvText });
  },
  (cause: unknown) => {
    showRosterLoadFailure(root, cause);
  },
);
