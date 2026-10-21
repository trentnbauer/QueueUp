import { describe, expect, it } from 'vitest';
import { buildEntries, parseCsv, parseLibraryFile, parsePlatforms, previewLibraryFile } from './libraryFile.js';

describe('parseCsv', () => {
  it('handles quotes, embedded delimiters, doubled quotes and line breaks', () => {
    const grid = parseCsv('Title,Note\r\n"Hades, the game","said ""hi"""\r\n"Two\nlines",x\r\n');
    expect(grid).toEqual([
      ['Title', 'Note'],
      ['Hades, the game', 'said "hi"'],
      ['Two\nlines', 'x'],
    ]);
  });

  it('detects semicolon and tab delimiters and strips a BOM', () => {
    expect(parseCsv('﻿Name;Platform\nCeleste;PC')).toEqual([['Name', 'Platform'], ['Celeste', 'PC']]);
    expect(parseCsv('Name\tPlatform\nCeleste\tPC')).toEqual([['Name', 'Platform'], ['Celeste', 'PC']]);
  });

  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('parsePlatforms', () => {
  it('maps labels and aliases, splitting several in one cell', () => {
    expect(parsePlatforms('PlayStation 4; Nintendo Switch')).toEqual(['ps4', 'switch']);
    expect(parsePlatforms('Windows, Linux')).toEqual(['pc']);
    expect(parsePlatforms('Xbox Series X|S')).toEqual(['xbox_series']);
  });

  it('ignores unknown names', () => {
    expect(parsePlatforms('Atari 2600')).toEqual([]);
  });
});

describe('previewLibraryFile', () => {
  it('suggests title and platform columns from the headers', () => {
    const p = previewLibraryFile('Game Name,Console,Rating\nCeleste,Switch,5\nHades,PC,5');
    expect(p.format).toBe('csv');
    expect(p.rowCount).toBe(2);
    expect(p.suggested).toEqual({ titleColumn: 'Game Name', platformColumn: 'Console', defaultPlatform: 'pc' });
    expect(p.sampleRows[0]).toEqual({ 'Game Name': 'Celeste', Console: 'Switch', Rating: '5' });
  });

  it('reads a JSON list, flattening one level of nesting', () => {
    const p = previewLibraryFile(JSON.stringify({ games: [{ name: 'Celeste', meta: { platform: 'Switch' } }] }));
    expect(p.format).toBe('json');
    expect(p.columns).toEqual(['name', 'meta.platform']);
  });

  it('rejects empty and invalid input', () => {
    expect(() => previewLibraryFile('  ')).toThrow(/empty/);
    expect(() => previewLibraryFile('{nope')).toThrow(/valid JSON/);
    expect(() => previewLibraryFile('Title')).toThrow(/no rows/);
  });
});

describe('Google Play Takeout', () => {
  const items = [
    { libraryDoc: { doc: { documentType: 'Android Apps', title: 'Stardew Valley' }, acquisitionTime: '2021' } },
    { libraryDoc: { doc: { documentType: 'Android Apps', title: 'stardew valley' } } },
    { libraryDoc: { doc: { documentType: 'Movie', title: 'Some Film' } } },
    { libraryDoc: { doc: { documentType: 'Android Apps', title: 'Calculator' } } },
  ];

  it('keeps distinct apps, drops other media, and defaults to Android', () => {
    const table = parseLibraryFile(JSON.stringify(items));
    expect(table.format).toBe('google_play');
    expect(table.rows.map((r) => r.title)).toEqual(['Stardew Valley', 'Calculator']);
    const preview = previewLibraryFile(JSON.stringify(items));
    expect(preview.suggested).toEqual({ titleColumn: 'title', platformColumn: null, defaultPlatform: 'android' });
    expect(buildEntries(table, preview.suggested)).toEqual([
      { title: 'Stardew Valley', platforms: ['android'] },
      { title: 'Calculator', platforms: ['android'] },
    ]);
  });

  it('also reads the install-history wrapper', () => {
    const table = parseLibraryFile(JSON.stringify([{ install: { doc: { documentType: 'Android Apps', title: 'Alto' } } }]));
    expect(table.rows).toEqual([{ title: 'Alto' }]);
  });
});

describe('buildEntries', () => {
  const table = parseLibraryFile('Title,Platform\nCeleste,Switch\nceleste,PC\nHades,\n,PC\nHollow Knight,Atari');

  it('merges duplicate titles across platforms, falls back to the default platform, and drops blank titles', () => {
    expect(buildEntries(table, { titleColumn: 'Title', platformColumn: 'Platform', defaultPlatform: 'ps5' })).toEqual([
      { title: 'Celeste', platforms: ['switch', 'pc'] },
      { title: 'Hades', platforms: ['ps5'] },
      { title: 'Hollow Knight', platforms: ['ps5'] },
    ]);
  });

  it('uses the default platform for every row without a platform column', () => {
    expect(buildEntries(table, { titleColumn: 'Title', defaultPlatform: 'pc' }).every((e) => e.platforms.join() === 'pc')).toBe(true);
  });

  it('rejects an unknown column', () => {
    expect(() => buildEntries(table, { titleColumn: 'Nope', defaultPlatform: 'pc' })).toThrow(/title/);
    expect(() => buildEntries(table, { titleColumn: 'Title', platformColumn: 'Nope', defaultPlatform: 'pc' })).toThrow(/Nope/);
  });
});

describe('files built to be slow or large', () => {
  // These used to freeze the server (a JSON list whose rows each had a key of their own took quadratic time) or build a row object per line (a CSV of 2 million lines
  // used 500 MB), so they must be refused quickly, whatever the size the request body limit lets through.
  it('refuses a JSON list with a key in every row at once, and fast', () => {
    const json = '[' + Array.from({ length: 19_000 }, (_, i) => `{"title":"t","k${i}":"a"}`).join(',') + ']';
    const started = Date.now();
    expect(() => parseLibraryFile(json)).toThrow(/too many columns/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuses a CSV with more rows than allowed before building them, and fast', () => {
    const csv = 'Title\n' + 'a\n'.repeat(1_000_000);
    const started = Date.now();
    expect(() => parseLibraryFile(csv)).toThrow(/more than 20000 rows/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('refuses a JSON list over the row limit, and still takes one right at it', () => {
    const list = (n: number) => '[' + Array.from({ length: n }, () => '{"title":"t"}').join(',') + ']';
    expect(() => parseLibraryFile(list(20_001))).toThrow(/more than 20000 rows/);
    expect(parseLibraryFile(list(20_000)).rows).toHaveLength(20_000);
  });

  it('takes a CSV right at the row limit', () => {
    expect(parseLibraryFile('Title\n' + 'a\n'.repeat(20_000)).rows).toHaveLength(20_000);
  });

  it('leaves parseCsv unlimited unless told a limit', () => {
    expect(parseCsv('a\nb\nc\n')).toHaveLength(3);
    expect(() => parseCsv('a\nb\nc\n', 2)).toThrow(/more than/);
  });
});
