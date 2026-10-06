import { describe, expect, it } from 'vitest';
import { pageTitle } from './pageTitle';

describe('pageTitle', () => {
  it('puts the page after the app name', () => {
    expect(pageTitle('Personal Shelf')).toBe('QueueUp - Personal Shelf');
    expect(pageTitle('  Trent & Sam  ')).toBe('QueueUp - Trent & Sam');
  });

  it('is just the app name when there is no page name yet', () => {
    expect(pageTitle('')).toBe('QueueUp');
    expect(pageTitle(null)).toBe('QueueUp');
    expect(pageTitle(undefined)).toBe('QueueUp');
    expect(pageTitle('   ')).toBe('QueueUp');
  });
});
