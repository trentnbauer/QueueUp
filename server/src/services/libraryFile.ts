import { ROOM_PLATFORM_LABELS, type LibraryFileFormat, type LibraryFileMapping, type LibraryFilePreview, type LibraryImportEntry, type RoomPlatform } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';

/** Reads a CSV or JSON library export (a store, a tracker like Backloggd or Grouvee, a spreadsheet)
 * into rows, and turns rows into LibraryImportEntry with a column mapping. Pure functions: the
 * matching and shelf work is the shared library sync (librarySync.ts). Hand-written, no dependency. */

export const MAX_FILE_ENTRIES = 20_000;
const MAX_COLUMNS = 200;
const SAMPLE_ROWS = 5;
const tooManyRows = `That file has more than ${MAX_FILE_ENTRIES} rows. Split it and import the parts.`;

export interface ParsedTable {
  format: LibraryFileFormat;
  columns: string[];
  rows: Record<string, string>[];
}

/** RFC 4180 style CSV with a guessed delimiter (comma, semicolon or tab). Quoted fields may hold
 * delimiters, doubled quotes and line breaks. Stops as soon as there are more than `maxRows` rows, so a file of nothing but line breaks cannot make it build millions. */
export function parseCsv(input: string, maxRows = Infinity): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const endRow = () => {
    row.push(field);
    field = '';
    if (row.some((c) => c.trim() !== '')) out.push(row);
    if (out.length > maxRows) throw new HttpError(400, tooManyRows);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else field += ch;
    i++;
  }
  if (field !== '' || row.length > 0) endRow();
  return out;
}

