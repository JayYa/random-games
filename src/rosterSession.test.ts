/**
 * 名单会话的用例：解析、四种状态、抽一个中选、最近中选冷却。
 *
 * 这些都是玩法无关的性质——转盘和弹球机看到的是同一份名单逻辑。
 * 转盘的角度用例在 `games/wheel/session.test.ts`。
 */

import { describe, expect, it } from 'vitest';
import { createRosterSession, type RandomSource } from './rosterSession';
import type { RecentMemory } from './cooldown';
import { csv, fakeRecentMemory, roster, rosterNames, scriptedRandom, seededRandom } from './testHelpers';

function makeSession(options: { csvText: string; random?: RandomSource; recentWinners?: RecentMemory }) {
  return createRosterSession(options);
}

/**
 * 同一份名单、同一份最近中选下，各个种子各抽一次，抽出过的名字都在这里。
 *
 * 每个种子都从同一份最近中选起步——抽一次就会记下一个，接着抽冷却就变了，
 * 所以一个种子只抽一次。
 */
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
 * 名单会话眼里全部启用的候选，按 CSV 的书写顺序。
 *
 * 会话不把候选整列交出来，唯一看得见它们的口子是「抽一个中选」：把随机值扫过
 * 每一个下标、逐个抽出来，就是那一列。
 */
function enabledNames(csvText: string): string[] {
  let index = 0;
  const session = createRosterSession({
    csvText,
    random: () => (index + 0.5) / session.enabledCount,
  });
  return Array.from({ length: session.enabledCount }, (_, i) => {
    index = i;
    return session.drawWinner().name;
  });
}

