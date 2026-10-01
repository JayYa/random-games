/**
 * 地址：三种写法（首页 `#/`、`#/<主题>`、`#/<主题>/<玩法>`，ADR-0005、ADR-0007）的写和认
 * 都只在这里。认地址只在传入的清单里认，不读模块全局。
 */

import type { Game } from './games';
import type { Theme } from './themes';

export type Address =
  | { readonly kind: 'picker'; readonly canonical: boolean }
  | { readonly kind: 'pending-roll'; readonly theme: Theme }
  | { readonly kind: 'settled'; readonly theme: Theme; readonly game: Game };

const PREFIX = '#/';

/** 站点不记住上次选的主题，根地址永远落在选主题页（ADR-0005）。 */
export const THEME_PICKER_HASH = PREFIX;

export function themeHash(theme: Theme): string {
  return `${PREFIX}${theme.slug}`;
}

export function gameHash(theme: Theme, game: Game): string {
  return `${PREFIX}${theme.slug}/${game.slug}`;
}

/** 认不出的回落首页，并由调用方改写成标准写法。 */
const UNRECOGNIZED: Address = { kind: 'picker', canonical: false };

export function resolveAddress(
  hash: string,
  themes: readonly Theme[],
  games: readonly Game[],
): Address {
  if (hash === '' || hash === THEME_PICKER_HASH) return { kind: 'picker', canonical: true };
  if (!hash.startsWith(PREFIX)) return UNRECOGNIZED;

  const segments = hash.slice(PREFIX.length).split('/');
  if (segments.length > 2) return UNRECOGNIZED;
  const [themeSlug, gameSlug] = segments;

  const theme = themes.find((candidate) => candidate.slug === themeSlug);
  if (!theme) return UNRECOGNIZED;
  if (gameSlug === undefined) return { kind: 'pending-roll', theme };

  const game = games.find((candidate) => candidate.slug === gameSlug);
  if (!game) return UNRECOGNIZED;
  return { kind: 'settled', theme, game };
}
