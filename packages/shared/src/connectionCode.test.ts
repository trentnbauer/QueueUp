import { describe, it, expect } from 'vitest';
import { encodeConnectionCode, decodeConnectionCode } from './connectionCode.js';

describe('connectionCode', () => {
  it('round-trips url and key through encode/decode', () => {
    const code = encodeConnectionCode({ url: 'https://queueup.example.com', key: 'qk_abc123-_def' });
    expect(decodeConnectionCode(code)).toEqual({ url: 'https://queueup.example.com', key: 'qk_abc123-_def' });
  });

  it('is prefixed with the current version marker', () => {
    const code = encodeConnectionCode({ url: 'https://queueup.example.com', key: 'qk_x' });
    expect(code.startsWith('qc1_')).toBe(true);
  });

  it('rejects a string with no recognized prefix', () => {
    expect(decodeConnectionCode('not-a-connection-code')).toBeNull();
    expect(decodeConnectionCode('')).toBeNull();
  });

  it('rejects a prefixed string that is not valid base64 JSON', () => {
    expect(decodeConnectionCode('qc1_!!!not-base64!!!')).toBeNull();
  });

  it('rejects a prefixed string decoding to JSON missing url/key', () => {
    expect(decodeConnectionCode('qc1_' + btoa(JSON.stringify({ url: 'https://x.com' })))).toBeNull();
    expect(decodeConnectionCode('qc1_' + btoa(JSON.stringify({ foo: 'bar' })))).toBeNull();
  });
});
