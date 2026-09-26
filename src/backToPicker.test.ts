import { describe, expect, it } from 'vitest';
import {
  entryState,
  isPlainClick,
  pickerReturn,
  readEntryState,
  shouldRewriteToPicker,
  type ClickLike,
} from './backToPicker';

const plainClick: ClickLike = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
};

describe('玩法页历史上记的东西', () => {
  it('记下的能原样认出来', () => {
    expect(readEntryState(entryState(true))).toEqual({ fromPicker: true });
    expect(readEntryState(entryState(false))).toEqual({ fromPicker: false });
  });

  it('刚压进来、还没记过的历史认不出来', () => {
    expect(readEntryState(null)).toBeUndefined();
    expect(readEntryState(undefined)).toBeUndefined();
  });

  it('别的形状一律当没记过', () => {
    expect(readEntryState({})).toBeUndefined();
    expect(readEntryState({ fromPicker: 'yes' })).toBeUndefined();
    expect(readEntryState('fromPicker')).toBeUndefined();
  });
});

describe('回选主题页怎么走', () => {
  it('从选主题页点进来的，后退一步', () => {
    expect(pickerReturn(entryState(true))).toBe('back');
  });

  // 从别人的链接、书签直接落进来的：后退会出站，只能原地换成首页。
  it('直接落进来的，原地换成首页', () => {
    expect(pickerReturn(entryState(false))).toBe('replace');
  });

  it('拿不准的时候不后退', () => {
    expect(pickerReturn(null)).toBe('replace');
    expect(pickerReturn({ something: 'else' })).toBe('replace');
  });
});

describe('普通点击', () => {
  it('左键单击是', () => {
    expect(isPlainClick(plainClick)).toBe(true);
  });

  it('中键、右键不是', () => {
    expect(isPlainClick({ ...plainClick, button: 1 })).toBe(false);
    expect(isPlainClick({ ...plainClick, button: 2 })).toBe(false);
  });

  it('带任何一个修饰键都不是', () => {
    for (const key of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
      expect(isPlainClick({ ...plainClick, [key]: true })).toBe(false);
    }
  });

  it('别人已经接手的点击不是', () => {
    expect(isPlainClick({ ...plainClick, defaultPrevented: true })).toBe(false);
  });
});

describe('落到选主题页时地址栏要不要改写成首页', () => {
  // 这个函数不认路由：地址认不认得出是调用方（main.ts）判断的，认不出、落到选主题页
  // 之后才来问这里。这里只管「除了首页和根地址，一律改」。
  it('首页和根地址以外的地址都要改', () => {
    for (const hash of ['#/foo', '#/eat/wheel/1', '#foo']) {
      expect(shouldRewriteToPicker(hash)).toBe(true);
    }
  });

  it('已经是首页的地址不动', () => {
    expect(shouldRewriteToPicker('#/')).toBe(false);
  });

  it('根地址不动', () => {
    expect(shouldRewriteToPicker('')).toBe(false);
  });
});
