import { describe, it, expect } from 'vitest';
import { detailOf, kindOf } from './journal.js';

describe('play journal entries', () => {
  it('reads the game and status from the payload', () => {
    const d = detailOf('status_changed', 'Trent marked "Hades" as Beaten', { gameId: 'g1', title: 'Hades', coverImageUrl: null, status: 'done' });
    expect(d).toMatchObject({ gameId: 'g1', title: 'Hades', status: 'done' });
    expect(kindOf('status_changed', d.status)).toBe('beaten');
  });

  it('reads an entry logged before payloads back out of its sentence', () => {
    const d = detailOf('status_changed', 'Trent marked "Baldur\'s Gate 3" as Playing', null);
    expect(d).toMatchObject({ gameId: null, title: "Baldur's Gate 3", status: 'playing' });
    expect(kindOf('status_changed', d.status)).toBe('started');
    expect(detailOf('status_changed', 'Sam marked "Celeste" as Play Next', null).status).toBe('play_next');
    expect(kindOf('status_changed', 'play_next')).toBe('moved');
  });

  it('names added, spin and review entries by their type', () => {
    expect(kindOf('game_added', 'backlog')).toBe('added');
    expect(kindOf('spin_result', 'playing')).toBe('spin');
    expect(kindOf('game_reviewed', 'done')).toBe('reviewed');
    expect(detailOf('spin_result', 'The room voted to respin the wheel', null).title).toBeNull();
  });
});
