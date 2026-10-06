import { COMPUTER_SPEC_NOTES_MAX, COMPUTER_SPEC_STORAGE, COMPUTER_SPEC_TEXT_MAX, EMPTY_COMPUTER_SPECS, type ComputerSpecs } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';

function text(v: unknown, name: string, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new HttpError(400, `${name} must be text`);
  const t = v.replace(/\s+/g, ' ').trim();
  if (t.length > max) throw new HttpError(400, `${name} can be at most ${max} characters`);
  return t || null;
}

function whole(v: unknown, name: string, max: number): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new HttpError(400, `${name} must be a whole number from 0 to ${max}`);
  return v;
}

/** Checks what a person typed and turns it into the specs to store: text trimmed and length-limited,
 * numbers whole and sane, anything left out or blank stored as empty. Never trusts the shape. */
export function parseComputerSpecs(input: unknown): ComputerSpecs {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Send the specs as an object');
  const b = input as Record<string, unknown>;
  const storage = b.storage === undefined || b.storage === null || b.storage === '' ? null : b.storage;
  if (storage !== null && !(COMPUTER_SPEC_STORAGE as readonly unknown[]).includes(storage)) throw new HttpError(400, 'storage must be ssd, hdd or nvme');
  return {
    cpu: text(b.cpu, 'cpu', COMPUTER_SPEC_TEXT_MAX),
    gpu: text(b.gpu, 'gpu', COMPUTER_SPEC_TEXT_MAX),
    ramGb: whole(b.ramGb, 'ramGb', 4096),
    vramGb: whole(b.vramGb, 'vramGb', 1024),
    os: text(b.os, 'os', COMPUTER_SPEC_TEXT_MAX),
    storage: storage as ComputerSpecs['storage'],
    freeGb: whole(b.freeGb, 'freeGb', 1_000_000),
    display: text(b.display, 'display', COMPUTER_SPEC_TEXT_MAX),
    notes: text(b.notes, 'notes', COMPUTER_SPEC_NOTES_MAX),
  };
}

export const isEmptySpecs = (s: ComputerSpecs) => (Object.keys(EMPTY_COMPUTER_SPECS) as (keyof ComputerSpecs)[]).every((k) => s[k] === null);

/** A stored row as the specs shape (or the empty one when there is none). */
export function specsFromRow(row: (Omit<ComputerSpecs, 'storage'> & { storage: string | null }) | null): ComputerSpecs {
  if (!row) return { ...EMPTY_COMPUTER_SPECS };
  const { cpu, gpu, ramGb, vramGb, os, storage, freeGb, display, notes } = row;
  return { cpu, gpu, ramGb, vramGb, os, storage: (COMPUTER_SPEC_STORAGE as readonly string[]).includes(storage ?? '') ? (storage as ComputerSpecs['storage']) : null, freeGb, display, notes };
}

/** Fills only the blanks: every field the person already has stays as it is, and a field they have not
 * filled in takes the incoming value. Returns the merged specs and which fields were filled. Used when a
 * tool on the person's PC (the Playnite extension) reports specs, so it can never overwrite what they
 * typed in themselves. */
export function prefillSpecs(existing: ComputerSpecs, incoming: ComputerSpecs): { specs: ComputerSpecs; filled: (keyof ComputerSpecs)[] } {
  const specs: ComputerSpecs = { ...existing };
  const filled: (keyof ComputerSpecs)[] = [];
  for (const key of Object.keys(EMPTY_COMPUTER_SPECS) as (keyof ComputerSpecs)[]) {
    if (existing[key] === null && incoming[key] !== null) {
      (specs as unknown as Record<string, unknown>)[key] = incoming[key];
      filled.push(key);
    }
  }
  return { specs, filled };
}
