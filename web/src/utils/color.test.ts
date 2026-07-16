import { describe, it, expect } from 'vitest';
import { contrastTextColor } from './color';

describe('contrastTextColor', () => {
  it('picks dark text for bright presets like Lime', () => {
    expect(contrastTextColor('#a3e635')).toBe('#1a1926');
  });

  it('picks white text for darker/medium presets like Violet', () => {
    expect(contrastTextColor('#8b5cf6')).toBe('#fff');
  });

  it('picks dark text for a bright mustard yellow', () => {
    expect(contrastTextColor('#E8C34A')).toBe('#1a1926');
  });

  it('falls back to white for an unparseable value', () => {
    expect(contrastTextColor('not-a-color')).toBe('#fff');
  });
});
