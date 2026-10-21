import { LOBBY_GAME_IDS, type LobbyGameSnapshot } from '@queueup/shared';
import { describe, expect, it } from 'vitest';
import { spin } from '../../i18n/locales/en/spin';
import { noWinnerHeadline } from './hud';

interface P {
  id: string;
  alive: boolean;
  solved?: boolean;
}

/** Just enough of a finished run for the card to read: who is in, the last result and the best so far. */
function over(id: string, players: P[], last: number, best: number): Pick<import('./scene').Scene, 'snapshot' | 'me'> {
  const snapshot = { id, phase: 'over', winnerId: null, players, history: [{ id: 'a', winnerId: null, meters: last, game: id }], best: { id: 'a', winnerId: null, meters: best, game: id } } as unknown as LobbyGameSnapshot;
  return { snapshot, me: 'a' };
}

describe('what the result card says when nobody won', () => {
  it('says "new best" for a solo run that is the best so far, and "run over" otherwise (never "nobody made it")', () => {
    expect(noWinnerHeadline(over('lava', [{ id: 'a', alive: false }], 241, 241))).toBe('spin.lobby.hud.newBest');
    expect(noWinnerHeadline(over('lava', [{ id: 'a', alive: false }], 100, 241))).toBe('spin.lobby.hud.soloOver');
  });

  it('says "time’s up" for a solo survival run that reached the cap, still alive', () => {
    expect(noWinnerHeadline(over('lava', [{ id: 'a', alive: true }], 100, 241))).toBe('spin.lobby.hud.timeUp');
  });

  it('does not call a smaller time a best (Quick draw is scored the other way)', () => {
    expect(noWinnerHeadline(over('draw', [{ id: 'a', alive: true }], 400, 400))).toBe('spin.lobby.hud.soloOver');
  });

  it('says "nobody made it" only when several players all went out', () => {
    expect(noWinnerHeadline(over('lava', [{ id: 'a', alive: false }, { id: 'b', alive: false }], 50, 50))).toBe('spin.lobby.hud.nobody');
  });

  it('says "time’s up" when several are still in at the cap, and "a draw" in a game of points', () => {
    expect(noWinnerHeadline(over('lava', [{ id: 'a', alive: true }, { id: 'b', alive: true }], 50, 50))).toBe('spin.lobby.hud.timeUp');
    expect(noWinnerHeadline(over('coins', [{ id: 'a', alive: true }, { id: 'b', alive: true }], 9, 9))).toBe('spin.lobby.hud.draw');
  });

  it('reads Words by whether anyone found the word', () => {
    expect(noWinnerHeadline(over('words', [{ id: 'a', alive: true, solved: true }], 40, 40))).toBe('spin.lobby.words.solved');
    expect(noWinnerHeadline(over('words', [{ id: 'a', alive: true }], 0, 40))).toBe('spin.lobby.words.nobody');
    expect(noWinnerHeadline(over('words', [{ id: 'a', alive: true }, { id: 'b', alive: true, solved: true }], 40, 40))).toBe('spin.lobby.hud.draw');
  });
});

describe('the description under the countdown', () => {
  it('has a hint line for every game, under the key the countdown looks it up by', () => {
    for (const id of LOBBY_GAME_IDS) expect(spin, id).toHaveProperty([`spin.lobby.${id}.hint`]);
  });
});
