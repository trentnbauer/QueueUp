import { describe, expect, it } from 'vitest';
import { extractJson, salvageObjects } from './aiJson.js';

describe('extractJson', () => {
  it('parses plain JSON', () => expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]));
  it('reads a fenced block', () => expect(extractJson('Here:\n```json\n{"a":2}\n```\nDone')).toEqual({ a: 2 }));
  it('finds an array after chatter', () => expect(extractJson('Sure! [1,2,3] hope it helps')).toEqual([1, 2, 3]));
  it('returns null when nothing parses', () => expect(extractJson('no json here')).toBeNull());
});

describe('a list the model ran out of room to finish', () => {
  it('keeps the complete objects before the cut', () => {
    const cut = '[{"pair":1,"reason":"a, {braces} and \\"quotes\\""},{"pair":2,"reason":"ok"},{"pair":3,"rea';
    expect(extractJson(cut)).toEqual([{ pair: 1, reason: 'a, {braces} and "quotes"' }, { pair: 2, reason: 'ok' }]);
  });

  it('also works inside a code fence that was never closed', () => {
    expect(extractJson('```json\n[{"a":1},{"a":2},{"a"')).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('gives nothing when no object was finished, and leaves complete JSON alone', () => {
    expect(salvageObjects('[{"pair":1,"rea')).toEqual([]);
    expect(extractJson('[{"pair":1,"rea')).toBeNull();
    expect(extractJson('[{"a":1}]')).toEqual([{ a: 1 }]);
  });
});
