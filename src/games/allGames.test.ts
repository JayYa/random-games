import { describe, expect, it } from 'vitest';
import { GAMES } from './allGames';

describe('玩法清单', () => {
  it('slug 不重复', () => {
    expect(new Set(GAMES.map((game) => game.slug)).size).toBe(GAMES.length);
  });

  it('每条记录都造得出盘面：HTML、块名、按钮上的字都不空', () => {
    for (const game of GAMES) {
      const board = game.createBoard();
      expect(board.html.trim(), game.slug).not.toBe('');
      expect(board.block, game.slug).not.toBe('');
      expect(board.closeLabel, game.slug).not.toBe('');
    }
  });
});
