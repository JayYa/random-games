/**
 * 求签筒 module 的 interface，目录外只从这里 import。只交出盘面工厂；机器、常量表、画布绘制
 * 都留在里面（ADR-0014）。
 */

export { createSticksBoard } from './ui.ts';
