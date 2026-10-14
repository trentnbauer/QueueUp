import { describe, expect, it } from 'vitest';
import { MINIGAME_CODE_ALPHABET } from '@queueup/shared';
import { MAX_OPEN_LOBBIES, OpenLobbyRegistry, UNJOINED_TTL_MS, mayOpenLobby } from './openLobbies.js';

describe('OpenLobbyRegistry', () => {
  it('opens a lobby, with a code only when it is invite-code', () => {
    const reg = new OpenLobbyRegistry();
    const pub = reg.create('host', 'public', null)!.lobby;
    expect(pub.code).toBeNull();
    const priv = reg.create('other', 'code', 'runner')!.lobby;
    expect(priv.code).toMatch(/^[A-Z0-9]{6}$/);
    expect([...priv.code!].every((c) => MINIGAME_CODE_ALPHABET.includes(c))).toBe(true);
    expect(reg.byCode(priv.code!)).toBe(priv);
    expect(priv.game).toBe('runner');
  });

  it('lets someone host one lobby at a time, replacing the old one', () => {
    const reg = new OpenLobbyRegistry();
    const first = reg.create('host', 'public', null)!.lobby;
    const second = reg.create('host', 'friends', null)!;
    expect(second.replaced).toBe(first);
    expect(reg.get(first.id)).toBeUndefined();
    expect(reg.all()).toHaveLength(1);
  });

  it('refuses a new lobby when the server is full', () => {
    const reg = new OpenLobbyRegistry();
    for (let i = 0; i < MAX_OPEN_LOBBIES; i++) reg.create(`host${i}`, 'public', null);
    expect(reg.create('late', 'public', null)).toBeNull();
  });

  it('drops a lobby nobody ever joined, but not one with people in it', () => {
    let now = 1_000_000;
    const reg = new OpenLobbyRegistry(() => now);
    const empty = reg.create('a', 'public', null)!.lobby;
    const busy = reg.create('b', 'public', null)!.lobby;
    reg.purge(() => false);
    expect(reg.all()).toHaveLength(2);
    now += UNJOINED_TTL_MS + 1;
    reg.purge((id) => id === busy.id);
    expect(reg.get(empty.id)).toBeUndefined();
    expect(reg.get(busy.id)).toBe(busy);
  });

  it('closes a lobby', () => {
    const reg = new OpenLobbyRegistry();
    const lobby = reg.create('host', 'public', null)!.lobby;
    expect(reg.close(lobby.id)).toBe(lobby);
    expect(reg.get(lobby.id)).toBeUndefined();
  });
});

describe('mayOpenLobby', () => {
  const lobby = (visibility: 'public' | 'friends' | 'code') => new OpenLobbyRegistry().create('host', visibility, null)!.lobby;
  const none = { friend: false, blocked: false };

  it('lets the host into any of their lobbies', () => {
    for (const v of ['public', 'friends', 'code'] as const) expect(mayOpenLobby(lobby(v), 'host', { friend: false, blocked: true })).toBe(true);
  });

  it('lets anyone into a public lobby, friends into a friends lobby, and only code holders into a code one', () => {
    expect(mayOpenLobby(lobby('public'), 'u', none)).toBe(true);
    expect(mayOpenLobby(lobby('friends'), 'u', none)).toBe(false);
    expect(mayOpenLobby(lobby('friends'), 'u', { friend: true, blocked: false })).toBe(true);
    const code = lobby('code');
    expect(mayOpenLobby(code, 'u', { friend: true, blocked: false })).toBe(false);
    code.allowed.add('u');
    expect(mayOpenLobby(code, 'u', none)).toBe(true);
  });

  it('keeps out anyone blocked either way, whatever the lobby', () => {
    const blocked = { friend: true, blocked: true };
    expect(mayOpenLobby(lobby('public'), 'u', blocked)).toBe(false);
    const code = lobby('code');
    code.allowed.add('u');
    expect(mayOpenLobby(code, 'u', blocked)).toBe(false);
  });
});
