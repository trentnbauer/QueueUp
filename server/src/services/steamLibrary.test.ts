import { describe, it, expect } from 'vitest';
import { extractSteamId64 } from './steamLibrary.js';

describe('extractSteamId64', () => {
  it('extracts the SteamID64 from a steam-prefixed oidcSub', () => {
    expect(extractSteamId64('steam:76561198000000000')).toBe('76561198000000000');
  });

  it('returns null for a non-Steam oidcSub', () => {
    expect(extractSteamId64('dev-user')).toBeNull();
    expect(extractSteamId64('oidc:some-id')).toBeNull();
    expect(extractSteamId64('discord:123456')).toBeNull();
  });
});
