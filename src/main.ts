import './style.css';
import { mountWheel } from './games/wheel/ui';
import { INLINE_ROSTER_CSV } from './games/wheel/inlineRoster';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('缺少 #app 挂载点');

mountWheel(root, { csvText: INLINE_ROSTER_CSV });
