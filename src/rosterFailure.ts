/**
 * 渲染层：名单出问题时的整页提示。薄，不测。
 *
 * 四种毛病——取不到文件、某行读不懂、文件里没有记录、全部停用——共用这一套版式，
 * 各自给出不同的标题、细节和下一步怎么改。它们一律替掉整个页面，
 * 绝不留一个空盘面让人以为是玩法本身坏了。
 *
 * 与玩法无关：名单坏了跟用哪个玩法摇没有关系，提示的说法也不该因此不同。
 * 文案一律中性（说「候选」，不说主题里的那个名词），也不提任何一种玩法（ADR-0005）。
 */

import { escapeHtml } from './escapeHtml';
import { gamePage } from './gamePage';
import type { LineupSession, RosterStatus } from './lineupSession';
import type { Theme } from './themes';

/**
 * 当前主题的名单文件在仓库里的路径，错误提示里要告诉人去改哪个文件。
 *
 * 叫 `rosterPath` 而不是 `rosterFile`：`theme.rosterFile` 是 `public/` 下的文件名
 * （`eat.csv`），这里给的是它在仓库里的位置（`public/eat.csv`）。同一条提示里两个
 * 都要出现，同名会让人以为它们是一个东西。
 */
function rosterPath(theme: Theme): string {
  return `public/${theme.rosterFile}`;
}

interface FailureView {
  /**
   * 区分错误种类的标记，也方便在 DOM 里一眼认出是哪一种。
   *
   * 三种名单毛病直接沿用会话的状态名，不另起一套叫法——否则两边迟早会各说各的。
   * `'load'` 是多出来的那一种：文件根本没取回来，还没轮到会话，所以它不是名单状态。
   */
  readonly kind: Exclude<RosterStatus, 'ok'> | 'load';
  readonly title: string;
  readonly detail: string;
  readonly hint: string;
}

function renderFailure(root: HTMLElement, theme: Theme, view: FailureView): void {
  root.innerHTML = gamePage(
    theme,
    `
      <div class="page__error" role="alert" data-error-kind="${view.kind}">
        <p class="page__error-title">${escapeHtml(view.title)}</p>
        <p class="page__error-detail">${escapeHtml(view.detail)}</p>
        <p class="page__error-hint">${escapeHtml(view.hint)}</p>
      </div>
    `,
  );
}

/**
 * 名单文件根本没取回来（404 / 断网 / 服务器出错）时的页面。
 *
 * 它和解析失败共用版式，但说的是另一回事：那边是文件读到了、某一行写坏了。
 */
export function showRosterLoadFailure(root: HTMLElement, theme: Theme, cause: unknown): void {
  const detail = cause instanceof Error ? cause.message : String(cause);
  renderFailure(root, theme, {
    kind: 'load',
    title: '名单文件没取到',
    detail: `读取 ${theme.rosterFile} 失败：${detail}`,
    hint: `确认 ${rosterPath(theme)} 确实在仓库里并且已经部署，然后刷新页面重试。`,
  });
}

/**
 * 名单里的毛病，只看会话里跟毛病有关的那几样。
 *
 * 收窄到这三个字段而不是收整个会话：呈现错误不需要知道上盘名单是什么、
 * 也不需要知道这是哪个玩法的会话。
 */
export type RosterFailureSource = Pick<LineupSession, 'status' | 'error' | 'disabledCount'>;

/** 文件取到了，但名单本身有毛病：三种情况各说各的。 */
function rosterFailureView(session: RosterFailureSource, theme: Theme): FailureView | undefined {
  switch (session.status) {
    case 'parse-error':
      return {
        kind: 'parse-error',
        title: '名单里有一行读不懂',
        // session.error 带的是文件中的原始行号和这一行到底哪里不对，照着去改就行。
        detail: session.error ?? '名单解析失败',
        hint: `打开 ${rosterPath(theme)}，按上面说的行号改掉那一行，再刷新页面。`,
      };
    case 'empty-file':
      return {
        kind: 'empty-file',
        title: '名单是空的',
        detail: `${rosterPath(theme)} 里一条候选记录都没有——文件是空的，或者只剩空行和 # 注释。`,
        hint: '在文件里加上几行「名字,true」再刷新页面。',
      };
    case 'all-disabled':
      return {
        kind: 'all-disabled',
        title: '名单里的候选全部停用',
        detail: `名单里的 ${session.disabledCount} 个候选全都写了 false / 0 / no，一个都没启用，盘面上没东西可放。`,
        hint: '把想要的那几个的 enabled 列改成 true，再刷新页面。',
      };
    default:
      return undefined;
  }
}

/**
 * 名单摇不起来时替掉整个页面，并回答「还要不要接着画盘面」。
 *
 * 每个玩法的挂载函数开头都问这一句：返回 `true` 表示页面已经换成错误提示了，
 * 直接 return；返回 `false` 表示这份名单是好的，可以往下画。
 */
export function showRosterFailure(
  root: HTMLElement,
  theme: Theme,
  session: RosterFailureSource,
): boolean {
  const failure = rosterFailureView(session, theme);
  if (!failure) return false;
  renderFailure(root, theme, failure);
  return true;
}
