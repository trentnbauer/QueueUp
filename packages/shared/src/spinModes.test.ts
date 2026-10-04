import { describe, it, expect } from 'vitest';
import {
  advancePlay,
  applyPlayAction,
  clawItemCenter,
  currentTurn,
  knockoutAlive,
  pendingPlay,
  PlayActionError,
  publicPlay,
  slotSpinEnd,
  type BanDraftPlay,
  type CardVotePlay,
  type ClawPlay,
  type KnockoutPlay,
  type MatchThreePlay,
  type ModeCandidate,
  type PlinkoStakePlay,
  type RoulettePlay,
  type SlotPlay,
  type SpinPlay,
  type SpinPlayMode,
  type StoredPlay,
} from './spinModes.js';

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOL: ModeCandidate[] = Array.from({ length: 10 }, (_, i) => ({ gameId: `g${i}`, weight: 1 + i }));
const T0 = 1_000_000;
const ME = 'u1';
const YOU = 'u2';

function begin(mode: SpinPlayMode, participants = [ME, YOU], seed = 1): SpinPlay {
  const rng = seeded(seed);
  const pending = pendingPlay(mode, POOL, rng);
  return advancePlay(pending, T0, T0, participants, rng) as SpinPlay;
}

/** Runs the round forward with nobody acting until it's decided. */
function runOut(play: StoredPlay, seed = 2): SpinPlay {
  const rng = seeded(seed);
  let p = play;
  for (let t = T0; t < T0 + 10 * 60_000; t += 500) {
    p = advancePlay(p, t, T0, [ME, YOU], rng);
    if ((p as SpinPlay).winnerId) break;
  }
  return p as SpinPlay;
}

const MODES: SpinPlayMode[] = ['card_vote', 'slot', 'knockout', 'plinko', 'plinko_stake', 'ban_draft', 'roulette', 'claw', 'match_three'];

