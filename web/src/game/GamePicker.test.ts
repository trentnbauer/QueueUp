import { describe, expect, it } from 'vitest';
import { PICKER_MAX_SHOWN, filterPickerOptions, type PickerOption } from './GamePicker';

const opt = (title: string): PickerOption => ({ id: title, title });
const options = ['Hades', 'Hollow Knight', 'Halo Infinite', 'Pokémon Red', 'Celeste'].map(opt);

describe('filterPickerOptions', () => {
  it('lists everything with no search, and matches anywhere in the title', () => {
    expect(filterPickerOptions(options, '').total).toBe(5);
    expect(filterPickerOptions(options, 'ho').shown.map((o) => o.title)).toEqual(['Hollow Knight']);
    expect(filterPickerOptions(options, 'knight').shown.map((o) => o.title)).toEqual(['Hollow Knight']);
  });

  it('ignores case and accents', () => {
    expect(filterPickerOptions(options, 'POKEMON').shown.map((o) => o.title)).toEqual(['Pokémon Red']);
    expect(filterPickerOptions(options, 'pokémon').shown).toHaveLength(1);
  });

  it('says how many matched when it has to cut the list', () => {
    const many = Array.from({ length: 500 }, (_, i) => opt(`Game ${i}`));
    const r = filterPickerOptions(many, 'game');
    expect(r.shown).toHaveLength(PICKER_MAX_SHOWN);
    expect(r.total).toBe(500);
    expect(filterPickerOptions(many, 'game 49').total).toBe(11); // 49, 490-499
  });

  it('finds nothing for a search that matches nothing', () => {
    expect(filterPickerOptions(options, 'zzz')).toEqual({ shown: [], total: 0 });
  });
});
