/**
 * 回选主题页的路怎么走：页头的「换个主题」是后退，不是前往（ADR-0007）。
 *
 * 从选主题页点进来的玩法页，点「换个主题」就该退回历史里的那一页首页，而不是在
 * 历史上再压一页首页——否则后退键又把人送回刚离开的玩法页。可从别人的链接、书签
 * 直接落进来的玩法页，历史里的上一页根本不是本站，后退会把人送出站点；这时改成
 * 把当前这页原地换成首页。
 *
 * 「上一页是不是首页」记在每条玩法页历史自己的 `history.state` 上：刷新不丢，
 * 前进后退回到这一条时也还是当初记下的那个答案。这里只放判断，读写 `history`
 * 的是路由层。
 */

import { THEME_PICKER_HASH } from './themes';

/** 一条玩法页历史上记的东西。 */
export interface PageEntryState {
  /** 历史里紧挨着的上一页就是选主题页，后退一步正好回去。 */
  readonly fromPicker: boolean;
}

export function entryState(fromPicker: boolean): PageEntryState {
  return { fromPicker };
}

/**
 * 从 `history.state` 里认出这条历史记过的东西。
 *
 * 认不出就是 `undefined`：这条历史是刚压进来的新页，还没记过。已经记过的不能再改——
 * 后退回到一条老历史时，上一次画的是哪一页和它在历史里挨着谁没有关系。
 */
export function readEntryState(state: unknown): PageEntryState | undefined {
  if (typeof state !== 'object' || state === null) return undefined;
  const { fromPicker } = state as { fromPicker?: unknown };
  return typeof fromPicker === 'boolean' ? { fromPicker } : undefined;
}

/**
 * 回选主题页的两种走法。
 *
 * - `back`：后退一步，上一页就是首页。
 * - `replace`：把当前这页换成首页，历史不多也不少——拿不准上一页是谁时都走这条，
 *   宁可历史里少一页玩法页，也不把人送出站点。
 */
export type PickerReturn = 'back' | 'replace';

export function pickerReturn(state: unknown): PickerReturn {
  return readEntryState(state)?.fromPicker ? 'back' : 'replace';
}

/** 判断一次点击要用到的那几样。 */
export interface ClickLike {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/**
 * 普通的左键单击。只有它才改走后退；带修饰键或者非左键的点击本来就是要新开
 * 标签页、新开窗口、下载，交给浏览器照链接办。
 */
export function isPlainClick(event: ClickLike): boolean {
  return (
    event.button === 0 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  );
}

/**
 * 认不出的地址落到选主题页时，要不要把地址栏也改成 `#/`。
 *
 * `#/foo`、`#/eat/xyz` 画的是首页，地址栏就该写首页——不然收藏下来、发出去的
 * 都是一个坏地址，后退也会退到它上面。根地址（空 hash）本来就是首页，不去动它。
 */
export function shouldRewriteToPicker(hash: string): boolean {
  return hash !== '' && hash !== THEME_PICKER_HASH;
}
