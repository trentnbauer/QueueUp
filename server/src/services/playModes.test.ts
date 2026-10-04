import { describe, expect, it } from 'vitest';
import { playModesFrom } from './igdbClient.js';

describe('playModesFrom', () => {
  it('is single player only when that is the only mode and there is no co-op', () => {
    expect(playModesFrom([{ name: 'Single player' }], [])).toEqual({ singlePlayerOnly: true, coop: false });
  });

  it('spots co-op from the modes or from multiplayer flags', () => {
    expect(playModesFrom([{ name: 'Single player' }, { name: 'Co-operative' }], [])).toEqual({ singlePlayerOnly: false, coop: true });
    expect(playModesFrom([{ name: 'Single player' }, { name: 'Multiplayer' }], [{ onlinecoop: true }])).toEqual({ singlePlayerOnly: false, coop: true });
    expect(playModesFrom([{ name: 'Single player' }, { name: 'Split screen' }], [{ offlinecoop: true }])).toEqual({ singlePlayerOnly: false, coop: true });
  });

  it('competitive split screen alone is not co-op', () => {
    expect(playModesFrom([{ name: 'Single player' }, { name: 'Split screen' }], [{ splitscreen: true }])).toEqual({ singlePlayerOnly: false, coop: false });
  });

  it('a competitive-only multiplayer game is neither', () => {
    expect(playModesFrom([{ name: 'Single player' }, { name: 'Multiplayer' }], [{ onlinecoopmax: 1 }])).toEqual({ singlePlayerOnly: false, coop: false });
  });

  it('is unknown when IGDB lists no modes', () => {
    expect(playModesFrom(undefined, undefined)).toEqual({ singlePlayerOnly: null, coop: false });
  });
});
