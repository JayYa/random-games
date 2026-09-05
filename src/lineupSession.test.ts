/**
 * 名单会话的用例：解析、四种状态、抽样、换一批、打乱。
 *
 * 这些都是玩法无关的性质——转盘和弹球机看到的是同一份上盘名单逻辑，
 * 差别只在上限是多少。转盘的角度用例在 `games/wheel/session.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import { createLineupSession, type RandomSource } from './lineupSession';
import { csv, expectSameNames, names, roster, rosterNames, scriptedRandom, seededRandom } from './testHelpers';

/**
 * 这批用例原先钉的是转盘的上限 12，平移过来后照旧用它当默认值——
 * 上限本身是入参这一维，由文件末尾专门的一组用例去钉。
 */
const CAP = 12;

function makeSession(options: { csvText: string; cap?: number; random?: RandomSource }) {
  return createLineupSession({
    csvText: options.csvText,
    cap: options.cap ?? CAP,
    random: options.random,
  });
}

describe('解析名单', () => {
  it('读出普通行的名字', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '兰州拉面,true') });
    expectSameNames(session.lineup, ['沙县小吃', '兰州拉面']);
    expect(session.error).toBeUndefined();
  });

  it('双引号包裹的名字可以含逗号', () => {
    const session = makeSession({ csvText: csv('"老王烧烤, 二店",true') });
    expectSameNames(session.lineup, ['老王烧烤, 二店']);
  });

  it('双写引号是一个引号', () => {
    const session = makeSession({ csvText: csv('"老王""烧烤""",true') });
    expectSameNames(session.lineup, ['老王"烧烤"']);
  });

  it('跳过空行与 # 注释行', () => {
    const session = makeSession({
      csvText: csv('# name,enabled', '', '沙县小吃,true', '   ', '# 下面是新店', '兰州拉面,true'),
    });
    expectSameNames(session.lineup, ['沙县小吃', '兰州拉面']);
  });

  it('缺少 enabled 列算启用', () => {
    const session = makeSession({ csvText: csv('沙县小吃', '兰州拉面,') });
    expectSameNames(session.lineup, ['沙县小吃', '兰州拉面']);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'no', 'NO', 'No'])('%s 算停用', (marker) => {
    const session = makeSession({ csvText: csv(`沙县小吃,${marker}`, '兰州拉面,true') });
    expectSameNames(session.lineup, ['兰州拉面']);
    expect(session.enabledCount).toBe(1);
  });

  it.each(['true', 'yes', '1', 'y', '随便写点什么', ' '])('%s 算启用', (marker) => {
    const session = makeSession({ csvText: csv(`沙县小吃,${marker}`) });
    expectSameNames(session.lineup, ['沙县小吃']);
  });

  it('停用的候选不进入上盘名单', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,no'),
    });
    expectSameNames(session.lineup, ['沙县小吃']);
    expect(session.enabledCount).toBe(1);
  });
});

describe('解析错误', () => {
  it('坏行报出的行号与文件原始行号一致', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.error).toContain('第 2 行');
    expect(session.lineup).toEqual([]);
  });

  it('文件前部有空行和注释时行号依然正确', () => {
    const session = makeSession({
      csvText: csv('# name,enabled', '', '沙县小吃,true', '', '# 备注', '"没关引号,true'),
    });
    expect(session.error).toContain('第 6 行');
  });

  it('前部有整段注释与空行时，行号仍指向文件里的那一行', () => {
    // 照着 public/eat.csv 的样子：文件开头是一大段说明注释和空行，
    // 真正的第一条记录在第 11 行，坏行在第 13 行。
    const session = makeSession({
      csvText: csv(
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
    });
    expect(session.error).toContain('第 13 行');
    expect(session.error).not.toContain('第 3 行');
  });

  it('每一行都可能是坏行时，行号逐行对得上', () => {
    // 把同一个坏行放在文件的每一个位置上，报出的行号必须跟着走。
    for (let badLine = 1; badLine <= 8; badLine += 1) {
      const rows = ['# 头注释', '', '沙县小吃,true', '', '# 中间注释', '兰州拉面,true', '', '黄焖鸡,true'];
      rows[badLine - 1] = '"没关引号,true';
      const session = makeSession({ csvText: csv(...rows) });
      expect(session.error).toContain(`第 ${badLine} 行`);
    }
  });

  it('CRLF 换行不会让行号错位', () => {
    const session = makeSession({
      csvText: ['# 注释', '', '沙县小吃,true', '"没关引号,true'].join('\r\n'),
    });
    expect(session.error).toContain('第 4 行');
  });

  it('缺少名字的行也报出原始行号', () => {
    const session = makeSession({
      csvText: csv('# 注释', '', '沙县小吃,true', ',true'),
    });
    expect(session.error).toContain('第 4 行');
  });

  it('缺少名字的错误说得出是哪一行、这一行写了什么、该怎么改', () => {
    // 一个手滑的逗号会让整页变成错误提示，那这条提示就得让人一眼知道去改哪里。
    const session = makeSession({
      csvText: csv('# 注释', '沙县小吃,true', ',true'),
    });
    expect(session.error).toContain('第 3 行');
    expect(session.error).toContain('名字');
    expect(session.error).toContain(',true');
  });

  it('引号闭合后有多余内容也算坏行', () => {
    const session = makeSession({
      csvText: csv('# 注释', '沙县小吃,true', '"老王烧烤" 二店,true'),
    });
    expect(session.error).toContain('第 3 行');
  });

  it('有多个坏行时报的是第一个', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,true', '"坏一,true', '兰州拉面,true', '"坏二,true'),
    });
    expect(session.error).toContain('第 2 行');
    expect(session.error).not.toContain('第 4 行');
  });

  it('坏行让上盘名单为空且状态是 parse-error', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.status).toBe('parse-error');
    expect(session.lineup).toEqual([]);
    expect(session.enabledCount).toBe(0);
  });
});

