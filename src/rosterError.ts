/**
 * 名单错误 (Roster Error)：一个主题的名单开不了抽的原因，只有四种——没取到、读不懂、空、
 * 全部停用。
 *
 * 名单错误是普通的数据值，不是异常，不会被抛出：它带着种类和画错误页要用的结构化数据，
 * 不带现成的句子。把它写成标题、说明、提示的只有这里的 `describeRosterError`，文案与玩法
 * 无关，一律说「候选」。
 */

import type { Theme } from './themes';

/** 种类取值就是错误页上的 `data-error-kind`。 */
export type RosterError =
  /** 名单文件没取回来（404、断网、服务器出错）。还没轮到名单会话。 */
  | { readonly kind: 'load'; readonly cause: unknown }
  /** 引号未闭合或引号外有多余内容。`line` 按文件原始行算。 */
  | { readonly kind: 'parse-error'; readonly line: number; readonly reason: 'bad-quote' }
  /** 第一个逗号前面是空的。`text` 是那一行去掉首尾空白的原文。 */
  | {
      readonly kind: 'parse-error';
      readonly line: number;
      readonly reason: 'missing-name';
      readonly text: string;
    }
  /** 一条候选都没有：文件是空的，或者只剩空行和注释。 */
  | { readonly kind: 'empty-file' }
  /** 有候选，但全部停用。 */
  | { readonly kind: 'all-disabled'; readonly disabledCount: number };

/** 错误页上的三段文字。 */
export interface RosterErrorText {
  readonly title: string;
  readonly detail: string;
  readonly hint: string;
}

/** 名单文件在仓库里的路径（`public/eat.csv`），区别于 `theme.rosterFile`（`eat.csv`）。 */
function rosterPath(theme: Theme): string {
  return `public/${theme.rosterFile}`;
}

export function describeRosterError(theme: Theme, error: RosterError): RosterErrorText {
  switch (error.kind) {
    case 'load': {
      const { cause } = error;
      const reason = cause instanceof Error ? cause.message : String(cause);
      return {
        title: '名单文件没取到',
        detail: `读取 ${theme.rosterFile} 失败：${reason}`,
        hint: `确认 ${rosterPath(theme)} 确实在仓库里并且已经部署，然后刷新页面重试。`,
      };
    }
    case 'parse-error':
      return {
        title: '名单里有一行读不懂',
        detail:
          error.reason === 'bad-quote'
            ? `第 ${error.line} 行格式有误：引号未闭合或引号外有多余内容`
            : `第 ${error.line} 行没有名字：这一行是「${error.text}」，第一个逗号前面是空的。` +
              `把名字补在这一行开头（写成「名字,true」的样子），或者把整行删掉。`,
        hint: `打开 ${rosterPath(theme)}，按上面说的行号改掉那一行，再刷新页面。`,
      };
    case 'empty-file':
      return {
        title: '名单是空的',
        detail: `${rosterPath(theme)} 里一条候选记录都没有——文件是空的，或者只剩空行和 # 注释。`,
        hint: '在文件里加上几行「名字,true」再刷新页面。',
      };
    case 'all-disabled':
      return {
        title: '名单里的候选全部停用',
        detail: `名单里的 ${error.disabledCount} 个候选全都写了 false / 0 / no，一个都没启用，盘面上没东西可放。`,
        hint: '把想要的那几个的 enabled 列改成 true，再刷新页面。',
      };
  }
}
