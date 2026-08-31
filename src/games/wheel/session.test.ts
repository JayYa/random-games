import { describe, expect, it } from 'vitest';
import { createWheelSession, MAX_SECTORS } from './session';

const TAU = Math.PI * 2;

/** 一个可预测的随机源：按顺序吐出给定的数，用完后从头循环。不碰全局 Math.random。 */
function scriptedRandom(values: number[]): () => number {
  let cursor = 0;
  return () => {
    const value = values[cursor % values.length]!;
    cursor += 1;
    return value;
  };
}

function names(lineup: readonly { name: string }[]): string[] {
  return lineup.map((candidate) => candidate.name);
}

function csv(...lines: string[]): string {
  return lines.join('\n');
}

/** 生成 n 个启用的候选。 */
function roster(count: number): string {
  return Array.from({ length: count }, (_, i) => `店${i + 1},true`).join('\n');
}

describe('解析名单', () => {
  it('读出普通行的名字', () => {
    const session = createWheelSession({ csvText: csv('沙县小吃,true', '兰州拉面,true') });
    expect(names(session.lineup)).toEqual(['沙县小吃', '兰州拉面']);
    expect(session.error).toBeUndefined();
  });

  it('双引号包裹的名字可以含逗号', () => {
    const session = createWheelSession({ csvText: csv('"老王烧烤, 二店",true') });
    expect(names(session.lineup)).toEqual(['老王烧烤, 二店']);
  });

  it('双写引号是一个引号', () => {
    const session = createWheelSession({ csvText: csv('"老王""烧烤""",true') });
    expect(names(session.lineup)).toEqual(['老王"烧烤"']);
  });

  it('跳过空行与 # 注释行', () => {
    const session = createWheelSession({
      csvText: csv('# name,enabled', '', '沙县小吃,true', '   ', '# 下面是新店', '兰州拉面,true'),
    });
    expect(names(session.lineup)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it('缺少 enabled 列算启用', () => {
    const session = createWheelSession({ csvText: csv('沙县小吃', '兰州拉面,') });
    expect(names(session.lineup)).toEqual(['沙县小吃', '兰州拉面']);
  });

  it.each(['false', 'FALSE', ' False ', '0', 'no', 'NO', 'No'])('%s 算停用', (marker) => {
    const session = createWheelSession({ csvText: csv(`沙县小吃,${marker}`, '兰州拉面,true') });
    expect(names(session.lineup)).toEqual(['兰州拉面']);
    expect(session.enabledCount).toBe(1);
  });

  it.each(['true', 'yes', '1', 'y', '随便写点什么', ' '])('%s 算启用', (marker) => {
    const session = createWheelSession({ csvText: csv(`沙县小吃,${marker}`) });
    expect(names(session.lineup)).toEqual(['沙县小吃']);
  });

  it('停用的候选不进入上盘名单', () => {
    const session = createWheelSession({
      csvText: csv('沙县小吃,true', '关门大吉,false', '兰州拉面,no'),
    });
    expect(names(session.lineup)).toEqual(['沙县小吃']);
    expect(session.enabledCount).toBe(1);
  });
});

describe('解析错误', () => {
  it('坏行报出的行号与文件原始行号一致', () => {
    const session = createWheelSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.error).toContain('第 2 行');
    expect(session.lineup).toEqual([]);
  });

  it('文件前部有空行和注释时行号依然正确', () => {
    const session = createWheelSession({
      csvText: csv('# name,enabled', '', '沙县小吃,true', '', '# 备注', '"没关引号,true'),
    });
    expect(session.error).toContain('第 6 行');
  });

  it('前部有整段注释与空行时，行号仍指向文件里的那一行', () => {
    // 照着 public/eat.csv 的样子：文件开头是一大段说明注释和空行，
    // 真正的第一条记录在第 11 行，坏行在第 13 行。
    const session = createWheelSession({
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
      const session = createWheelSession({ csvText: csv(...rows) });
      expect(session.error).toContain(`第 ${badLine} 行`);
    }
  });

  it('CRLF 换行不会让行号错位', () => {
    const session = createWheelSession({
      csvText: ['# 注释', '', '沙县小吃,true', '"没关引号,true'].join('\r\n'),
    });
    expect(session.error).toContain('第 4 行');
  });

  it('缺少名字的行也报出原始行号', () => {
    const session = createWheelSession({
      csvText: csv('# 注释', '', '沙县小吃,true', ',true'),
    });
    expect(session.error).toContain('第 4 行');
  });

  it('缺少名字的错误说得出是哪一行、这一行写了什么、该怎么改', () => {
    // 一个手滑的逗号会让整页变成错误提示，那这条提示就得让人一眼知道去改哪里。
    const session = createWheelSession({
      csvText: csv('# 注释', '沙县小吃,true', ',true'),
    });
    expect(session.error).toContain('第 3 行');
    expect(session.error).toContain('名字');
    expect(session.error).toContain(',true');
  });

  it('引号闭合后有多余内容也算坏行', () => {
    const session = createWheelSession({
      csvText: csv('# 注释', '沙县小吃,true', '"老王烧烤" 二店,true'),
    });
    expect(session.error).toContain('第 3 行');
  });

  it('有多个坏行时报的是第一个', () => {
    const session = createWheelSession({
      csvText: csv('沙县小吃,true', '"坏一,true', '兰州拉面,true', '"坏二,true'),
    });
    expect(session.error).toContain('第 2 行');
    expect(session.error).not.toContain('第 4 行');
  });

  it('坏行让上盘名单为空且状态是 parse-error', () => {
    const session = createWheelSession({ csvText: csv('沙县小吃,true', '"没关引号,true') });
    expect(session.status).toBe('parse-error');
    expect(session.lineup).toEqual([]);
    expect(session.enabledCount).toBe(0);
  });
});

describe('转不起来的三种名单状态', () => {
  it('空文件解析成功，状态是 empty-file', () => {
    const session = createWheelSession({ csvText: '' });
    expect(session.error).toBeUndefined();
    expect(session.status).toBe('empty-file');
    expect(session.lineup).toEqual([]);
    expect(session.enabledCount).toBe(0);
    expect(session.disabledCount).toBe(0);
  });

  it('只剩空行与注释的文件同样是 empty-file', () => {
    const session = createWheelSession({
      csvText: csv('# 名单说明', '', '   ', '# 这里本来有几家店'),
    });
    expect(session.status).toBe('empty-file');
    expect(session.disabledCount).toBe(0);
  });

  it('全部停用的名单状态是 all-disabled，且数得出停用了几家', () => {
    const session = createWheelSession({
      csvText: csv('沙县小吃,false', '兰州拉面,0', '黄焖鸡,no'),
    });
    expect(session.error).toBeUndefined();
    expect(session.status).toBe('all-disabled');
    expect(session.enabledCount).toBe(0);
    expect(session.disabledCount).toBe(3);
  });

  it('空文件与全部停用是两个可区分的状态', () => {
    const emptyFile = createWheelSession({ csvText: '' });
    const allDisabled = createWheelSession({ csvText: csv('沙县小吃,false', '兰州拉面,0') });

    // 两者的上盘名单都是空的，光看上盘名单分辨不出来——所以状态必须不同。
    expect(emptyFile.lineup).toEqual([]);
    expect(allDisabled.lineup).toEqual([]);
    expect(emptyFile.status).not.toBe(allDisabled.status);
    expect(emptyFile.disabledCount).toBe(0);
    expect(allDisabled.disabledCount).toBe(2);
  });

  it('解析失败、空文件、全部停用三者的状态互不相同', () => {
    const broken = createWheelSession({ csvText: '"沙县小吃,false' });
    const emptyFile = createWheelSession({ csvText: '\n\n# 只有注释\n' });
    const allDisabled = createWheelSession({ csvText: csv('沙县小吃,false') });
    const ok = createWheelSession({ csvText: csv('沙县小吃,true') });

    const states = [broken.status, emptyFile.status, allDisabled.status, ok.status];
    expect(new Set(states).size).toBe(4);
    expect(broken.error).toBeDefined();
    expect(emptyFile.error).toBeUndefined();
    expect(allDisabled.error).toBeUndefined();
  });

  it('名单好的时候状态是 ok', () => {
    const session = createWheelSession({ csvText: csv('沙县小吃,true', '关门大吉,false') });
    expect(session.status).toBe('ok');
    expect(session.enabledCount).toBe(1);
    expect(session.disabledCount).toBe(1);
  });
});

describe('上盘名单', () => {
  it('恰好 12 家时全部上盘且不是抽样', () => {
    const session = createWheelSession({ csvText: roster(12) });
    expect(session.lineup).toHaveLength(MAX_SECTORS);
    expect(session.isSampled).toBe(false);
    expect(session.enabledCount).toBe(12);
  });

  it('12 家及以下时换一批不改变上盘名单', () => {
    const session = createWheelSession({ csvText: roster(5), random: scriptedRandom([0.7]) });
    const before = names(session.lineup);
    session.reshuffle();
    expect(names(session.lineup)).toEqual(before);
  });

  it('13 家时抽 12 家上盘且是抽样', () => {
    const session = createWheelSession({ csvText: roster(13), random: scriptedRandom([0.4]) });
    expect(session.lineup).toHaveLength(MAX_SECTORS);
    expect(session.isSampled).toBe(true);
    expect(session.enabledCount).toBe(13);
  });

  it('抽样得到的上盘名单没有重复', () => {
    const session = createWheelSession({
      csvText: roster(20),
      random: scriptedRandom([0.13, 0.87, 0.02, 0.55, 0.99, 0.31, 0.68]),
    });
    expect(new Set(names(session.lineup)).size).toBe(MAX_SECTORS);
  });

  it('需要抽样时，停用的候选也永远不进上盘名单', () => {
    // 20 家启用 + 8 家停用交错排列：无论重抽多少次，停用的名字都不该出现。
    const rows: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      rows.push(`店${i + 1},true`);
      if (i < 8) rows.push(`关门${i + 1},false`);
    }

    const session = createWheelSession({
      csvText: csv(...rows),
      random: scriptedRandom([0.03, 0.97, 0.41, 0.6, 0.19, 0.78, 0.5, 0.26, 0.91]),
    });
    expect(session.enabledCount).toBe(20);
    expect(session.isSampled).toBe(true);

    for (let round = 0; round < 30; round += 1) {
      expect(session.lineup).toHaveLength(MAX_SECTORS);
      for (const name of names(session.lineup)) {
        expect(name.startsWith('关门')).toBe(false);
      }
      session.reshuffle();
    }
  });

  it('给定随机序列下重抽产生预期的另一批', () => {
    // 随机源恒为 0：每次都取剩余候选中的第一家，于是上盘名单是前 12 家。
    const steady = createWheelSession({ csvText: roster(15), random: scriptedRandom([0]) });
    const firstTwelve = Array.from({ length: MAX_SECTORS }, (_, i) => `店${i + 1}`);
    expect(names(steady.lineup)).toEqual(firstTwelve);

    // 随机序列没变，重抽仍从完整的 15 家里抽——说明重抽是重新抽样，
    // 而不是在旧上盘名单上做增量。
    steady.reshuffle();
    expect(names(steady.lineup)).toEqual(firstTwelve);

    // 换一个随机序列，重抽给出确实不同的一批。
    const session = createWheelSession({
      csvText: roster(15),
      random: scriptedRandom([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.99]),
    });
    const before = names(session.lineup);
    session.reshuffle();
    const after = names(session.lineup);
    expect(after).toHaveLength(MAX_SECTORS);
    expect(after).not.toEqual(before);
  });

  it('同一随机序列下重抽的结果可复现', () => {
    const seed = [0.62, 0.11, 0.94, 0.37, 0.5, 0.08, 0.73, 0.29, 0.86];
    const a = createWheelSession({ csvText: roster(18), random: scriptedRandom(seed) });
    const b = createWheelSession({ csvText: roster(18), random: scriptedRandom(seed) });
    expect(names(a.lineup)).toEqual(names(b.lineup));
    a.reshuffle();
    b.reshuffle();
    expect(names(a.lineup)).toEqual(names(b.lineup));
  });

  it('抽样后反复 spin() 也不会改变上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(30),
      random: scriptedRandom([0.17, 0.83, 0.44, 0.09, 0.66, 0.28, 0.95]),
    });
    expect(session.isSampled).toBe(true);
    const before = names(session.lineup);
    for (let i = 0; i < 50; i += 1) {
      session.spin();
      expect(names(session.lineup)).toEqual(before);
    }
  });
});

