import { describe, it, expect } from 'vitest';
import { assertSteamCallbackBoundToSession } from './steamProvider.js';

const REDIRECT_URI = 'https://queueup.example.com/auth/steam/callback';
const STATE = 'session-state-abc';

function callbackQuery(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    state: STATE,
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': 'https://steamcommunity.com/openid/id/76561198000000000',
    'openid.return_to': `${REDIRECT_URI}?state=${STATE}`,
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    ...overrides,
  };
}

describe('assertSteamCallbackBoundToSession', () => {
  it('accepts a callback started by this session', () => {
    expect(() => assertSteamCallbackBoundToSession(callbackQuery(), STATE, REDIRECT_URI)).not.toThrow();
  });

  it('rejects a callback when this session never started a Steam sign-in', () => {
    expect(() => assertSteamCallbackBoundToSession(callbackQuery(), undefined, REDIRECT_URI)).toThrow(/state mismatch/);
  });

  it("rejects someone else's assertion replayed into this session", () => {
    const replayed = callbackQuery({ state: 'attacker-state', 'openid.return_to': `${REDIRECT_URI}?state=attacker-state` });
    expect(() => assertSteamCallbackBoundToSession(replayed, STATE, REDIRECT_URI)).toThrow(/state mismatch/);
  });

  it('rejects a matching query state when the signed return_to carries a different one', () => {
    const tampered = callbackQuery({ 'openid.return_to': `${REDIRECT_URI}?state=attacker-state` });
    expect(() => assertSteamCallbackBoundToSession(tampered, STATE, REDIRECT_URI)).toThrow(/unexpected address/);
  });

  it('rejects an assertion issued for a different site', () => {
    const otherSite = callbackQuery({ 'openid.return_to': `https://evil.example.com/auth/steam/callback?state=${STATE}` });
    expect(() => assertSteamCallbackBoundToSession(otherSite, STATE, REDIRECT_URI)).toThrow(/unexpected address/);
  });

  it('rejects an assertion whose signature does not cover claimed_id', () => {
    const unsigned = callbackQuery({ 'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce,assoc_handle' });
    expect(() => assertSteamCallbackBoundToSession(unsigned, STATE, REDIRECT_URI)).toThrow(/did not sign/);
  });

  it('rejects an assertion from a different OpenID provider', () => {
    const otherOp = callbackQuery({ 'openid.op_endpoint': 'https://evil.example.com/openid/login' });
    expect(() => assertSteamCallbackBoundToSession(otherOp, STATE, REDIRECT_URI)).toThrow(/unexpected provider/);
  });
});