describe('转不起来的三种名单状态', () => {
  it('空文件解析成功，状态是 empty-file', () => {
    const session = makeSession({ csvText: '' });
    expect(session.error).toBeUndefined();
    expect(session.status).toBe('empty-file');
    expect(session.lineup).toEqual([]);
    expect(session.enabledCount).toBe(0);
    expect(session.disabledCount).toBe(0);
  });

  it('只剩空行与注释的文件同样是 empty-file', () => {
    const session = makeSession({
      csvText: csv('# 名单说明', '', '   ', '# 这里本来有几个候选'),
    });
    expect(session.status).toBe('empty-file');
    expect(session.disabledCount).toBe(0);
  });

  it('全部停用的名单状态是 all-disabled，且数得出停用了几个', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no'),
    });
    expect(session.error).toBeUndefined();
    expect(session.status).toBe('all-disabled');
    expect(session.enabledCount).toBe(0);
    expect(session.disabledCount).toBe(3);
  });

  it('空文件与全部停用是两个可区分的状态', () => {
    const emptyFile = makeSession({ csvText: '' });
    const allDisabled = makeSession({ csvText: csv('沙县小吃,false', '兰州拉面,0') });

    // 两者的上盘名单都是空的，光看上盘名单分辨不出来——所以状态必须不同。
    expect(emptyFile.lineup).toEqual([]);
    expect(allDisabled.lineup).toEqual([]);
    expect(emptyFile.status).not.toBe(allDisabled.status);
    expect(emptyFile.disabledCount).toBe(0);
    expect(allDisabled.disabledCount).toBe(2);
  });

  it('解析失败、空文件、全部停用三者的状态互不相同', () => {
    const broken = makeSession({ csvText: '"沙县小吃,false' });
    const emptyFile = makeSession({ csvText: '\n\n# 只有注释\n' });
    const allDisabled = makeSession({ csvText: csv('沙县小吃,false') });
    const ok = makeSession({ csvText: csv('沙县小吃,true') });

    const states = [broken.status, emptyFile.status, allDisabled.status, ok.status];
    expect(new Set(states).size).toBe(4);
    expect(broken.error).toBeDefined();
    expect(emptyFile.error).toBeUndefined();
    expect(allDisabled.error).toBeUndefined();
  });

  it('名单好的时候状态是 ok', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '关门大吉,false') });
    expect(session.status).toBe('ok');
    expect(session.enabledCount).toBe(1);
    expect(session.disabledCount).toBe(1);
  });
});

