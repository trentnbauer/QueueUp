import { describe, expect, it } from 'vitest';
import { isEmptySpecs, parseComputerSpecs, specsFromRow } from './computerSpecs.js';

describe('parseComputerSpecs', () => {
  it('keeps what was typed, trimmed, and turns blanks into empty', () => {
    const s = parseComputerSpecs({ cpu: '  Ryzen   5 5600X ', gpu: '', ramGb: 16, vramGb: null, os: 'Windows 11', storage: 'nvme', freeGb: 250, display: '2560x1440 @ 144Hz', notes: '  ' });
    expect(s).toEqual({ cpu: 'Ryzen 5 5600X', gpu: null, ramGb: 16, vramGb: null, os: 'Windows 11', storage: 'nvme', freeGb: 250, display: '2560x1440 @ 144Hz', notes: null });
  });

  it('treats a missing field as empty', () => {
    expect(isEmptySpecs(parseComputerSpecs({}))).toBe(true);
  });

  it('rejects text that is too long, numbers that are not whole or sane, and an unknown storage type', () => {
    expect(() => parseComputerSpecs({ cpu: 'x'.repeat(121) })).toThrow('at most 120');
    expect(() => parseComputerSpecs({ notes: 'x'.repeat(501) })).toThrow('at most 500');
    expect(() => parseComputerSpecs({ ramGb: 16.5 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ ramGb: -1 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ ramGb: '16' })).toThrow('whole number');
    expect(() => parseComputerSpecs({ vramGb: 99999 })).toThrow('whole number');
    expect(() => parseComputerSpecs({ storage: 'floppy' })).toThrow('ssd, hdd or nvme');
    expect(() => parseComputerSpecs({ cpu: 5 })).toThrow('must be text');
    expect(() => parseComputerSpecs(null)).toThrow('object');
  });
});

describe('specsFromRow', () => {
  it('is empty with no row, and drops a storage value it does not know', () => {
    expect(isEmptySpecs(specsFromRow(null))).toBe(true);
    const row = { cpu: 'a', gpu: null, ramGb: 8, vramGb: null, os: null, storage: 'tape', freeGb: null, display: null, notes: null };
    expect(specsFromRow(row).storage).toBeNull();
    expect(specsFromRow({ ...row, storage: 'hdd' }).storage).toBe('hdd');
  });
});