describe('spin modes', () => {
  it('waits for the waiting room before dealing', () => {
    const pending = pendingPlay('card_vote', POOL, seeded(1));
    expect(advancePlay(pending, T0 - 1, T0, [ME], seeded(1))).toBe(pending);
  });

  it.each(MODES)('%s always ends with a winner from the pool, even if nobody acts', (mode) => {
    for (let seed = 1; seed <= 20; seed++) {
      const play = runOut(begin(mode, [ME, YOU], seed), seed + 100);
      expect(play.winnerId).not.toBeNull();
      expect(POOL.map((c) => c.gameId)).toContain(play.winnerId);
      expect(play.revealAt).not.toBeNull();
    }
  });

  it('three-card vote: the majority wins and voting closes early once everyone has voted', () => {
    let play = begin('card_vote') as CardVotePlay;
    const now = T0 + 2000;
    play = applyPlayAction(play, ME, { type: 'vote', card: 1 }, now, seeded(3)) as CardVotePlay;
    expect(play.closesAt).toBeGreaterThan(now + 5000);
    play = applyPlayAction(play, YOU, { type: 'vote', card: 1 }, now, seeded(3)) as CardVotePlay;
    expect(play.closesAt).toBeLessThanOrEqual(now + 1000);
    const done = advancePlay(play, play.closesAt, T0, [ME, YOU], seeded(3)) as CardVotePlay;
    expect(done.winnerId).toBe(play.cards[1].gameId);
    expect(done.kicker).toBeNull();
  });

  it('three-card vote: a tie is broken by a weighted draw among the tied cards', () => {
    let play = begin('card_vote') as CardVotePlay;
    play = applyPlayAction(play, ME, { type: 'vote', card: 0 }, T0 + 2000, seeded(3)) as CardVotePlay;
    play = applyPlayAction(play, YOU, { type: 'vote', card: 2 }, T0 + 2000, seeded(3)) as CardVotePlay;
    const done = advancePlay(play, play.closesAt, T0, [ME, YOU], seeded(3)) as CardVotePlay;
    expect([play.cards[0].gameId, play.cards[2].gameId]).toContain(done.winnerId);
    expect(done.kicker).toBe('TIED · WEIGHTED DRAW BROKE IT');
  });

  it('only members who were in the round can act', () => {
    const play = begin('card_vote');
    expect(() => applyPlayAction(play, 'late', { type: 'vote', card: 0 }, T0 + 2000, seeded(1))).toThrow(PlayActionError);
  });

  it('slots: a pair holds and only the odd reel respins; the result is decided up front', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const play = begin('slot', [ME], seed) as SlotPlay;
      expect(play.winnerId).not.toBeNull();
      expect(play.spins.length).toBeLessThanOrEqual(play.respinLimit + 1);
      for (let i = 1; i < play.spins.length; i++) {
        const prev = play.spins[i - 1];
        const cur = play.spins[i];
        cur.held.forEach((h, r) => h && expect(cur.reels[r]).toBe(prev.reels[r]));
        expect(cur.at).toBeGreaterThan(slotSpinEnd(prev));
      }
    }
  });

  it('knockout: a shield blocks the hit once, then is used up', () => {
    let play = begin('knockout') as KnockoutPlay;
    const everyone = knockoutAlive(play);
    // Shield every game we can (two members, two shields) and run one round.
    play = applyPlayAction(play, ME, { type: 'shield', gameId: everyone[0] }, T0, seeded(1)) as KnockoutPlay;
    for (let seed = 1; seed < 200; seed++) {
      const after = advancePlay(play, play.nextRoundAt!, T0, [ME, YOU], seeded(seed)) as KnockoutPlay;
      const round = after.rounds[0];
      if (round.hit !== everyone[0]) continue;
      expect(round.blocked).toBe(true);
      expect(round.blockedBy).toBe(ME);
      expect(after.usedShields).toContain(ME);
      expect(knockoutAlive(after)).toHaveLength(everyone.length);
      expect(() => applyPlayAction(after, ME, { type: 'shield', gameId: everyone[1] }, T0, seeded(1))).toThrow('Your shield is used up');
      return;
    }
    throw new Error('the shielded game was never hit');
  });

  it('ban draft: one more card than members, turns in order, the survivor wins', () => {
    let play = begin('ban_draft') as BanDraftPlay;
    expect(play.cards).toHaveLength(3);
    expect(currentTurn(play)).toBe(ME);
    expect(() => applyPlayAction(play, YOU, { type: 'ban', gameId: play.cards[0].gameId }, T0 + 1, seeded(1))).toThrow("It isn't your turn");
    play = applyPlayAction(play, ME, { type: 'ban', gameId: play.cards[0].gameId }, T0 + 1, seeded(1)) as BanDraftPlay;
    expect(currentTurn(play)).toBe(YOU);
    play = applyPlayAction(play, YOU, { type: 'ban', gameId: play.cards[1].gameId }, T0 + 2, seeded(1)) as BanDraftPlay;
    expect(play.winnerId).toBe(play.cards[2].gameId);
  });

  it('ban draft: a member who runs out of time gets a ban made for them', () => {
    const play = begin('ban_draft') as BanDraftPlay;
    const after = advancePlay(play, play.turnEndsAt! + 1, T0, [ME, YOU], seeded(1)) as BanDraftPlay;
    expect(after.bans).toHaveLength(1);
    expect(after.bans[0]).toMatchObject({ userId: ME, auto: true });
    expect(currentTurn(after)).toBe(YOU);
  });

  it('prize wheel: lands inside the winning wedge', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const play = begin('roulette', [ME], seed) as RoulettePlay;
      const total = play.wedges.reduce((s, w) => s + w.weight, 0);
      let edge = 0;
      const i = play.wedges.findIndex((w) => w.gameId === play.winnerId);
      for (let k = 0; k < i; k++) edge += play.wedges[k].weight / total;
      expect(play.landing).toBeGreaterThan(edge);
      expect(play.landing).toBeLessThan(edge + play.wedges[i].weight / total);
    }
  });

  it('chip-stake plinko: chips boost a bin and closing early waits a short grace', () => {
    let play = begin('plinko_stake') as PlinkoStakePlay;
    play = applyPlayAction(play, ME, { type: 'stake', bin: 2 }, T0 + 1000, seeded(1)) as PlinkoStakePlay;
    play = applyPlayAction(play, ME, { type: 'stake', bin: 3 }, T0 + 1100, seeded(1)) as PlinkoStakePlay;
    expect(play.stakes).toEqual({ [ME]: 3 });
    play = applyPlayAction(play, YOU, { type: 'stake', bin: 3 }, T0 + 1200, seeded(1)) as PlinkoStakePlay;
    expect(play.closesAt).toBe(T0 + 1200 + 1200);
    const done = advancePlay(play, play.closesAt, T0, [ME, YOU], seeded(1)) as PlinkoStakePlay;
    expect(done.closed).toBe(true);
    expect(done.path).not.toBeNull();
  });

  it('claw: a drop over an item rolls its grip; three misses make a pity pick', () => {
    let play = begin('claw') as ClawPlay;
    play = { ...play, grips: play.grips.map(() => 0) };
    for (let i = 0; i < 3; i++) {
      const who = currentTurn(play)!;
      const at = play.turnStartedAt! + 1000;
      play = applyPlayAction(play, who, { type: 'drop', x: clawItemCenter(0) }, at, seeded(i)) as ClawPlay;
    }
    expect(play.tries.map((t) => t.userId)).toEqual([ME, YOU, ME]);
    expect(play.tries.every((t) => t.item === 0 && !t.success)).toBe(true);
    expect(play.pity).toBe(true);
    expect(play.winnerId).not.toBeNull();
  });

  it('match three: face-down tiles are hidden, and three of a game wins', () => {
    let play = begin('match_three') as MatchThreePlay;
    expect(publicPlay(play)).toMatchObject({ layout: [] });
    const target = play.layout.find((id) => play.layout.filter((x) => x === id).length >= 3)!;
    const tiles = play.layout.map((id, i) => (id === target ? i : -1)).filter((i) => i >= 0);
    let t = T0;
    for (const tile of tiles.slice(0, 3)) {
      play = applyPlayAction(play, currentTurn(play)!, { type: 'flip', tile }, ++t, seeded(1)) as MatchThreePlay;
    }
    expect(play.winnerId).toBe(target);
  });
});
