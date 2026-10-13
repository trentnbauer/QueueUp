import { describe, expect, it } from 'vitest';
import { SpinLobby } from './spinLobby.js';

describe('SpinLobby votes', () => {
  it('needs more than half of the members in the lobby', () => {
    const lobby = new SpinLobby();
    ['a', 'b', 'c'].forEach((u) => lobby.join(u));
    expect(lobby.needed).toBe(2);
    lobby.vote('a', true);
    expect(lobby.votePassed).toBe(false);
    lobby.vote('b', true);
    expect(lobby.votePassed).toBe(true);
  });

  it('lets one person spin alone, and needs 3 of 4', () => {
    const solo = new SpinLobby();
    solo.join('a');
    solo.vote('a', true);
    expect(solo.votePassed).toBe(true);

    const four = new SpinLobby();
    ['a', 'b', 'c', 'd'].forEach((u) => four.join(u));
    expect(four.needed).toBe(3);
    four.vote('a', true);
    four.vote('b', true);
    expect(four.votePassed).toBe(false);
  });

  it('only counts members who are in the lobby, and drops a vote when its owner leaves', () => {
    const lobby = new SpinLobby();
    ['a', 'b', 'c'].forEach((u) => lobby.join(u));
    lobby.vote('a', true);
    lobby.vote('x', true); // never joined
    expect(lobby.snapshot(true).voters).toEqual(['a']);
    lobby.leave('a');
    expect(lobby.snapshot(true).voters).toEqual([]);
    expect(lobby.needed).toBe(2); // two members left
  });

  it('takes a vote back', () => {
    const lobby = new SpinLobby();
    ['a', 'b'].forEach((u) => lobby.join(u));
    lobby.vote('a', true);
    lobby.vote('a', false);
    expect(lobby.snapshot(true).voters).toEqual([]);
  });

  it('counts a person with two tabs once, and keeps them until the last tab closes', () => {
    const lobby = new SpinLobby();
    lobby.join('a');
    lobby.join('a');
    expect(lobby.size).toBe(1);
    lobby.vote('a', true);
    lobby.leave('a');
    expect(lobby.size).toBe(1);
    expect(lobby.votePassed).toBe(true);
    lobby.leave('a');
    expect(lobby.size).toBe(0);
    expect(lobby.votePassed).toBe(false);
  });
});

describe('SpinLobby movement', () => {
  it('moves a player in the held direction, stays in the arena and ignores bad input', () => {
    const lobby = new SpinLobby();
    lobby.join('a');
    const start = lobby.snapshot(false).players[0];
    lobby.setInput('a', 1, 0);
    lobby.tick(100);
    const moved = lobby.snapshot(false).players[0];
    expect(moved.x).toBeGreaterThan(start.x);
    expect(moved.y).toBe(start.y);

    lobby.setInput('a', 99, 'nope');
    lobby.tick(100);
    expect(lobby.snapshot(false).players[0]).toEqual(moved); // both clamp to 0: no movement

    lobby.setInput('a', -1, 0);
    for (let i = 0; i < 100; i++) lobby.tick(250);
    expect(lobby.snapshot(false).players[0].x).toBe(0);
  });

  it('does not move diagonals faster than straight lines', () => {
    const lobby = new SpinLobby();
    lobby.join('a');
    lobby.join('b');
    lobby.setInput('a', 1, 0);
    lobby.setInput('b', 1, 1);
    const before = lobby.snapshot(false).players;
    lobby.tick(200);
    const after = lobby.snapshot(false).players;
    const dist = (i: number) => Math.hypot(after[i].x - before[i].x, after[i].y - before[i].y);
    expect(dist(1)).toBeCloseTo(dist(0), 2);
  });
});
