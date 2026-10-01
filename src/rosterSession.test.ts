/** 名单会话的用例：解析、四种结果、抽中选、冷却。 */

import { describe, expect, it } from 'vitest';
import { createRosterSession, type RandomSource } from './rosterSession';
import type { RecentMemory } from './cooldown';
import { csv, fakeRecentMemory, roster, rosterNames, scriptedRandom, seededRandom } from './testHelpers';

interface SessionOptions {
  csvText: string;
  random?: RandomSource;
  recentWinners?: RecentMemory;
}

/** 能开抽的会话；名单开不了抽时让用例当场失败。 */
function makeSession(options: SessionOptions) {
  const session = createRosterSession(options);
  if (!session.ok) throw new Error(`名单应当能开抽，却交回了 ${JSON.stringify(session.error)}`);
  return session;
}

/** 开不了抽时交回的名单错误；名单能开抽时让用例当场失败。 */
function rosterErrorOf(csvText: string) {
  const session = createRosterSession({ csvText });
  if (session.ok) throw new Error('名单应当开不了抽');
  return session.error;
}

/** 每个种子从同一份最近中选起各抽一次，交回抽出过的名字。只抽一次，因为抽完冷却就变了。 */
function drawableNames(csvText: string, recent: readonly string[], seeds = 200): Set<string> {
  const drawn = new Set<string>();
  for (let seed = 1; seed <= seeds; seed += 1) {
    const session = makeSession({
      csvText,
      random: seededRandom(seed),
      recentWinners: fakeRecentMemory(recent),
    });
    drawn.add(session.drawWinner().name);
  }
  return drawn;
}

function sorted(names: Iterable<string>): string[] {
  return [...names].sort();
}

/**
 * 全部启用的候选，按书写顺序。会话不交出候选列表，只能让随机值扫过每个下标逐个抽出；
 * `count` 是用例造名单时写下的启用个数。
 */
function enabledNames(csvText: string, count: number): string[] {
  let index = 0;
  const session = makeSession({ csvText, random: () => (index + 0.5) / count });
  return Array.from({ length: count }, (_, i) => {
    index = i;
    return session.drawWinner().name;
  });
}

