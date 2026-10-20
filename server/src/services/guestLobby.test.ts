import { describe, it, expect, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: { SESSION_SECRET: 'x'.repeat(40), SIGNUP_MODE: 'open', PRIVATE_INSTANCE: false } }));

const { newGuestToken, verifyGuestToken, isGuestId } = await import('./guestLobby.js');

describe('guest lobby tokens', () => {
  it('verifies for its own lobby only', () => {
    const { token, guestId } = newGuestToken('lobby-1', 'Pete');
    expect(isGuestId(guestId)).toBe(true);
    expect(verifyGuestToken(token, 'lobby-1')).toEqual({ guestId, name: 'Pete' });
    expect(verifyGuestToken(token, 'lobby-2')).toBeNull();
  });

  it('refuses expired, forged and malformed tokens', () => {
    const { token } = newGuestToken('lobby-1', 'Pete', 0);
    expect(verifyGuestToken(token, 'lobby-1', 7 * 60 * 60 * 1000)).toBeNull();
    const [body] = newGuestToken('lobby-1', 'Eve').token.split('.');
    expect(verifyGuestToken(`${body}.AAAA`, 'lobby-1')).toBeNull();
    expect(verifyGuestToken('nope', 'lobby-1')).toBeNull();
    expect(verifyGuestToken(undefined, 'lobby-1')).toBeNull();
  });
});
