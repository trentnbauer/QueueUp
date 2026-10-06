import { describe, expect, it } from 'vitest';
import { isEmptySpecs, parseComputerSpecs, prefillSpecs, specsFromRow } from './computerSpecs.js';

describe('parseComputerSpecs', () => {
  it('keeps what was typed, trimmed, and turns blanks into empty', () => {
    const s = parseComputerSpecs({ cpu: '  Ryzen   5 5600X ', gpu: '', ramGb: 16, display: '2560x1440 @ 144Hz' });
    expect(s).toEqual({ cpu: 'Ryzen 5 5600X', gpu: null, ramGb: 16, display: '2560x1440 @ 144Hz' });
  });

  it('ignores fields that are no longer kept', () => {
    expect(parseComputerSpecs({ cpu: 'a', os: 'Windows 11', storage: 'nvme', freeGb: 250, vramGb: 12, notes: 'x' })).toEqual({ cpu: 'a', gpu: null, ramGb: null, display: null });
  });

  it('treats a missing field as empty', () => {
    expect(isEmptySpecs(parseComputerSpecs({}))).toBe(true);
  });

  it('rejects text that is too long and numbers that are not whole or sane', () => {
    expect(() => parseComputerSpecs({ cpu: 'x'.repeat(121) })).toThrow('at most 120');
    expect(() => parseComputerSpecs({ ramGb: 16.5 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ ramGb: -1 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ ramGb: '16' })).toThrow('whole number');
    expect(() => parseComputerSpecs({ ramGb: 99999 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ cpu: 5 })).toThrow('must be text');
    expect(() => parseComputerSpecs(null)).toThrow('object');
  });
});

describe('specsFromRow', () => {
  it('is empty with no row, and keeps only the specs that are still kept', () => {
    expect(isEmptySpecs(specsFromRow(null))).toBe(true);
    expect(specsFromRow({ cpu: 'a', gpu: null, ramGb: 8, display: '1080p' })).toEqual({ cpu: 'a', gpu: null, ramGb: 8, display: '1080p' });
  });
});

describe('prefillSpecs', () => {
  const blank = specsFromRow(null);

  it('fills blanks and leaves everything the person entered alone', () => {
    const existing = { ...blank, cpu: 'Ryzen 5 5600X', ramGb: 32 };
    const incoming = { ...blank, cpu: 'Some Other CPU', gpu: 'GeForce RTX 3060', ramGb: 16, display: '1080p' };
    const { specs, filled } = prefillSpecs(existing, incoming);
    expect(specs).toMatchObject({ cpu: 'Ryzen 5 5600X', ramGb: 32, gpu: 'GeForce RTX 3060', display: '1080p' });
    expect(filled).toEqual(['gpu', 'display']);
  });

  it('changes nothing when there is nothing new to fill', () => {
    const existing = { ...blank, gpu: 'x' };
    expect(prefillSpecs(existing, { ...blank, gpu: 'y' })).toEqual({ specs: existing, filled: [] });
    expect(prefillSpecs(existing, blank).filled).toEqual([]);
  });
});
