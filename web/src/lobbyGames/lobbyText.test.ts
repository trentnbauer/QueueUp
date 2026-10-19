import { describe, expect, it } from 'vitest';
import type { MiniGameLobbyDto } from '@queueup/shared';
import { en } from '../i18n/locales/en';
import { lobbyHeadline } from './lobbyText';

const t = (key: keyof typeof en, vars: Record<string, string | number> = {}) => en[key].replace(/\{(\w+)\}/g, (_, k) => String(vars[k]));
const person = (id: string, displayName: string) => ({ id, displayName, avatarColor: '#fff', avatarUrl: null });
const lobby = (over: Partial<MiniGameLobbyDto>): MiniGameLobbyDto => ({ id: 'l', visibility: 'public', game: null, timeLimit: false, solo: false, hostId: 'sam', mine: false, code: null, players: [], ...over });
const name = () => 'Runner';

describe('lobbyHeadline', () => {
  it('names the people in it, leaving you out', () => {
    expect(lobbyHeadline(lobby({ players: [person('sam', 'Sam')] }), 'me', t, name)).toBe('Sam is playing');
    expect(lobbyHeadline(lobby({ players: [person('sam', 'Sam'), person('me', 'Me'), person('jess', 'Jess')] }), 'me', t, name)).toBe('Sam and Jess are playing');
    expect(lobbyHeadline(lobby({ players: [person('a', 'A'), person('b', 'B'), person('c', 'C'), person('d', 'D')] }), 'me', t, name)).toBe('A, B and 2 more are playing');
  });

  it('adds the game when the lobby has one', () => {
    expect(lobbyHeadline(lobby({ game: 'runner', players: [person('sam', 'Sam'), person('jess', 'Jess')] }), 'me', t, name)).toBe('Sam and Jess are playing Runner');
  });

  it('says your own lobby is open', () => {
    expect(lobbyHeadline(lobby({ mine: true }), 'me', t, name)).toBe('Your lobby is open');
    expect(lobbyHeadline(lobby({ mine: true, game: 'runner' }), 'me', t, name)).toBe('Your Runner lobby is open');
  });
});