function uniqueHeaders(raw: string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, idx) => {
    const base = h.trim() || `Column ${idx + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
}

function tableFromCsv(text: string): ParsedTable {
  // The header and then the rows: one more than the most, so a file over the limit is refused here, before a row object is built for every line.
  const grid = parseCsv(text, MAX_FILE_ENTRIES + 1);
  if (grid.length < 2) throw new HttpError(400, 'That file has no rows to import.');
  const columns = uniqueHeaders(grid[0]!);
  if (columns.length > MAX_COLUMNS) throw new HttpError(400, 'That file has too many columns.');
  const rows = grid.slice(1).map((cells) => Object.fromEntries(columns.map((c, idx) => [c, (cells[idx] ?? '').trim()])));
  return { format: 'csv', columns, rows };
}

type Json = unknown;

function isObject(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** One level of nesting becomes "outer.inner" columns; deeper values and arrays of objects are skipped. */
function flatten(obj: Record<string, Json>, prefix = '', depth = 0, into: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') into[key] = String(v).trim();
    else if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'string' || typeof x === 'number')) into[key] = v.join(', ');
    } else if (isObject(v) && depth < 1) flatten(v, key, depth + 1, into);
  }
  return into;
}

/** The "doc" block Google Takeout wraps around each Play Store item (Library, Installs, Purchase
 * History all use it, under a different wrapper key in each file). */
function googlePlayDoc(item: Json): { title: string; documentType: string } | null {
  if (!isObject(item)) return null;
  const candidates = [item, ...Object.values(item).filter(isObject)];
  for (const c of candidates) {
    const doc = c.doc;
    if (isObject(doc) && typeof doc.title === 'string' && doc.title.trim()) {
      return { title: doc.title.trim(), documentType: typeof doc.documentType === 'string' ? doc.documentType : '' };
    }
  }
  return null;
}

function tableFromJson(text: string): ParsedTable {
  let data: Json;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new HttpError(400, 'That file is not valid JSON.');
  }
  let list: Json[] | null = null;
  if (Array.isArray(data)) list = data;
  else if (isObject(data)) {
    const arrays = Object.values(data).filter((v): v is Json[] => Array.isArray(v) && v.length > 0 && v.every(isObject));
    if (arrays.length > 0) list = arrays.sort((a, b) => b.length - a.length)[0]!;
  }
  if (!list || list.length === 0) throw new HttpError(400, 'Could not find a list of games in that JSON file.');
  if (list.length > MAX_FILE_ENTRIES) throw new HttpError(400, tooManyRows);

  const docs = list.map(googlePlayDoc);
  if (docs.filter(Boolean).length > list.length / 2) {
    const titles = new Set<string>();
    const rows: Record<string, string>[] = [];
    for (const d of docs) {
      // Takeout also lists movies, books and music; apps (games are apps) only.
      if (!d || (d.documentType && !/app|game/i.test(d.documentType))) continue;
      const key = d.title.toLowerCase();
      if (titles.has(key)) continue;
      titles.add(key);
      rows.push({ title: d.title });
    }
    if (rows.length === 0) throw new HttpError(400, 'No apps found in that Google Play file.');
    return { format: 'google_play', columns: ['title'], rows };
  }

  const rows = list.filter(isObject).map((o) => flatten(o));
  // A set, and refused as soon as there are too many: looking each key up in a growing list took quadratic time, so a file of rows that each had a key of their own froze the server.
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      seen.add(k);
      if (seen.size > MAX_COLUMNS) throw new HttpError(400, 'That file has too many columns.');
    }
  }
  const columns = [...seen];
  if (columns.length === 0) throw new HttpError(400, 'Could not find a list of games in that JSON file.');
  return { format: 'json', columns, rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? '']))) };
}

export function parseLibraryFile(text: string): ParsedTable {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (!trimmed) throw new HttpError(400, 'That file is empty.');
  const table = trimmed.startsWith('[') || trimmed.startsWith('{') ? tableFromJson(trimmed) : tableFromCsv(trimmed);
  if (table.rows.length > MAX_FILE_ENTRIES) throw new HttpError(400, tooManyRows);
  return table;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const PLATFORM_ALIASES: Record<string, RoomPlatform> = {
  windows: 'pc', win: 'pc', steam: 'pc', gog: 'pc', epic: 'pc', epicgames: 'pc', itchio: 'pc', mac: 'pc', macos: 'pc', linux: 'pc', pcwindows: 'pc', pcmicrosoftwindows: 'pc',
  ps1: 'ps1', psx: 'ps1', playstation: 'ps1', ps2: 'ps2', ps3: 'ps3', ps4: 'ps4', ps5: 'ps5', psp: 'psp', psvita: 'vita', playstationvita: 'vita',
  xbox360: 'xbox_360', xboxone: 'xbox_one', xbox: 'xbox_one', xboxseries: 'xbox_series', xboxseriesx: 'xbox_series', xboxseriess: 'xbox_series', xboxseriesxs: 'xbox_series',
  nintendoswitch: 'switch', switch: 'switch', nintendoswitch2: 'switch2', switch2: 'switch2',
  wiiu: 'wii_u', nintendowiiu: 'wii_u', nintendowii: 'wii', gamecube: 'gamecube', ngc: 'gamecube', nintendogamecube: 'gamecube',
  nintendo64: 'n64', nintendo3ds: 'n3ds', '3ds': 'n3ds', nintendods: 'ds', nds: 'ds', gameboy: 'gb', gameboycolor: 'gbc', gameboyadvance: 'gba',
  nes: 'nes', nintendoentertainmentsystem: 'nes', snes: 'snes', supernintendo: 'snes', superfamicom: 'snes',
  segagenesis: 'genesis', megadrive: 'genesis', segamegadrive: 'genesis', segasaturn: 'saturn', segadreamcast: 'dreamcast', segamastersystem: 'master_system',
  metaquest: 'quest', oculusquest: 'quest', metaquest2: 'quest2', oculusquest2: 'quest2', metaquest3: 'quest3',
  iphone: 'ios', ipad: 'ios', applearcade: 'ios',
};

let platformLookup: Map<string, RoomPlatform> | null = null;
function lookup(): Map<string, RoomPlatform> {
  if (!platformLookup) {
    platformLookup = new Map();
    for (const [id, label] of Object.entries(ROOM_PLATFORM_LABELS)) {
      platformLookup.set(norm(id), id as RoomPlatform);
      platformLookup.set(norm(label), id as RoomPlatform);
    }
    for (const [alias, id] of Object.entries(PLATFORM_ALIASES)) platformLookup.set(alias, id);
  }
  return platformLookup;
}

/** The platforms a cell names ("PC", "PlayStation 4; Nintendo Switch"). Unknown names are ignored. */
export function parsePlatforms(cell: string): RoomPlatform[] {
  const found = new Set<RoomPlatform>();
  for (const part of cell.split(/[,;|/\n]+/)) {
    const id = lookup().get(norm(part));
    if (id) found.add(id);
  }
  return [...found];
}

const TITLE_HEADERS = ['title', 'gametitle', 'gamename', 'name', 'game', 'apptitle', 'appname'];
const PLATFORM_HEADERS = ['platform', 'platforms', 'system', 'console', 'store', 'device'];

function findColumn(columns: string[], wanted: string[]): string | null {
  for (const w of wanted) {
    const hit = columns.find((c) => norm(c) === w);
    if (hit) return hit;
  }
  return null;
}

export function suggestMapping(table: ParsedTable): LibraryFileMapping {
  if (table.format === 'google_play') return { titleColumn: 'title', platformColumn: null, defaultPlatform: 'android' };
  const title = findColumn(table.columns, TITLE_HEADERS) ?? table.columns[0]!;
  const platform = findColumn(table.columns, PLATFORM_HEADERS);
  return { titleColumn: title, platformColumn: platform, defaultPlatform: 'pc' };
}

export function previewLibraryFile(text: string): LibraryFilePreview {
  const table = parseLibraryFile(text);
  return {
    format: table.format,
    columns: table.columns,
    sampleRows: table.rows.slice(0, SAMPLE_ROWS),
    rowCount: table.rows.length,
    suggested: suggestMapping(table),
  };
}

/** Turns rows into one entry per distinct title: platforms are unioned. */
export function buildEntries(table: ParsedTable, mapping: LibraryFileMapping): LibraryImportEntry[] {
  if (!table.columns.includes(mapping.titleColumn)) throw new HttpError(400, 'Pick the column that holds the game title.');
  for (const col of [mapping.platformColumn]) {
    if (col && !table.columns.includes(col)) throw new HttpError(400, `That file has no column called "${col}".`);
  }
  const byTitle = new Map<string, LibraryImportEntry>();
  for (const row of table.rows) {
    const title = (row[mapping.titleColumn] ?? '').trim();
    if (!title || title.length > 300) continue;
    const named = mapping.platformColumn ? parsePlatforms(row[mapping.platformColumn] ?? '') : [];
    const platforms = named.length > 0 ? named : [mapping.defaultPlatform];
    const key = title.toLowerCase();
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, { title, platforms });
      continue;
    }
    for (const p of platforms) if (!existing.platforms.includes(p)) existing.platforms.push(p);
  }
  if (byTitle.size === 0) throw new HttpError(400, 'No games found with that title column.');
  return [...byTitle.values()];
}
