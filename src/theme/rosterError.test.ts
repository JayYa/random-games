/** 名单错误的文案：四种名单错误各写成什么标题、说明、提示。 */

import { describe, expect, it } from 'vitest';
import { describeRosterError } from './index';
import { hostTheme as theme } from '../testHelpers';

describe('名单错误写成文案', () => {
  it('没取到：说得出是哪份文件、为什么没取到，提示去确认 public/ 下的文件', () => {
    expect(describeRosterError(theme, { kind: 'load', cause: new Error('HTTP 404') })).toEqual({
      title: '名单文件没取到',
      detail: '读取 eat.csv 失败：HTTP 404',
      hint: '确认 public/eat.csv 确实在仓库里并且已经部署，然后刷新页面重试。',
    });
  });

  it('没取到的原因不是 Error 时照样写得出来', () => {
    expect(describeRosterError(theme, { kind: 'load', cause: '断网了' }).detail).toBe(
      '读取 eat.csv 失败：断网了',
    );
  });

  it('引号写坏：说得出是第几行，提示去 public/ 下的文件改那一行', () => {
    expect(describeRosterError(theme, { kind: 'parse-error', line: 6, reason: 'bad-quote' })).toEqual({
      title: '名单里有一行读不懂',
      detail: '第 6 行格式有误：引号未闭合或引号外有多余内容',
      hint: '打开 public/eat.csv，按上面说的行号改掉那一行，再刷新页面。',
    });
  });

  it('缺少名字的错误说得出是哪一行、这一行写了什么、该怎么改', () => {
    expect(
      describeRosterError(theme, { kind: 'parse-error', line: 3, reason: 'missing-name', text: ',true' }),
    ).toEqual({
      title: '名单里有一行读不懂',
      detail:
        '第 3 行没有名字：这一行是「,true」，第一个逗号前面是空的。' +
        '把名字补在这一行开头（写成「名字,true」的样子），或者把整行删掉。',
      hint: '打开 public/eat.csv，按上面说的行号改掉那一行，再刷新页面。',
    });
  });

  it('空：说得出是哪份文件，提示加上几行候选', () => {
    expect(describeRosterError(theme, { kind: 'empty-file' })).toEqual({
      title: '名单是空的',
      detail: 'public/eat.csv 里一条候选记录都没有——文件是空的，或者只剩空行和 # 注释。',
      hint: '在文件里加上几行「名字,true」再刷新页面。',
    });
  });

  it('全部停用：说得出停用了几个，提示把 enabled 列改回 true', () => {
    expect(describeRosterError(theme, { kind: 'all-disabled', disabledCount: 3 })).toEqual({
      title: '名单里的候选全部停用',
      detail: '名单里的 3 个候选全都写了 false / 0 / no，一个都没启用，盘面上没东西可放。',
      hint: '把想要的那几个的 enabled 列改成 true，再刷新页面。',
    });
  });
});
