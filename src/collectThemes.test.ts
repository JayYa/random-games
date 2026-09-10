import { describe, expect, it } from 'vitest';
import { collectThemes } from './collectThemes';

/** 现有 `public/eat.csv` 头部那段写给人读的说明，逐字照搬。 */
const PROSE_HEADER = [
  '# 名单 (Roster)：每行一个候选，两列 name,enabled',
  '#',
  '# name    候选的名字。名字里有逗号时用双引号包起来，例如 "老王烧烤, 二店"；',
  '#         名字里要写双引号时，把它双写成 ""。',
  '# enabled 只有写 false / 0 / no（不区分大小写）才算停用，停用的候选不上转盘；',
  '#         其余一切取值——包括留空和整列缺失——都算启用。',
  '#',
  '# 空行和 # 开头的注释行会被跳过，可以拿来给名单分组。',
  '# 改完这个文件推上去，刷新页面转盘就跟着变。下面是占位假数据，请直接替换。',
].join('\n');

describe('collectThemes', () => {
  it('三个键齐全的文件解析出完整主题', () => {
    const { themes, warnings } = collectThemes([
      {
        fileName: 'drink.csv',
        csvText: '# entry: 今天喝什么\n# title: 今天喝哪杯\n# result: 今天就喝\n\n瑞幸,true\n',
      },
    ]);

    expect(themes).toEqual([
      {
        slug: 'drink',
        rosterFile: 'drink.csv',
        title: '今天喝哪杯',
        entryLabel: '今天喝什么',
        resultPhrase: '今天就喝',
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it('只写了 entry 的文件也能解析出主题，title 退回 entry、result 退回中性说法', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'drink.csv', csvText: '# entry: 今天喝什么\n\n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([
      {
        slug: 'drink',
        rosterFile: 'drink.csv',
        title: '今天喝什么',
        entryLabel: '今天喝什么',
        resultPhrase: '今天就来',
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
      { fileName: 'drink.csv', csvText: '# title: 今天喝哪杯\n# result: 今天就喝\n瑞幸,true\n' },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fileName).toBe('drink.csv');
    expect(warnings[0]?.reason).toContain('entry');
  });

  // 「没写这一行」和「写了却没填值」都被跳过，但 warning 要说的不是同一件事：
  // 让人去补一行明明就在眼前的 `# entry:`，他找不到该改的地方（故事 10）。
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

  // 同一个键写了两次没有报错的必要，但总得定死认哪一个：先写的赢。
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

  // 名单头部那段说明是写给人读的，里面既有全角冒号也有 `name` 字样：
  // 它一旦被当成配置，改名单的人就会莫名其妙地改坏首页入口（故事 12）。
  it('头部那段散文注释不会被误解析成元数据', () => {
    const { themes, warnings } = collectThemes([
      { fileName: 'eat.csv', csvText: `${PROSE_HEADER}\n\n肠粉,true\n` },
    ]);

    expect(themes).toEqual([]);
    expect(warnings).toEqual([
      { fileName: 'eat.csv', reason: expect.stringContaining('entry') },
    ]);
  });

  it('散文注释和元数据同在一份文件里时只认元数据', () => {
    const { themes } = collectThemes([
      {
        fileName: 'eat.csv',
        csvText: `# entry: 今天吃什么\n# title: 今天吃哪家\n# result: 今天就吃\n${PROSE_HEADER}\n\n肠粉,true\n`,
      },
    ]);

    expect(themes).toEqual([
      {
        slug: 'eat',
        rosterFile: 'eat.csv',
        title: '今天吃哪家',
        entryLabel: '今天吃什么',
        resultPhrase: '今天就吃',
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
});
