/** 名单的用例，全部经过打开名单：解析、交回的候选、名单错误。抽中选和冷却见 cooldown.test.ts。 */

import { describe, expect, it } from 'vitest';
import { openRoster } from './index';
import { csv, roster, rosterNames } from '../testHelpers';

/** 能开抽时交回的候选；名单开不了抽时让用例当场失败。 */
function candidatesOf(csvText: string) {
  const opened = openRoster(csvText);
  if (!opened.ok) throw new Error(`名单应当能开抽，却交回了 ${JSON.stringify(opened.error)}`);
  return opened.candidates;
}

/** 交回的候选的名字，按交回的先后。 */
function namesOf(csvText: string): string[] {
  return candidatesOf(csvText).map((candidate) => candidate.name);
}

/** 开不了抽时交回的名单错误；名单能开抽时让用例当场失败。 */
function rosterErrorOf(csvText: string) {
  const opened = openRoster(csvText);
  if (opened.ok) throw new Error('名单应当开不了抽');
  return opened.error;
}

describe('解析名单', () => {
  it('读出普通行的名字', () => {
    expect(namesOf(csv('沙县小吃,true', '兰州拉面,true'))).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('双引号包裹的名字可以含逗号', () => {
    expect(namesOf(csv('"老王烧烤, 二店",true'))).toEqual(['老王烧烤, 二店']);
  });

  it('双写引号是一个引号', () => {
    expect(namesOf(csv('"老王""烧烤""",true'))).toEqual(['老王"烧烤"']);
  });

  it('跳过空行与 # 注释行', () => {
    const csvText = csv('# name,enabled', '', '沙县小吃,true', '   ', '# 下面是新店', '兰州拉面,true');
    expect(namesOf(csvText)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('缺少 enabled 列算启用', () => {
    expect(namesOf(csv('沙县小吃', '兰州拉面,'))).toEqual(['沙县小吃', '兰州拉面']);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'no', 'NO', 'No'])('%s 算停用', (marker) => {
    const csvText = csv(`沙县小吃,${marker}`, '兰州拉面,true');
    expect(namesOf(csvText)).toEqual(['兰州拉面']);
  });

  it.each(['true', 'yes', '1', 'y', '随便写点什么', ' '])('%s 算启用', (marker) => {
    expect(namesOf(csv(`沙县小吃,${marker}`))).toEqual(['沙县小吃']);
  });

  it('停用的候选不在交回的候选里', () => {
    const csvText = csv('沙县小吃,true', '关门大吉,false', '兰州拉面,true', '停业,no', '黄焖鸡,true', '搬走了,0');
    expect(candidatesOf(csvText)).toEqual([
      { name: '沙县小吃', enabled: true },
      { name: '兰州拉面', enabled: true },
      { name: '黄焖鸡', enabled: true },
    ]);
  });

  it('交出每一个启用的候选，不受任何盘面格数所限', () => {
    // 多于转盘的扇区数和弹球机的落格数。
    expect(namesOf(roster(40))).toEqual(rosterNames(40));
  });
});

describe('读不懂', () => {
  it('坏行报出的行号与文件原始行号一致', () => {
    expect(rosterErrorOf(csv('沙县小吃,true', '"没关引号,true'))).toEqual({
      kind: 'parse-error',
      line: 2,
      reason: 'bad-quote',
    });
  });

  it('文件前部有空行和注释时行号依然正确', () => {
    const error = rosterErrorOf(csv('# name,enabled', '', '沙县小吃,true', '', '# 备注', '"没关引号,true'));
    expect(error).toEqual({ kind: 'parse-error', line: 6, reason: 'bad-quote' });
  });

  it('前部有整段注释与空行时，行号仍指向文件里的那一行', () => {
    // 仿 public/ 下名单文件的开头，坏行在第 13 行。
    const error = rosterErrorOf(
      csv(
        '# 名单：每行一个候选，两列 name,enabled',
        '#',
        '# name    候选的名字',
        '# enabled 写 false / 0 / no 算停用',
        '#',
        '# 空行和 # 开头的注释行会被跳过',
        '',
        '   ',
        '\t',
        '',
        '沙县小吃,true',
        '兰州拉面,true',
        '"老王烧烤, 二店,true',
        '黄焖鸡米饭,true',
      ),
    );
    expect(error).toEqual({ kind: 'parse-error', line: 13, reason: 'bad-quote' });
  });

  it('每一行都可能是坏行时，行号逐行对得上', () => {
    for (let badLine = 1; badLine <= 8; badLine += 1) {
      const rows = ['# 头注释', '', '沙县小吃,true', '', '# 中间注释', '兰州拉面,true', '', '黄焖鸡,true'];
      rows[badLine - 1] = '"没关引号,true';
      expect(rosterErrorOf(csv(...rows))).toEqual({ kind: 'parse-error', line: badLine, reason: 'bad-quote' });
    }
  });

  it('CRLF 换行不会让行号错位', () => {
    const error = rosterErrorOf(['# 注释', '', '沙县小吃,true', '"没关引号,true'].join('\r\n'));
    expect(error).toEqual({ kind: 'parse-error', line: 4, reason: 'bad-quote' });
  });

  it('缺少名字的行报出原始行号和这一行去掉首尾空白的原文', () => {
    const error = rosterErrorOf(csv('# 注释', '', '沙县小吃,true', '  ,true  '));
    expect(error).toEqual({ kind: 'parse-error', line: 4, reason: 'missing-name', text: ',true' });
  });

  it('引号闭合后有多余内容与引号未闭合同属一种', () => {
    const error = rosterErrorOf(csv('# 注释', '沙县小吃,true', '"老王烧烤" 二店,true'));
    expect(error).toEqual({ kind: 'parse-error', line: 3, reason: 'bad-quote' });
  });

  it('有多个坏行时报的是第一个', () => {
    const error = rosterErrorOf(csv('沙县小吃,true', '"坏一,true', '兰州拉面,true', '"坏二,true'));
    expect(error).toEqual({ kind: 'parse-error', line: 2, reason: 'bad-quote' });
  });
});

describe('开不了抽的另两种名单', () => {
  it('空文件是空', () => {
    expect(rosterErrorOf('')).toEqual({ kind: 'empty-file' });
  });

  it('只剩空行与注释的文件同样是空', () => {
    expect(rosterErrorOf(csv('# 名单说明', '', '   ', '# 这里本来有几个候选'))).toEqual({ kind: 'empty-file' });
  });

  it('全部停用的名单数得出停用了几个', () => {
    expect(rosterErrorOf(csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no'))).toEqual({
      kind: 'all-disabled',
      disabledCount: 3,
    });
  });

  it('读不懂、空、全部停用三者的种类互不相同', () => {
    const opened = ['"沙县小吃,false', '\n\n# 只有注释\n', csv('沙县小吃,false')].map(openRoster);
    const kinds = opened.map((result) => (result.ok ? 'ok' : result.error.kind));
    expect(kinds).toEqual(['parse-error', 'empty-file', 'all-disabled']);
  });

  it('有一个启用的候选就能开抽，停用的不碍事', () => {
    expect(openRoster(csv('沙县小吃,true', '关门大吉,false')).ok).toBe(true);
  });
});

describe('写重的名字', () => {
  it('同名的几行只交出一个候选', () => {
    expect(candidatesOf(csv('沙县小吃,true', '兰州拉面,true', '沙县小吃,true'))).toEqual([
      { name: '沙县小吃', enabled: true },
      { name: '兰州拉面', enabled: true },
    ]);
  });

  it.each([
    ['启用的在前', ['沙县小吃,true', '沙县小吃,false']],
    ['停用的在前', ['沙县小吃,false', '沙县小吃,']],
  ])('同名的几行任一行停用，这个候选就不在交回的候选里（%s）', (_, rows) => {
    expect(namesOf(csv(...rows, '兰州拉面,true'))).toEqual(['兰州拉面']);
  });

  it('大小写不同的名字是两个候选', () => {
    expect(namesOf(csv('KFC,true', 'kfc,true'))).toEqual(['KFC', 'kfc']);
  });

  it('名字首尾的空白不算，带空白的与不带的是同一个候选，排在第一次出现的位置', () => {
    expect(namesOf(csv('兰州拉面,true', '  沙县小吃 ,true', '黄焖鸡,true', '沙县小吃,true'))).toEqual([
      '兰州拉面',
      '沙县小吃',
      '黄焖鸡',
    ]);
  });

  it('同名的几行全部停用、又没有别的候选时，全部停用的个数按候选数计', () => {
    expect(rosterErrorOf(csv('沙县小吃,false', '沙县小吃,no'))).toEqual({ kind: 'all-disabled', disabledCount: 1 });
  });
});