describe('转一次', () => {
  it('反复调用 spin() 不改变上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(6),
      random: scriptedRandom([0.05, 0.31, 0.87, 0.42, 0.63]),
    });
    const before = names(session.lineup);
    for (let i = 0; i < 20; i += 1) session.spin();
    expect(names(session.lineup)).toEqual(before);
  });

  it('给定随机数确定地选出预期的中选候选', () => {
    const csvText = csv('沙县小吃,true', '兰州拉面,true', '黄焖鸡,true', '肯德基,true');
    // 第一次 random 选扇区：floor(r * 4)
    expect(
      createWheelSession({ csvText, random: scriptedRandom([0.0, 0.3]) }).spin().winner.name,
    ).toBe('沙县小吃');
    expect(
      createWheelSession({ csvText, random: scriptedRandom([0.3, 0.3]) }).spin().winner.name,
    ).toBe('兰州拉面');
    expect(
      createWheelSession({ csvText, random: scriptedRandom([0.6, 0.3]) }).spin().winner.name,
    ).toBe('黄焖鸡');
    expect(
      createWheelSession({ csvText, random: scriptedRandom([0.99, 0.3]) }).spin().winner.name,
    ).toBe('肯德基');
  });

  it('随机数取到 1 的边界时不会越出上盘名单', () => {
    const session = createWheelSession({
      csvText: roster(3),
      random: scriptedRandom([0.999999999999, 0.3]),
    });
    expect(session.spin().winner.name).toBe('店3');
  });

  // 角度反算是这个项目唯一会算错且肉眼极难发现的地方：扫过全部下标，
  // 尤其是第一个和最后一个扇区（跨 0 度边界处）。
  for (const size of [1, 2, 3, 5, 12]) {
    for (let index = 0; index < size; index += 1) {
      for (const offsetSeed of [0, 0.25, 0.5, 0.75, 0.999999]) {
        it(`${size} 个扇区时，第 ${index + 1} 个扇区的目标角度落在该扇区内 (offset=${offsetSeed})`, () => {
          const indexSeed = (index + 0.5) / size;
          const session = createWheelSession({
            csvText: roster(size),
            random: scriptedRandom([indexSeed, offsetSeed]),
          });
          const { winner, targetAngle } = session.spin();

          const sectorAngle = TAU / size;
          const winnerIndex = names(session.lineup).indexOf(winner.name);
          expect(winnerIndex).toBe(index);

          expect(targetAngle).toBeGreaterThanOrEqual(winnerIndex * sectorAngle);
          expect(targetAngle).toBeLessThan((winnerIndex + 1) * sectorAngle);
          expect(targetAngle).toBeGreaterThanOrEqual(0);
          expect(targetAngle).toBeLessThan(TAU);
        });
      }
    }
  }

  it('落点始终在扇区内部，离两条边界都有余量', () => {
    // 指针有实际宽度：落点贴着扇区边界时，肉眼说不清转出的是哪一家（故事 4）。
    // 这里要的是"离边界有余量"这条性质，所以只钉一个宽松的下限（扇区的 5%），
    // 不去钉实现里那条具体的映射带。
    const margin = 0.05;
    for (const size of [1, 2, 3, 5, 12]) {
      const sectorAngle = TAU / size;
      for (let index = 0; index < size; index += 1) {
        for (let step = 0; step <= 20; step += 1) {
          const session = createWheelSession({
            csvText: roster(size),
            random: scriptedRandom([(index + 0.5) / size, Math.min(step / 20, 0.999999)]),
          });
          const { targetAngle } = session.spin();
          const withinSector = targetAngle - index * sectorAngle;
          expect(withinSector).toBeGreaterThanOrEqual(margin * sectorAngle);
          expect(withinSector).toBeLessThanOrEqual((1 - margin) * sectorAngle);
        }
      }
    }
  });

  it('落点不恰好等于扇区正中', () => {
    const size = 8;
    const sectorAngle = TAU / size;
    for (let index = 0; index < size; index += 1) {
      for (let step = 0; step <= 20; step += 1) {
        const session = createWheelSession({
          csvText: roster(size),
          random: scriptedRandom([(index + 0.5) / size, step / 20 - 1e-12]),
        });
        const { targetAngle } = session.spin();
        expect(targetAngle).not.toBe((index + 0.5) * sectorAngle);
      }
    }
  });
});
