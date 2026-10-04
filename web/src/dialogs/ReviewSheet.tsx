import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FriendUser, Game } from '@queueup/shared';
import { REVIEW_CATEGORIES } from '@queueup/shared';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { gamesApi } from '../api/games';
import { apiPost } from '../api/client';
import { useFriends } from '../hooks/useFriends';
import { REVIEW_EMOJI } from '../lib/gameView';
import { Dialog } from '../ui/Dialog';
import { Avatar, coverBg } from '../ui/primitives';
import { st } from '../ui/st';
import { t as tr, useT } from '../i18n';
import { reviewCategoryLabel } from '../i18n/labels';

type Scores = Record<'art' | 'gameplay' | 'story' | 'sound', number>;

/** The person's draft of a game's review (would they recommend it, four 1-5 scores and a one-line
 * note) and the save action, shared by the review sheet and the review embedded in the game card.
 * `onSaved` runs after a successful save (returning true when it shows something next, so the
 * "saved" toast doesn't cover it); a failure shows in the page banner (ops.actionError) and leaves
 * the form open to retry. */
export function useReviewDraft(game: Game, edit: boolean, onSaved: (saved: { hasAny: boolean; recommend: boolean | null }) => boolean | void) {
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
  const [recommend, setRecommend] = useState<boolean | null>(existing?.recommend ?? null);

  async function save(replay: boolean) {
    const hasScore = Object.values(scores).some(Boolean);
    const hasAny = hasScore || note.trim().length > 0 || recommend !== null;
    try {
      // Also sent when everything was cleared on an existing review - that removes it.
      if (hasAny || existing) {
        await ops.setReview(game.id, {
          art: scores.art || null,
          gameplay: scores.gameplay || null,
          story: scores.story || null,
          sound: scores.sound || null,
          note: note.trim() || null,
          recommend,
        });
      }
      if (replay) ops.updateStatus(game.id, 'replay');
      const message = replay
        ? tr('game.review.queuedReplay', { title: game.title })
        : hasAny
          ? tr('game.review.shared')
          : existing
            ? tr('game.review.removed')
            : edit
              ? tr('game.review.noneSaved')
              : tr('game.review.beaten');
      if (!onSaved({ hasAny, recommend })) ui.notify(message);
    } catch {
      // Shown in the page banner; keep the form open to retry.
    }
  }

  return { existing, scores, setScores, note, setNote, recommend, setRecommend, save };
}