describe('上盘名单', () => {
  it('恰好 12 个时全部上盘且不是抽样', () => {
    const session = makeSession({ csvText: roster(12) });
    expect(session.lineup).toHaveLength(CAP);
    expect(session.isSampled).toBe(false);
    expect(session.enabledCount).toBe(12);
  });

  it('12 个及以下时上盘名单是全部启用候选的一个排列', () => {
    // 个数相同、集合相同、无重复、无遗漏——被打乱的只是座次。
    for (const count of [1, 2, 7, CAP]) {
      const session = makeSession({
        csvText: roster(count),
        random: scriptedRandom([0.62, 0.11, 0.94, 0.37, 0.5, 0.08, 0.73]),
      });
      expect(session.lineup).toHaveLength(count);
      expect(new Set(names(session.lineup)).size).toBe(count);
      expectSameNames(session.lineup, rosterNames(count));
      expect(session.isSampled).toBe(false);
    }
  });

  it('12 个及以下时上盘名单的顺序也与 CSV 的顺序无关', () => {
    // 照搬 CSV 的书写顺序会让盘面每次一模一样，看久了像是摆好的（ADR-0002）。
    //
    // 一个种子钉不住这条：一个「大多数时候原样返回」的假打乱，碰上那一个种子
    // 恰好动了一下就蒙混过关了。所以换 60 个种子各建一次会话，看这 8 个候选
    // 总共被摆出过多少种样子。
    const size = 8;
    const inCsvOrder = rosterNames(size).join(',');
    const orders = Array.from({ length: 60 }, (_, seed) =>
      names(makeSession({ csvText: roster(size), random: seededRandom(seed) }).lineup).join(','),
    );

    // 8 个候选有 40320 种排列，恰好摆成 CSV 那一种的概率是 1/40320。
    // 60 次里出现哪怕一次，都不是巧合，是打乱压根没在打乱。
    expect(orders.filter((order) => order === inCsvOrder)).toEqual([]);
    // 而且这 60 次给出的是几十种各不相同的顺序，不是几种花样轮流坐庄。
    expect(new Set(orders).size).toBeGreaterThanOrEqual(50);
    // 每一个座次上都出现过不止一个候选：整体平移、只换头尾这类假打乱也过不去。
    for (let seat = 0; seat < size; seat += 1) {
      const seenAtSeat = new Set(orders.map((order) => order.split(',')[seat]));
      expect(seenAtSeat.size).toBeGreaterThan(1);
    }
  });

  it('不需要抽样时，打乱也不会把停用的候选带上盘', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,true', '停业,no'),
      random: scriptedRandom([0.44, 0.09, 0.66, 0.28]),
    });
    expect(session.isSampled).toBe(false);
    expectSameNames(session.lineup, ['沙县小吃', '兰州拉面']);
  });

  it('12 个及以下时，同一随机序列下打乱的结果可复现', () => {
    const seed = [0.62, 0.11, 0.94, 0.37, 0.5, 0.08, 0.73];
    const a = makeSession({ csvText: roster(9), random: scriptedRandom(seed) });
    const b = makeSession({ csvText: roster(9), random: scriptedRandom(seed) });
    expect(names(a.lineup)).toEqual(names(b.lineup));
  });

  it('12 个及以下时换一批不改变上盘名单', () => {
    const session = makeSession({ csvText: roster(5), random: scriptedRandom([0.7]) });
    const before = names(session.lineup);
    session.reshuffle();
    expect(names(session.lineup)).toEqual(before);
  });

  it('13 个时抽 12 个上盘且是抽样', () => {
    const session = makeSession({ csvText: roster(13), random: scriptedRandom([0.4]) });
    expect(session.lineup).toHaveLength(CAP);
    expect(session.isSampled).toBe(true);
    expect(session.enabledCount).toBe(13);
  });

  it('抽样得到的上盘名单没有重复', () => {
    const session = makeSession({
      csvText: roster(20),
      random: scriptedRandom([0.13, 0.87, 0.02, 0.55, 0.99, 0.31, 0.68]),
    });
    expect(new Set(names(session.lineup)).size).toBe(CAP);
  });

  it('需要抽样时，停用的候选也永远不进上盘名单', () => {
    // 20 个启用 + 8 个停用交错排列：无论重抽多少次，停用的名字都不该出现。
    const rows: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push(`候选${i + 1},true`);
      if (i < 8) rows.push(`停用${i + 1},false`);
    }

    const session = makeSession({
      csvText: csv(...rows),
      random: scriptedRandom([0.03, 0.97, 0.41, 0.6, 0.19, 0.78, 0.5, 0.26, 0.91]),
    });
    expect(session.enabledCount).toBe(20);
    expect(session.isSampled).toBe(true);

    for (let round = 0; round < 30; round += 1) {
      expect(session.lineup).toHaveLength(CAP);
      for (const name of names(session.lineup)) {
        expect(name.startsWith('停用')).toBe(false);
      }
      session.reshuffle();
    }
  });

  it('给定随机序列下重抽产生预期的另一批', () => {
    // 随机源恒为 0：打乱的每一步都确定，于是上盘名单也是确定的一批。
    const steady = makeSession({ csvText: roster(15), random: scriptedRandom([0]) });
    const first = names(steady.lineup);
    expect(first).toHaveLength(CAP);

    // 随机序列没变，重抽仍从完整的 15 个里抽——说明重抽是把整份名单重新打乱，
    // 而不是在旧上盘名单上做增量。
    steady.reshuffle();
    expect(names(steady.lineup)).toEqual(first);

    // 换一个随机序列，重抽给出确实不同的一批。
    const session = makeSession({
      csvText: roster(15),
      random: scriptedRandom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99]),
    });
    const before = names(session.lineup);
    session.reshuffle();
    const after = names(session.lineup);
    expect(after).toHaveLength(CAP);
    expect(after).not.toEqual(before);
  });

  it('同一随机序列下重抽的结果可复现', () => {
    const seed = [0.62, 0.11, 0.94, 0.37, 0.5, 0.08, 0.73, 0.29, 0.86];
    const a = makeSession({ csvText: roster(18), random: scriptedRandom(seed) });
    const b = makeSession({ csvText: roster(18), random: scriptedRandom(seed) });
    expect(names(a.lineup)).toEqual(names(b.lineup));
    a.reshuffle();
    b.reshuffle();
    expect(names(a.lineup)).toEqual(names(b.lineup));
  });

});