describe('解析名单', () => {
  it('读出普通行的名字', () => {
    expect(enabledNames(csv('沙县小吃,true', '兰州拉面,true'))).toEqual(['沙县小吃', '兰州拉面']);
    expect(makeSession({ csvText: csv('沙县小吃,true') }).error).toBeUndefined();
  });

  it('双引号包裹的名字可以含逗号', () => {
    expect(enabledNames(csv('"老王烧烤, 二店",true'))).toEqual(['老王烧烤, 二店']);
  });

  it('双写引号是一个引号', () => {
    expect(enabledNames(csv('"老王""烧烤""",true'))).toEqual(['老王"烧烤"']);
  });

  it('跳过空行与 # 注释行', () => {
    const csvText = csv('# name,enabled', '', '沙县小吃,true', '   ', '# 下面是新店', '兰州拉面,true');
    expect(enabledNames(csvText)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('缺少 enabled 列算启用', () => {
    expect(enabledNames(csv('沙县小吃', '兰州拉面,'))).toEqual(['沙县小吃', '兰州拉面']);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'no', 'NO', 'No'])('%s 算停用', (marker) => {
    const csvText = csv(`沙县小吃,${marker}`, '兰州拉面,true');
    expect(enabledNames(csvText)).toEqual(['兰州拉面']);
    expect(makeSession({ csvText }).enabledCount).toBe(1);
  });

  it.each(['true', 'yes', '1', 'y', '随便写点什么', ' '])('%s 算启用', (marker) => {
    expect(enabledNames(csv(`沙县小吃,${marker}`))).toEqual(['沙县小吃']);
  });

  it('停用的候选不算在启用的候选里', () => {
    const csvText = csv('沙县小吃,true', '关门大吉,false', '兰州拉面,no');
    expect(enabledNames(csvText)).toEqual(['沙县小吃']);
    expect(makeSession({ csvText }).enabledCount).toBe(1);
  });
});

describe('解析错误', () => {
  it('坏行报出的行号与文件原始行号一致', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.error).toContain('第 2 行');
    expect(session.enabledCount).toBe(0);
  });

  it('文件前部有空行和注释时行号依然正确', () => {
    const session = makeSession({
      csvText: csv('# name,enabled', '', '沙县小吃,true', '', '# 备注', '"没关引号,true'),
    });
    expect(session.error).toContain('第 6 行');
  });

  it('前部有整段注释与空行时，行号仍指向文件里的那一行', () => {
    // 照着 public/ 下名单文件（如 breakfast.csv）的样子：文件开头是一大段说明注释和空行，
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

  it('坏行让启用的候选一个都不剩且状态是 parse-error', () => {
    const session = makeSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.status).toBe('parse-error');
    expect(session.enabledCount).toBe(0);
  });
});

describe('转不起来的三种名单状态', () => {
  it('空文件解析成功，状态是 empty-file', () => {
    const session = makeSession({ csvText: '' });
    expect(session.error).toBeUndefined();
    expect(session.status).toBe('empty-file');
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

    // 两者都一个启用的候选都没有，光看启用数分辨不出来——所以状态必须不同。
    expect(emptyFile.enabledCount).toBe(0);
    expect(allDisabled.enabledCount).toBe(0);
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

describe('抽一个中选', () => {
  it('只会抽到启用的候选', () => {
    // 启用与停用交错排列，随机值把 [0, 1) 扫一遍：停用的名字一次都不该出来。
    const session = makeSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,true', '停业,no', '黄焖鸡,true', '搬走了,0'),
      random: scriptedRandom(Array.from({ length: 50 }, (_, i) => i / 50)),
    });
    const drawn = new Set(Array.from({ length: 50 }, () => session.drawWinner().name));
    expect([...drawn].sort()).toEqual(['兰州拉面', '沙县小吃', '黄焖鸡'].sort());
  });

  it('注入的随机序列下抽到的是预期的那一个', () => {
    // 启用的候选按 CSV 的书写顺序排成一列，随机值乘上启用数取整就是下标。
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
    // 40 个启用的候选，多于转盘的 12 个扇区，也多于弹球机的 8 个落格。
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

  it('一个启用的候选都没有时抽不出来，直接报错', () => {
    // 这几种名单渲染层会给整页错误提示，根本走不到开抽；真走到了就是调用方的错。
    for (const csvText of ['', csv('沙县小吃,false'), csv('"没关引号,true')]) {
      expect(() => makeSession({ csvText }).drawWinner()).toThrow();
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
    // 3 个启用、4 个停用：冷却个数按启用数算，是 min(7, 3 − 1) = 2。
    const csvText = csv('沙县小吃,true', '停业,false', '兰州拉面,true', '搬走了,no', '黄焖鸡,true', '关门,0', '歇业,false');
    expect(sorted(drawableNames(csvText, ['黄焖鸡', '沙县小吃']))).toEqual(['兰州拉面']);
  });

  it('启用的候选不超过 7 个时只冷却「启用数 − 1」个，最早的先解冷', () => {
    // 5 个启用、最近中选按先后是 1 到 5：冷却最新的 4 个，最早的候选1 解冷。
    expect(sorted(drawableNames(roster(5), rosterNames(5)))).toEqual(['候选1']);
    // 3 个启用：只冷却最新的 2 个。
    expect(sorted(drawableNames(roster(3), ['候选3', '候选1', '候选2']))).toEqual(['候选3']);
  });

  it('冷却个数最多 7 个：更早的最近中选不再冷却', () => {
    // 最近中选里有 9 个：只有最新的 7 个（候选3 到 候选9）在冷却。
    const recent = rosterNames(9);
    expect(sorted(drawableNames(roster(10), recent))).toEqual(sorted(['候选1', '候选2', '候选10']));
  });

  it('只有一个启用的候选时照常抽出它', () => {
    const csvText = csv('关门大吉,false', '沙县小吃,true');
    expect(sorted(drawableNames(csvText, ['沙县小吃']))).toEqual(['沙县小吃']);
  });

  it('最近中选里的失效名字照旧占一格，不回溯补满', () => {
    // 3 个启用，冷却 2 格：最新的两个是「候选2」和一个名单里已经没有的名字。
    // 失效的名字占掉一格，所以更早的候选1 不冷却。
    expect(sorted(drawableNames(roster(3), ['候选1', '候选2', '改了名的']))).toEqual(sorted(['候选1', '候选3']));
  });

  it('停用了的名字同样照旧占一格', () => {
    const csvText = csv('候选1,true', '候选2,true', '候选3,false', '候选4,true');
    // 3 个启用，冷却 2 格：最新的两个是「候选2」和停用的「候选3」。
    expect(sorted(drawableNames(csvText, ['候选1', '候选2', '候选3']))).toEqual(sorted(['候选1', '候选4']));
  });

  it('名单里写重了的名字算一个候选，冷却不会把可抽的扣光', () => {
    // 两个不同的名字，冷却 min(7, 2 − 1) = 1 个：最新的沙县小吃冷却，兰州拉面照常抽得到。
    const csvText = csv('沙县小吃,true', '沙县小吃,true', '兰州拉面,true');
    expect(sorted(drawableNames(csvText, ['兰州拉面', '沙县小吃']))).toEqual(['兰州拉面']);
  });

  // 最近中选只留 7 个是存储适配的事，在 recentStorage.test.ts 里测；这里只看记下了谁。
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
