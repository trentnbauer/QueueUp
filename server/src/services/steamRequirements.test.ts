import { describe, expect, it, vi } from 'vitest';

vi.mock('./redisClient.js', () => ({ redis: { get: vi.fn(), set: vi.fn() } }));

import { parseMemoryGb, parseRequirementSet, parseRequirements } from './steamRequirements.js';

const MIN =
  '<strong>Minimum:</strong><br><ul class="bb_ul"><li><strong>OS *:</strong> Windows 10 64-bit<br></li><li><strong>Processor:</strong> Intel Core i5-2500K &amp; up<br></li>' +
  '<li><strong>Memory:</strong> 8 GB RAM<br></li><li><strong>Graphics:</strong> NVIDIA GeForce GTX 960<br></li><li><strong>Storage:</strong> 60 GB available space<br></li>' +
  '<li><strong>Additional Notes:</strong> SSD recommended</li></ul>';

describe('parseRequirementSet', () => {
  it('reads labelled lines from Steam\'s list markup, decoding entities and dropping the star', () => {
    const set = parseRequirementSet(MIN);
    expect(set?.lines).toEqual([
      { label: 'OS', value: 'Windows 10 64-bit' },
      { label: 'Processor', value: 'Intel Core i5-2500K & up' },
      { label: 'Memory', value: '8 GB RAM' },
      { label: 'Graphics', value: 'NVIDIA GeForce GTX 960' },
      { label: 'Storage', value: '60 GB available space' },
      { label: 'Additional Notes', value: 'SSD recommended' },
    ]);
    expect(set?.memoryGb).toBe(8);
  });

  it('keeps the raw text when the page is not laid out as labelled lines', () => {
    const set = parseRequirementSet('Minimum:<br>Any modern PC will do');
    expect(set?.lines).toEqual([]);
    expect(set?.text).toBe('Any modern PC will do');
    expect(set?.memoryGb).toBeNull();
  });

  it('is null when there is nothing in the block', () => {
    expect(parseRequirementSet('')).toBeNull();
    expect(parseRequirementSet(undefined)).toBeNull();
    expect(parseRequirementSet('<strong>Minimum:</strong><br>')).toBeNull();
  });

  it('does not treat markup as text', () => {
    const set = parseRequirementSet('<li><strong>Processor:</strong> <script>alert(1)</script>Ryzen 5</li>');
    expect(set?.lines[0].value).toBe('alert(1)Ryzen 5');
  });
});

describe('parseRequirements', () => {
  it('has minimum and recommended, either of which may be missing, and is null when both are', () => {
    expect(parseRequirements({ minimum: MIN })?.recommended).toBeNull();
    expect(parseRequirements({ recommended: MIN })?.minimum).toBeNull();
    expect(parseRequirements({})).toBeNull();
  });
});

describe('parseMemoryGb', () => {
  it('turns the memory line into GB', () => {
    expect(parseMemoryGb('8 GB RAM')).toBe(8);
    expect(parseMemoryGb('512 MB')).toBe(0.5);
    expect(parseMemoryGb('1.5 GB')).toBe(1.5);
    expect(parseMemoryGb('16GB')).toBe(16);
    expect(parseMemoryGb('plenty')).toBeNull();
  });
});
