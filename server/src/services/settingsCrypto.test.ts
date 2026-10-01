import { describe, it, expect } from 'vitest';
import { decryptSetting, encryptSetting, isEncrypted } from './settingsCrypto.js';

const SECRET = 'a'.repeat(32);

describe('settingsCrypto', () => {
  it('round-trips a value', () => {
    const stored = encryptSetting('my-api-key', SECRET);
    expect(isEncrypted(stored)).toBe(true);
    expect(stored).not.toContain('my-api-key');
    expect(decryptSetting(stored, SECRET)).toBe('my-api-key');
  });

  it('uses a fresh IV each time', () => {
    expect(encryptSetting('x', SECRET)).not.toBe(encryptSetting('x', SECRET));
  });

  it('returns null under a different secret or when tampered with', () => {
    const stored = encryptSetting('my-api-key', SECRET);
    expect(decryptSetting(stored, 'b'.repeat(32))).toBeNull();
    expect(decryptSetting(stored.slice(0, -4) + 'AAAA', SECRET)).toBeNull();
    expect(decryptSetting('enc:v1:abc', SECRET)).toBeNull();
  });

  it('passes through values stored before encryption', () => {
    expect(decryptSetting('legacy-plain', SECRET)).toBe('legacy-plain');
  });
});