describe('上盘名单上限是入参', () => {
  it('同一份 CSV 在上限 8 与上限 12 下得到不同长度的上盘名单', () => {
    const csvText = roster(20);
    const eight = makeSession({ csvText, cap: 8, random: scriptedRandom([0.31, 0.77, 0.05, 0.62]) });
    const twelve = makeSession({ csvText, cap: 12, random: scriptedRandom([0.31, 0.77, 0.05, 0.62]) });

    expect(eight.lineup).toHaveLength(8);
    expect(twelve.lineup).toHaveLength(12);
    // 上限不同的只是取几个，名单本身没变：两边数的启用候选是同一批。
    expect(eight.enabledCount).toBe(20);
    expect(twelve.enabledCount).toBe(20);
  });

  it('是否抽样按各自的上限算，不认任何一个写死的数', () => {
    // 10 个启用的候选：上限 8 要抽样，上限 12 全部上盘。
    const csvText = roster(10);
    const eight = makeSession({ csvText, cap: 8 });
    const twelve = makeSession({ csvText, cap: 12 });

    expect(eight.isSampled).toBe(true);
    expect(eight.lineup).toHaveLength(8);
    expect(twelve.isSampled).toBe(false);
    expect(twelve.lineup).toHaveLength(10);
  });

  it('换一批也照当前的上限抽，且只在抽样时才换得动', () => {
    const csvText = roster(10);
    const eight = makeSession({ csvText, cap: 8, random: seededRandom(7) });
    const twelve = makeSession({ csvText, cap: 12, random: seededRandom(7) });

    const beforeTwelve = names(twelve.lineup);
    twelve.reshuffle();
    // 10 ≤ 12：没什么可换的，上盘名单一动不动。
    expect(names(twelve.lineup)).toEqual(beforeTwelve);

    for (let round = 0; round < 20; round += 1) {
      eight.reshuffle();
      expect(eight.lineup).toHaveLength(8);
      expect(new Set(names(eight.lineup)).size).toBe(8);
      for (const name of names(eight.lineup)) {
        expect(rosterNames(10)).toContain(name);
      }
    }
  });

  it('上限扫一遍：上盘名单的长度是上限与启用数中的小者', () => {
    for (const cap of [1, 2, 3, 5, 8, 12, 20]) {
      for (const enabledCount of [1, 4, 8, 13, 25]) {
        const current = makeSession({
          csvText: roster(enabledCount),
          cap,
          random: seededRandom(cap * 100 + enabledCount),
        });
        expect(current.lineup).toHaveLength(Math.min(cap, enabledCount));
        expect(current.isSampled).toBe(enabledCount > cap);
        expect(new Set(names(current.lineup)).size).toBe(Math.min(cap, enabledCount));
      }
    }
  });

  it('上限不影响解析、状态与计数', () => {
    for (const cap of [1, 8, 12]) {
      expect(makeSession({ csvText: '', cap }).status).toBe('empty-file');
      expect(makeSession({ csvText: csv('沙县小吃,false'), cap }).status).toBe('all-disabled');
      expect(makeSession({ csvText: csv('"没关引号,true'), cap }).status).toBe('parse-error');

      const ok = makeSession({ csvText: csv('沙县小吃,true', '关门大吉,false'), cap });
      expect(ok.status).toBe('ok');
      expect(ok.enabledCount).toBe(1);
      expect(ok.disabledCount).toBe(1);
    }
  });
});
