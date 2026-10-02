import { describe, expect, it } from 'vitest';
import { collectThemes, rosterFileName } from './index';

/**
 * 名单头部的说明文字。前半段照搬 `public/` 下名单的头部；后半段补几行宽松实现会误认的：
 * 键不在行首、键后跟全角冒号。
 */
const PROSE_HEADER = [
  '# 名单 (Roster)：每行一个候选，两列 name,enabled',
  '#',
  '# name    候选的名字。名字里有逗号时用双引号包起来，例如 "老王烧烤, 二店"；',
  '#         名字里要写双引号时，把它双写成 ""。',
  '# enabled 只有写 false / 0 / no（不区分大小写）才算停用，停用的候选永远不会中选；',
  '#         其余一切取值——包括留空和整列缺失——都算启用。',
  '#',
  '# 空行和 # 开头的注释行会被跳过，可以拿来给名单分组。',
  '# 说明里提到 entry: 这不是配置',
  '# 说明里提到 title: 这也不是配置',
  '# entry：全角冒号',
  '# title：全角冒号',
].join('\n');

describe('collectThemes', () => {
  it('两个键齐全的文件解析出完整主题', () => {
    const { themes, warnings } = collectThemes([
      {
        fileName: 'drink.csv',
        csvText: '# entry: 今天喝什么\n# title: 今天喝哪杯\n\n瑞幸,true\n',
      },
    ]);

    expect(themes).toEqual([
      {
        slug: 'drink',
        title: '今天喝哪杯',
        entryLabel: '今天喝什么',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('只写了 entry 的文件也能解析出主题，title 退回 entry', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'drink.csv', csvText: '# entry: 今天喝什么\n\n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([
      {
        slug: 'drink',
        title: '今天喝什么',
        entryLabel: '今天喝什么',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  // `result` 是已拿掉的旧键。
  it('还写着 # result: 的旧文件照常解析，那一行当散文跳过', () => {
    const { themes, warnings } = collectThemes([
      {
        fileName: 'drink.csv',
        csvText: '# entry: 今天喝什么\n# title: 今天喝哪杯\n# result: 今天就喝\n\n瑞幸,true\n',
      },
    ]);

    expect(themes).toEqual([
      {
        slug: 'drink',
        title: '今天喝哪杯',
        entryLabel: '今天喝什么',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('冒号后的首尾空白被裁掉', () => {
    const { themes } = collectThemes([
      { fileName: 'drink.csv', csvText: '#   entry:    今天喝什么   \n' },
    ]);

    expect(themes.map((theme) => theme.entryLabel)).toEqual(['今天喝什么']);
  });

  it.each([
    ['文件名含大写字母', 'Drink.csv'],
    ['文件名是中文', '喝的.csv'],
    ['文件名含空格', 'my drink.csv'],
    ['文件名含下划线', 'my_drink.csv'],
    ['文件名含其他符号', 'drink!.csv'],
    ['扩展名不是 .csv', 'drink.txt'],
  ])('%s 时这份文件被跳过，warning 指出文件名和原因', (_case, fileName) => {
    const { themes, warnings } = collectThemes([
      { fileName, csvText: '# entry: 今天喝什么\n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fileName).toBe(fileName);
    expect(warnings[0]?.reason).toContain('文件名');
  });

  it('缺 entry 的文件被跳过，warning 指出文件名和原因', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'drink.csv', csvText: '# title: 今天喝哪杯\n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fileName).toBe('drink.csv');
    expect(warnings[0]?.reason).toContain('entry');
  });

  // 叫人去补一行就在眼前的 `# entry:`，他会找不到该改哪。
  it('entry 写了键却没写值时被跳过，warning 说的是这一行没填值而不是没写', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'drink.csv', csvText: '# entry:   \n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fileName).toBe('drink.csv');
    expect(warnings[0]?.reason).toContain('冒号后面是空的');
    expect(warnings[0]?.reason).not.toContain('缺少');
  });

  it('同一个键写了多次时以先写的为准', () => {
    const { themes } = collectThemes([
      {
        fileName: 'drink.csv',
        csvText: '# entry: 今天喝什么\n# entry: 今天喝点啥\n# title: 今天喝哪杯\n# title: 今天喝哪一杯\n',
      },
    ]);

    expect(themes.map((theme) => theme.entryLabel)).toEqual(['今天喝什么']);
    expect(themes.map((theme) => theme.title)).toEqual(['今天喝哪杯']);
  });

  it('同一批次里一份坏文件不影响其他好文件', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'drink.csv', csvText: '# entry: 今天喝什么\n瑞幸,true\n' },
      { fileName: '喝的.csv', csvText: '# entry: 今天喝什么\n瑞幸,true\n' },
      { fileName: 'read.csv', csvText: '书\n' },
      { fileName: 'walk.csv', csvText: '# entry: 今天走哪条\n江边,true\n' },
    ]);

    expect(themes.map((theme) => theme.slug)).toEqual(['drink', 'walk']);
    expect(warnings.map((warning) => warning.fileName)).toEqual(['read.csv', '喝的.csv']);
  });

  // 说明被当成配置的话，改名单的人会莫名改坏首页入口。
  it('头部那段散文注释不会被误解析成元数据', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'eat.csv', csvText: `${PROSE_HEADER}\n\n肠粉,true\n` },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toEqual([
      { fileName: 'eat.csv', reason: expect.stringContaining('entry') },
    ]);
  });

  // 说明放在前面：放在后面的话，误解析会被「先写的为准」掩盖。
  it('散文注释和元数据同在一份文件里时只认元数据', () => {
    const { themes } = collectThemes([
      {
        fileName: 'eat.csv',
        csvText: `${PROSE_HEADER}\n# entry: 今天吃什么\n# title: 今天吃哪家\n\n肠粉,true\n`,
      },
    ]);

    expect(themes).toEqual([
      {
        slug: 'eat',
        title: '今天吃哪家',
        entryLabel: '今天吃什么',
      },
    ]);
  });

  it('空文件列表得到空清单和空 warnings', () => {
    expect(collectThemes([])).toEqual({ themes: [], warnings: [] });
  });

  it('多份文件按文件名字典序排列，与传入顺序无关', () => {
    const { themes } = collectThemes([
      { fileName: 'work.csv', csvText: '# entry: 今天干什么\n' },
      { fileName: 'eat.csv', csvText: '# entry: 今天吃什么\n' },
      { fileName: 'play.csv', csvText: '# entry: 今天玩什么\n' },
      { fileName: 'drink.csv', csvText: '# entry: 今天喝什么\n' },
    ]);

    expect(themes.map((theme) => theme.slug)).toEqual(['drink', 'eat', 'play', 'work']);
  });

  it('被发现的主题问回来的名单文件就是它来源的那份', () => {
    const fileNames = ['drink.csv', 'go-out.csv', 'day2.csv'];
    const { themes } = collectThemes(
      fileNames.map((fileName) => ({ fileName, csvText: '# entry: 今天做什么\n' })),
    );

    expect(themes.map(rosterFileName)).toEqual([...fileNames].sort());
  });
});
