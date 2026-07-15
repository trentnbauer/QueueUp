import { describe, it, expect } from 'vitest';
import { isConfigKey, CONFIG_KEYS } from './configResolver.js';

describe('isConfigKey', () => {
  it('accepts every known integration config key', () => {
    for (const key of CONFIG_KEYS) {
      expect(isConfigKey(key)).toBe(true);
    }
  });

  it('rejects unknown keys, including near-misses', () => {
    expect(isConfigKey('GGDEALS_API_KEYS')).toBe(false);
    expect(isConfigKey('igdb_client_id')).toBe(false);
    expect(isConfigKey('')).toBe(false);
    expect(isConfigKey('DATABASE_URL')).toBe(false);
  });
});
