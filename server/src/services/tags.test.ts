import { describe, it, expect } from 'vitest';
import { normalizeTagName, assertValidTagName } from './tags.js';

describe('normalizeTagName', () => {
  it('trims leading/trailing whitespace', () => {
    expect(normalizeTagName('  Co-op only  ')).toBe('Co-op only');
  });

  it('collapses internal runs of whitespace', () => {
    expect(normalizeTagName('Short   &\tsweet')).toBe('Short & sweet');
  });

  it('is idempotent - normalizing an already-normalized name is a no-op', () => {
    const name = normalizeTagName('  Replaying  ');
    expect(normalizeTagName(name)).toBe(name);
  });
});

describe('assertValidTagName', () => {
  it('rejects an empty (post-trim) name', () => {
    expect(() => assertValidTagName('')).toThrow(/required/i);
  });

  it('accepts a normal label', () => {
    expect(() => assertValidTagName('Co-op only')).not.toThrow();
  });

  it('rejects a name over the length cap', () => {
    expect(() => assertValidTagName('x'.repeat(41))).toThrow(/40/);
  });

  it('accepts a name right at the length cap', () => {
    expect(() => assertValidTagName('x'.repeat(40))).not.toThrow();
  });
});
