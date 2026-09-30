/**
 * 渲染层：名单出问题时替掉整页的提示。薄，不测。
 *
 * 四种毛病（取不到文件、某行读不懂、没有候选、全部停用）共用一套版式。文案与玩法无关，
 * 一律说「候选」。
 */

import { escapeHtml } from './escapeHtml';
import { gamePage } from './gamePage';
import type { RosterSession, RosterStatus } from './rosterSession';
import type { Theme } from './themes';

/** 名单文件在仓库里的路径（`public/eat.csv`），区别于 `theme.rosterFile`（`eat.csv`）。 */
function rosterPath(theme: Theme): string {
  return `public/${theme.rosterFile}`;
}

interface FailureView {
  /** 沿用会话的状态名；`'load'` 是文件没取回来，还没轮到会话。 */
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

/** 名单文件没取回来（404、断网、服务器出错）。 */
export function showRosterLoadFailure(root: HTMLElement, theme: Theme, cause: unknown): void {
  const detail = cause instanceof Error ? cause.message : String(cause);
  renderFailure(root, theme, {
    kind: 'load',
    title: '名单文件没取到',
    detail: `读取 ${theme.rosterFile} 失败：${detail}`,
    hint: `确认 ${rosterPath(theme)} 确实在仓库里并且已经部署，然后刷新页面重试。`,
  });
}

/** 呈现名单毛病只需要会话里的这几样。 */
export type RosterFailureSource = Pick<RosterSession, 'status' | 'error' | 'disabledCount'>;

function rosterFailureView(session: RosterFailureSource, theme: Theme): FailureView | undefined {
  switch (session.status) {
    case 'parse-error':
      return {
        kind: 'parse-error',
        title: '名单里有一行读不懂',
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

/** 名单开不了抽时替掉整页；名单是好的时什么都不做。 */
export function showRosterFailure(
  root: HTMLElement,
  theme: Theme,
  session: RosterFailureSource,
): void {
  const failure = rosterFailureView(session, theme);
  if (failure) renderFailure(root, theme, failure);
}
