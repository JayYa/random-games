/**
 * 主题对应哪份名单文件：slug 加扩展名就是文件名。主题发现校验文件名、运行时拼取文件的地址、
 * 错误文案指路都用这里的规则。构建期列目录的 `src/rosterFiles.ts` 和 `vite.config.ts` 是 I/O
 * 适配器，自己知道文件在 `public/`、自己按 `.csv` 粗筛，不从这里取。
 */

import type { Theme } from './theme.ts';

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
