import { describe, expect, it } from 'vitest';
import { extractJson } from './aiJson.js';

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]));
  it('reads a fenced block', () => expect(extractJson('Here:\n```json\n{"a":2}\n```\nDone')).toEqual({ a: 2 }));
  it('finds an array after chatter', () => expect(extractJson('Sure! [1,2,3] hope it helps')).toEqual([1, 2, 3]));
  it('returns null when nothing parses', () => expect(extractJson('no json here')).toBeNull());
});