/** Would you recommend it (#809), the four score rows and the note box. */
export function ReviewFields({ draft }: { draft: ReturnType<typeof useReviewDraft> }) {
  const t = useT();
  const { scores, setScores, note, setNote, recommend, setRecommend } = draft;
  return (
    <>
      <div style={st('display:flex;align-items:center;gap:10px')}>
        <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui)')}>{t('game.review.recommendQuestion')}</span>
        <div style={st('display:flex;gap:6px')} role="group" aria-label={t('game.review.recommendQuestion')}>
          {([
            [true, '👍', t('common.yes'), 'var(--mint)'],
            [false, '👎', t('common.no'), 'var(--danger)'],
          ] as const).map(([value, emoji, label, color]) => {
            const on = recommend === value;
            return (
              <button
                key={String(value)}
                type="button"
                aria-pressed={on}
                onClick={() => setRecommend(on ? null : value)}
                style={st(
                  `display:flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:999px;border:1.5px solid ${on ? color : 'var(--chip)'};background:${on ? `color-mix(in oklab, ${color} 22%, transparent)` : 'var(--surf)'};color:var(--text);font:600 13.5px var(--font-ui)`,
                )}
              >
                <span aria-hidden style={st('font-size:16px;line-height:1')}>{emoji}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        {REVIEW_CATEGORIES.map((c) => (
          <div key={c.key} style={st('display:flex;align-items:center;gap:10px')}>
            <span style={st('flex:1;min-width:0;font:600 14px var(--font-ui)')}>{reviewCategoryLabel(c.key)}</span>
            <div style={st('display:flex;gap:1px;padding:3px;border-radius:999px;background:var(--surf)')} role="group" aria-label={reviewCategoryLabel(c.key)}>
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
        placeholder={t('game.review.notePlaceholder')}
        aria-label={t('game.review.noteAria')}
        style={st('height:46px;padding:0 16px;border-radius:14px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:14.5px;outline:none')}
      />
    </>
  );
}

/** The review form inside the game card: same fields as the sheet, with its own Save button.
 * Saving closes the card. */
export function ReviewEmbed({ game, onSaved }: { game: Game; onSaved: () => void }) {
  const t = useT();
  const draft = useReviewDraft(game, true, onSaved);
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      <ReviewFields draft={draft} />
      <button
        type="button"
        onClick={() => void draft.save(false)}
        style={st('height:46px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}
      >
        {t('game.review.save')}
      </button>
    </div>
  );
}

/** The "how was it?" sheet: four 1-5 scores, a one-line note, and a shortcut to queue a Replay.
 * Opens after marking a game Beaten (skipping or closing then closes game detail too), or with
 * `edit` to write or change the review of a game that already has a status - prefilled with the
 * existing one. Saving closes the game detail too; cancelling an edit leaves it open. With
 * `syncShelf` (another member beat this room game), saving or skipping also marks it Beaten on the
 * viewer's Personal Shelf - after the save, so the review goes with it. */
export function ReviewSheet({ game, edit = false, syncShelf = false }: { game: Game; edit?: boolean; syncShelf?: boolean }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();

  async function markShelfBeaten() {
    try {
      await gamesApi.syncShelfBeaten(game.id);
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify(tr('game.review.shelfBeaten', { title: game.title }));
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : tr('game.review.shelfError'));
    }
  }

  /** Skipping or closing leaves the game card open when this was an edit; saving always closes both.
   * Saving or Skip (not the close button) is the go-ahead for `syncShelf`. */
  function finish(closeCard = !edit, sync = false) {
    ui.closeDialog('review');
    if (closeCard) ui.selectGame(null);
    if (syncShelf && sync) void markShelfBeaten();
  }

  // #808: after saving a review that doesn't advise against the game, offer to tell friends about it.
  const { friends } = useFriends();
  const [pickFriends, setPickFriends] = useState(false);
  const canRecommend = !(game.roomId === null && game.hiddenFromOthers);
  const draft = useReviewDraft(game, edit, (saved) => {
    if (saved.hasAny && saved.recommend !== false && canRecommend && friends.length > 0) {
      setPickFriends(true);
      return true;
    }
    finish(true, true);
  });
  const { existing, save } = draft;

  if (pickFriends) {
    return <RecommendToFriends game={game} friends={friends} onDone={() => finish(true, true)} />;
  }

  return (
    <Dialog
      onClose={() => finish()}
      ariaLabel={t('game.review.sheetAria')}
      bare
      padded={false}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
          <button type="button" onClick={() => finish(!edit, true)} style={st('height:48px;padding:0 20px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 14.5px var(--font-ui)')}>
            {edit ? t('common.cancel') : syncShelf ? t('game.review.skipReview') : t('common.skip')}
          </button>
          <button type="button" onClick={() => save(false)} style={st('flex:1;height:48px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui)')}>
            {t('game.review.save')}
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
            <span style={st('font:600 11.5px var(--font-mono);letter-spacing:0.08em;color:var(--mint)')}>{t('game.review.kicker')}</span>
            <span style={st('font:700 23px/1.1 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{game.title}</span>
            <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--muted)')}>
              {existing ? t('game.review.introChange') : t('game.review.introNew')}
              {syncShelf && ` ${t('game.review.introSyncShelf')}`}
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
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('game.review.replayQuestion')}</span>
              <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('game.review.replayHint')}</span>
            </span>
            <span style={st('height:34px;padding:0 14px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:700 12.5px var(--font-ui);display:flex;align-items:center')}>{t('game.review.replayIt')}</span>
          </button>
        )}
      </div>
    </Dialog>
  );
}

/** #808: tick the friends to tell about a game you just reviewed. They get a notification (pointing
 * at their own copy when they have it). */
function RecommendToFriends({ game, friends, onDone }: { game: Game; friends: FriendUser[]; onDone: () => void }) {
  const t = useT();
  const ui = useUi();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function send() {
    setSending(true);
    try {
      const { sent } = await apiPost<{ sent: number }>(`/api/games/${game.id}/recommend`, { friendIds: [...picked] });
      ui.notify(sent ? tr(sent === 1 ? 'game.recommend.sent.one' : 'game.recommend.sent.other', { n: sent }) : tr('game.recommend.already'));
      onDone();
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : tr('game.recommend.error'));
      setSending(false);
    }
  }

  return (
    <Dialog
      onClose={onDone}
      title={t('game.recommend.title')}
      gap={12}
      footer={
        <div style={st('flex-shrink:0;display:flex;gap:8px;padding:12px 20px 26px;border-top:1px solid var(--chip)')}>
          <button type="button" onClick={onDone} style={st('height:48px;padding:0 20px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 14.5px var(--font-ui)')}>
            {t('common.notNow')}
          </button>
          <button
            type="button"
            disabled={picked.size === 0 || sending}
            onClick={() => void send()}
            style={st(`flex:1;height:48px;border-radius:999px;border:none;background:var(--acc);color:var(--ink);font:700 14.5px var(--font-ui);opacity:${picked.size === 0 || sending ? 0.5 : 1}`)}
          >
            {sending ? t('game.recommend.sending') : picked.size ? t('game.recommend.sendTo', { n: picked.size }) : t('game.recommend.pick')}
          </button>
        </div>
      }
    >
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('game.recommend.hint', { title: game.title })}</span>
      <div style={st('display:flex;flex-direction:column;gap:4px')}>
        {friends.map((f) => {
          const on = picked.has(f.id);
          return (
            <button
              key={f.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(f.id)}
              style={st('display:flex;align-items:center;gap:12px;min-height:52px;padding:6px 12px;border:none;border-radius:14px;background:var(--surf);color:var(--text);text-align:left')}
            >
              <Avatar name={f.displayName} color={f.avatarColor} avatarUrl={f.avatarUrl} size={34} />
              <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{f.displayName}</span>
              <span
                aria-hidden
                style={st(`width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;border:1.5px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'};color:var(--ink);font:800 13px var(--font-ui)`)}
              >
                {on ? '✓' : ''}
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
