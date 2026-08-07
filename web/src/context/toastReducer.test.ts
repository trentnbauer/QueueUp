import { describe, it, expect, vi } from 'vitest';
import { addToast, removeToast } from './toastReducer';

function makeToast(id: string) {
  return { id, message: `Message ${id}`, actions: [{ label: 'Do it', onClick: vi.fn() }] };
}

describe('addToast', () => {
  it('appends a new toast', () => {
    const result = addToast([makeToast('a')], makeToast('b'));
    expect(result.map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('is a no-op when a toast with the same id already exists', () => {
    const existing = [makeToast('a')];
    const result = addToast(existing, makeToast('a'));
    expect(result).toBe(existing);
  });

  it('appends to an empty list', () => {
    expect(addToast([], makeToast('a')).map((t) => t.id)).toEqual(['a']);
  });
});

describe('removeToast', () => {
  it('removes the matching toast, leaving the rest in order', () => {
    const result = removeToast([makeToast('a'), makeToast('b'), makeToast('c')], 'b');
    expect(result.map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('is a no-op when the id is not present', () => {
    const existing = [makeToast('a')];
    expect(removeToast(existing, 'missing').map((t) => t.id)).toEqual(['a']);
  });

  it('empties a single-item list', () => {
    expect(removeToast([makeToast('a')], 'a')).toEqual([]);
  });
});
