/**
 * 骰子 module 的 interface，目录外只从这里 import。只交出盘面工厂；机器、几何、模拟、画布
 * 绘制都留在里面。
 */

export { createDieBoard } from './ui.ts';
