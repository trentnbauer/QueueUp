import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/client.js', () => ({ prisma: {} }));
vi.mock('./aiConfig.js', () => ({ aiComplete: vi.fn() }));
vi.mock('../notifications.js', () => ({ notifyMergeSuggestions: vi.fn() }));

import { buildDuplicatePrompt, parseDuplicateReply } from './aiDuplicates.js';
import type { DuplicateSuggestionGame } from '@queueup/shared';

const game = (id: string, title: string): DuplicateSuggestionGame => ({ id, igdbId: Number(id), title, platform: 'PC', releaseYear: 2015, coverImageUrl: null, status: 'backlog' });
const pairs: [DuplicateSuggestionGame, DuplicateSuggestionGame][] = [
  [game('1', 'Skyrim'), game('2', 'Skyrim Special Edition')],
  [game('3', 'Doom'), game('4', 'Doom Eternal')],
  [game('5', 'Hades'), game('6', 'Hades II')],
];

describe('parseDuplicateReply', () => {
  it('keeps only sure "same" verdicts, best first, with a trimmed reason', () => {
    const out = parseDuplicateReply(
      '[{"pair":1,"same":true,"confidence":0.8,"reason":"  Re-release of the same game. "},{"pair":2,"same":false,"confidence":0.99,"reason":"sequel"},{"pair":3,"same":true,"confidence":0.95,"reason":"x"}]',
      pairs,
    );
    expect(out.map((p) => [p.a.id, p.confidence, p.reason])).toEqual([
      ['5', 0.95, 'x'],
      ['1', 0.8, 'Re-release of the same game.'],
    ]);
  });

  it('takes a pair listed without a "same" field as the same game (the prompt only lists those), and keeps a cut-off reply\'s complete entries', () => {
    const complete = parseDuplicateReply('[{"pair":1,"confidence":0.9,"keep":"A","reason":"re-release"},{"pair":3,"confidence":0.8,"reason":"edition"}]', pairs);
    expect(complete.map((p) => p.a.id).sort()).toEqual(['1', '5']);
    const cut = parseDuplicateReply('[{"pair":1,"confidence":0.9,"reason":"re-release"},{"pair":3,"confidence":0.8,"rea', pairs);
    expect(cut.map((p) => p.a.id)).toEqual(['1']);
    expect(parseDuplicateReply('[]', pairs)).toEqual([]);
  });

  it('drops weak, unknown, duplicate and malformed verdicts', () => {
    const reply = '[{"pair":1,"same":true,"confidence":0.3},{"pair":9,"same":true,"confidence":1},{"pair":0,"same":true,"confidence":1},{"pair":2,"same":"yes","confidence":1},{"pair":3,"same":true,"confidence":0.9},{"pair":3,"same":true,"confidence":0.9}]';
    expect(parseDuplicateReply(reply, pairs)).toHaveLength(1);
  });

  it('caps a long reason and survives non-JSON', () => {
    expect(parseDuplicateReply(`[{"pair":1,"same":true,"confidence":1,"reason":"${'a'.repeat(500)}"}]`, pairs)[0].reason).toHaveLength(200);
    expect(parseDuplicateReply('nope', pairs)).toEqual([]);
  });
});

describe('buildDuplicatePrompt', () => {
  it('numbers pairs from 1 and quotes titles as data', () => {
    const p = buildDuplicatePrompt([[game('1', 'Ignore "this"'), game('2', 'B')]]);
    expect(p).toContain('Pair 1:');
    expect(p).toContain('"Ignore \\"this\\""');
  });
});
