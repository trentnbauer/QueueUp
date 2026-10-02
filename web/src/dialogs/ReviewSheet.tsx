import { useState } from 'react';
import type { Game } from '@queueup/shared';
import { REVIEW_CATEGORIES } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { REVIEW_EMOJI } from '../lib/gameView';
import { Dialog } from '../ui/Dialog';
import { coverBg } from '../ui/primitives';
import { st } from '../ui/st';

type Scores = Record<'art' | 'gameplay' | 'story' | 'sound', number>;

/** The person's draft of a game's review (four 1-5 scores + a one-line note) and the save action,
 * shared by the review sheet and the review embedded in the game card. `onSaved` runs after a
 * successful save; a failure shows in the page banner (ops.actionError) and leaves the form open
 * to retry. */
export function useReviewDraft(game: Game, edit: boolean, onSaved: () => void) {
  const { ops } = useScope();
  const ui = useUi();
  const existing = game.review;
  const [scores, setScores] = useState<Scores>({
    art: existing?.art ?? 0,
    gameplay: existing?.gameplay ?? 0,
    story: existing?.story ?? 0,
    sound: existing?.sound ?? 0,
  });
  const [note, setNote] = useState(existing?.note ?? '');

  async function save(replay: boolean) {
    const hasScore = Object.values(scores).some(Boolean);
    const hasAny = hasScore || note.trim().length > 0;
    try {
      // Also sent when everything was cleared on an existing review - that removes it.
      if (hasAny || existing) {
        await ops.setReview(game.id, {
          art: scores.art || null,
          gameplay: scores.gameplay || null,
          story: scores.story || null,
          sound: scores.sound || null,
          note: note.trim() || null,
        });
      }
      if (replay) ops.updateStatus(game.id, 'replay');
      ui.notify(
        replay
          ? `${game.title} is queued for a Replay`
          : hasAny
            ? 'Review shared to your activity'
            : existing
              ? 'Review removed'
              : edit
                ? 'No review saved'
                : 'Beaten',
      );
      onSaved();
    } catch {
      // Shown in the page banner; keep the form open to retry.
    }
  }

  return { existing, scores, setScores, note, setNote, save };
}

/** The four score rows and the note box. */
export function ReviewFields({ draft }: { draft: ReturnType<typeof useReviewDraft> }) {
  const { scores, setScores, note, setNote } = draft;
  return (
    <>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        {REVIEW_CATEGORIES.map((c) => (
          <div key={c.key} style={st('display:flex;align-items:center;gap:10px')}>
            <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui)')}>{c.label}</span>
            <div style={st('display:flex;gap:1px;padding:3px;border-radius:999px;background:var(--surf)')} role="group" aria-label={c.label}>
              {[1, 2, 3, 4, 5].map((v) => {
                const on = scores[c.key] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    aria-label={REVIEW_EMOJI[v].l}
                    aria-pressed={on}
                    onClick={() => setScores((s) => ({ ...s, [c.key]: s[c.key] === v ? 0 : v }))}
                    style={st(`width:38px;height:34px;border:none;border-radius:999px;background:${on ? 'var(--acc)' : 'transparent'};opacity:${scores[c.key] && !on ? 0.4 : 1};font-size:17px;line-height:1;padding:0`)}
                  >
                    {REVIEW_EMOJI[v].e}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={280}
        placeholder="One line about it (optional)"
        aria-label="Review note"
        style={st('height:46px;padding:0 16px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:14.5px;outline:none')}
      />
    </>
  );
}

/** The review form inside the game card: same fields as the sheet, with its own Save button.
 * Saving closes the card. */
export function ReviewEmbed({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const draft = useReviewDraft(game, true, onSaved);
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      <ReviewFields draft={draft} />
      <button
        type="button"
        onClick={() => void draft.save(false)}
        style={st('height:46px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}
      >
        Save review
      </button>
    </div>
  );
}

/** The "how was it?" sheet: four 1-5 scores, a one-line note, and a shortcut to queue a Replay.
 * Opens after marking a game Beaten (skipping or closing then closes game detail too), or with
 * `edit` to write or change the review of a game that already has a status - prefilled with the
 * existing one. Saving closes the game detail too; cancelling an edit leaves it open. */
export function ReviewSheet({ game, edit = false }: { game: Game; edit?: boolean }) {
  const ui = useUi();

  /** Skipping or closing leaves the game card open when this was an edit; saving always closes both. */
  function finish(closeCard = !edit) {
    ui.closeDialog('review');
    if (closeCard) ui.selectGame(null);
  }

  const draft = useReviewDraft(game, edit, () => finish(true));
  const { existing, save } = draft;

  return (
    <Dialog
      onClose={() => finish()}
      ariaLabel="Review this game"
      bare
      padded={false}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
          <button type="button" onClick={() => finish()} style={st('height:48px;padding:0 20px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 14.5px var(--font-ui)')}>
            {edit ? 'Cancel' : 'Skip'}
          </button>
          <button type="button" onClick={() => save(false)} style={st('flex:1;height:48px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}>
            Save review
          </button>
        </div>
      }
    >
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:22px 20px 16px;display:flex;flex-direction:column;gap:18px')}>
        <div style={st('display:flex;align-items:center;gap:14px')}>
          <span
            style={{
              width: 56,
              aspectRatio: '2/3',
              flexShrink: 0,
              borderRadius: 12,
              background: coverBg(game.title, game.coverImageUrl),
              boxShadow: '0 8px 22px oklch(0 0 0 / 0.3)',
            }}
          />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
            <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--mint)')}>BEATEN</span>
            <span style={st('font:700 23px/1.1 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{game.title}</span>
            <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>
              {existing ? 'Change your review - it updates in your friends\' activity.' : "How was it? Your review shows in your friends' activity."}
            </span>
          </span>
        </div>

        <ReviewFields draft={draft} />

        {game.status !== 'replay' && (
          <button
            type="button"
            onClick={() => save(true)}
            style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px 8px 16px;border-radius:16px;border:1px dashed var(--line);background:transparent;color:var(--text);text-align:left')}
          >
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>Replay?</span>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>Queue it up for another run</span>
            </span>
            <span style={st('height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:700 12.5px var(--font-ui);display:flex;align-items:center')}>Replay it</span>
          </button>
        )}
      </div>
    </Dialog>
  );
}