describe('解析名单', () => {
  it('读出普通行的名字', () => {
    expect(enabledNames(csv('沙县小吃,true', '兰州拉面,true'), 2)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('双引号包裹的名字可以含逗号', () => {
    expect(enabledNames(csv('"老王烧烤, 二店",true'), 1)).toEqual(['老王烧烤, 二店']);
  });

  it('双写引号是一个引号', () => {
    expect(enabledNames(csv('"老王""烧烤""",true'), 1)).toEqual(['老王"烧烤"']);
  });

  it('跳过空行与 # 注释行', () => {
    const csvText = csv('# name,enabled', '', '沙县小吃,true', '   ', '# 下面是新店', '兰州拉面,true');
    expect(enabledNames(csvText, 2)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('缺少 enabled 列算启用', () => {
    expect(enabledNames(csv('沙县小吃', '兰州拉面,'), 2)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'no', 'NO', 'No'])('%s 算停用', (marker) => {
    const csvText = csv(`沙县小吃,${marker}`, '兰州拉面,true');
    expect(enabledNames(csvText, 1)).toEqual(['兰州拉面']);
  });

  it.each(['true', 'yes', '1', 'y', '随便写点什么', ' '])('%s 算启用', (marker) => {
    expect(enabledNames(csv(`沙县小吃,${marker}`), 1)).toEqual(['沙县小吃']);
  });

  it('停用的候选不算在启用的候选里', () => {
    const csvText = csv('沙县小吃,true', '关门大吉,false', '兰州拉面,no');
    expect(enabledNames(csvText, 1)).toEqual(['沙县小吃']);
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
    const sessions = ['"沙县小吃,false', '\n\n# 只有注释\n', csv('沙县小吃,false')].map((csvText) =>
      createRosterSession({ csvText }),
    );
    const kinds = sessions.map((session) => (session.ok ? 'ok' : session.error.kind));
    expect(kinds).toEqual(['parse-error', 'empty-file', 'all-disabled']);
  });

  it('有一个启用的候选就能开抽，停用的不碍事', () => {
    expect(createRosterSession({ csvText: csv('沙县小吃,true', '关门大吉,false') }).ok).toBe(true);
  });
});

describe('抽一个中选', () => {
  it('只会抽到启用的候选', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,true', '停业,no', '黄焖鸡,true', '搬走了,0'),
      random: scriptedRandom(Array.from({ length: 50 }, (_, i) => i / 50)),
    });
    const drawn = new Set(Array.from({ length: 50 }, () => session.drawWinner().name));
    expect([...drawn].sort()).toEqual(['兰州拉面', '沙县小吃', '黄焖鸡'].sort());
  });

  it('注入的随机序列下抽到的是预期的那一个', () => {
    // 下标 = ⌊随机值 × 启用数⌋，按书写顺序。
    const session = makeSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,true', '黄焖鸡,true', '麻辣烫,true'),
      random: scriptedRandom([0, 0.3, 0.5, 0.99, 0.26]),
    });
    const drawn = Array.from({ length: 5 }, () => session.drawWinner().name);
    expect(drawn).toEqual(['沙县小吃', '兰州拉面', '黄焖鸡', '麻辣烫', '兰州拉面']);
  });

  it('random() 恰好返回 1 时抽到最后一个启用的候选，不越界', () => {
    const session = makeSession({
      csvText: csv('沙县小吃,true', '兰州拉面,true', '关门大吉,false'),
      random: scriptedRandom([1]),
    });
    expect(session.drawWinner()).toEqual({ name: '兰州拉面', enabled: true });
  });

  it('每个启用的候选都抽得到，不受任何盘面格数所限', () => {
    // 多于转盘的扇区数和弹球机的落格数。
    const count = 40;
    const session = makeSession({
      csvText: roster(count),
      random: scriptedRandom(Array.from({ length: count }, (_, i) => (i + 0.5) / count)),
    });
    const drawn = Array.from({ length: count }, () => session.drawWinner().name);
    expect(drawn).toEqual(rosterNames(count));
  });

  it('只有一个启用的候选时总是它', () => {
    const session = makeSession({
      csvText: csv('关门大吉,false', '沙县小吃,true'),
      random: scriptedRandom([0, 0.42, 0.99, 1]),
    });
    for (let i = 0; i < 4; i += 1) {
      expect(session.drawWinner().name).toBe('沙县小吃');
    }
  });
});

describe('最近中选冷却', () => {
  it('冷却中的候选抽不出来，其余启用的候选都抽得到', () => {
    const recent = rosterNames(7);
    expect(sorted(drawableNames(roster(10), recent))).toEqual(sorted(['候选8', '候选9', '候选10']));
  });

  it('不在冷却中的候选按书写顺序排成一列，等概率取下标', () => {
    const session = makeSession({
      csvText: roster(5),
      random: scriptedRandom([0.5]),
      recentWinners: fakeRecentMemory(['候选2', '候选4']),
    });
    // 剩下「候选1、候选3、候选5」，0.5 落在正中那一个。
    expect(session.drawWinner().name).toBe('候选3');
  });

  it('停用的候选不算进可抽的个数', () => {
    // 可抽总数 3，最多冷却 3 − 1 = 2 个，两个都冷却。
    const csvText = csv('沙县小吃,true', '停业,false', '兰州拉面,true', '搬走了,no', '黄焖鸡,true', '关门,0', '歇业,false');
    expect(sorted(drawableNames(csvText, ['黄焖鸡', '沙县小吃']))).toEqual(['兰州拉面']);
  });

  it('最近中选多过「启用数 − 1」个时只冷却最新的「启用数 − 1」个，最早的先解冷', () => {
    // 冷却最新的 4 个。
    expect(sorted(drawableNames(roster(5), rosterNames(5)))).toEqual(['候选1']);
    // 冷却最新的 2 个。
    expect(sorted(drawableNames(roster(3), ['候选3', '候选1', '候选2']))).toEqual(['候选3']);
  });

  it('只有一个启用的候选时照常抽出它', () => {
    const csvText = csv('关门大吉,false', '沙县小吃,true');
    expect(sorted(drawableNames(csvText, ['沙县小吃']))).toEqual(['沙县小吃']);
  });

  it('最近中选里的失效名字照旧占一格，不回溯补满', () => {
    // 冷却 2 格，被「候选2」和失效的名字占满。
    expect(sorted(drawableNames(roster(3), ['候选1', '候选2', '改了名的']))).toEqual(sorted(['候选1', '候选3']));
  });

  it('停用了的名字同样照旧占一格', () => {
    const csvText = csv('候选1,true', '候选2,true', '候选3,false', '候选4,true');
    // 冷却 2 格，被「候选2」和停用的「候选3」占满。
    expect(sorted(drawableNames(csvText, ['候选1', '候选2', '候选3']))).toEqual(sorted(['候选1', '候选4']));
  });

  it('名单里写重了的名字算一个候选，冷却不会把可抽的扣光', () => {
    // 两个不同的名字，最多冷却 2 − 1 = 1 个。
    const csvText = csv('沙县小吃,true', '沙县小吃,true', '兰州拉面,true');
    expect(sorted(drawableNames(csvText, ['兰州拉面', '沙县小吃']))).toEqual(['兰州拉面']);
  });

  // 只留几个归存储适配，见 recentStorage.test.ts。
  it('每抽一次都把中选按先后记进最近中选', () => {
    const memory = fakeRecentMemory(['候选1']);
    const session = makeSession({ csvText: roster(10), random: seededRandom(7), recentWinners: memory });
    const drawn = Array.from({ length: 3 }, () => session.drawWinner().name);
    expect(memory.names).toEqual(['候选1', ...drawn]);
  });

  it('候选够多时连抽 8 次都不重复', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const session = makeSession({
        csvText: roster(10),
        random: seededRandom(seed),
        recentWinners: fakeRecentMemory(),
      });
      const drawn = Array.from({ length: 8 }, () => session.drawWinner().name);
      expect(new Set(drawn).size).toBe(8);
    }
  });

  it('只有两个启用的候选时轮流抽出', () => {
    const session = makeSession({
      csvText: roster(2),
      random: seededRandom(3),
      recentWinners: fakeRecentMemory(),
    });
    const drawn = Array.from({ length: 6 }, () => session.drawWinner().name);
    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i]).not.toBe(drawn[i - 1]);
    }
  });

  it('不注入记忆时没有冷却，同一个候选可以连着抽出', () => {
    const session = makeSession({ csvText: roster(3), random: scriptedRandom([0]) });
    expect([session.drawWinner().name, session.drawWinner().name]).toEqual(['候选1', '候选1']);
  });
});
