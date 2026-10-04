import { describe, expect, it } from 'vitest';
import { parseStorageMb } from './steamStorage.js';

describe('parseStorageMb', () => {
  it('reads the storage line from Steam requirements HTML', () => {
    expect(parseStorageMb('<ul><li><strong>Storage:</strong> 60 GB available space</li></ul>')).toBe(61440);
    expect(parseStorageMb('<li><strong>Hard Drive:</strong> 512 MB available space</li>')).toBe(512);
    expect(parseStorageMb('<strong>Hard Disk Space:</strong> 1.5 GB')).toBe(1536);
    expect(parseStorageMb('Storage: 1 TB available space')).toBe(1048576);
    expect(parseStorageMb('<strong>Storage:</strong>&nbsp;8,5 GB available space')).toBe(8704);
  });

  it('is null when there is no size or it makes no sense', () => {
    expect(parseStorageMb('<li><strong>Memory:</strong> 8 GB RAM</li>')).toBeNull();
    expect(parseStorageMb('')).toBeNull();
    expect(parseStorageMb(null)).toBeNull();
    expect(parseStorageMb('Storage: 9000 TB')).toBeNull();
  });
});
