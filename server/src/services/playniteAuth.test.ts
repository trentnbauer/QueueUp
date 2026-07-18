import { describe, it, expect } from 'vitest';
import { resolveUserIdFromBearerToken } from './playniteAuth.js';

describe('resolveUserIdFromBearerToken', () => {
  it('returns null when there is no Authorization header', async () => {
    expect(await resolveUserIdFromBearerToken(undefined)).toBeNull();
  });

  it('returns null for a non-Bearer Authorization header', async () => {
    expect(await resolveUserIdFromBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
  });

  it('returns null for a Bearer header with no token', async () => {
    expect(await resolveUserIdFromBearerToken('Bearer ')).toBeNull();
    expect(await resolveUserIdFromBearerToken('Bearer    ')).toBeNull();
  });
});
