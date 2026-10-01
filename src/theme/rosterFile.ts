/**
 * 主题对应哪份名单文件：只有这一条规则，主题发现认文件名、取文件、错误文案指路都从这里来。
 */

import type { Theme } from './index.ts';

/** 名单文件的扩展名，主名就是主题的 slug。 */
export const ROSTER_FILE_EXTENSION = '.csv';

/** 名单文件都放在仓库的这个目录下，部署后在站点根下。 */
const ROSTER_DIR = 'public';

/** 例如 `eat.csv`：`public/` 下的文件名，也是部署后相对站点根的地址。 */
export function rosterFileName(theme: Theme): string {
  return `${theme.slug}${ROSTER_FILE_EXTENSION}`;
}

/** 例如 `public/eat.csv`：写给改名单的人看，去仓库里找这份文件。 */
export function rosterRepoPath(theme: Theme): string {
  return `${ROSTER_DIR}/${rosterFileName(theme)}`;
}
