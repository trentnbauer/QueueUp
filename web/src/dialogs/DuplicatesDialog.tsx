import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiDuplicateScanResponse, DuplicateSuggestion, DuplicateSuggestionGame } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { gamesApi } from '../api/games';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { AiPickedBadge, Banner, Btn, Cover, Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];

const pairKey = (p: DuplicateSuggestion) => `${p.a.id}:${p.b.id}`;

function GameLine({ g, label }: { g: DuplicateSuggestionGame; label: string }) {
  return (
    <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
      <Kicker size={10.5}>{label}</Kicker>
      <div style={st('display:flex;gap:10px;align-items:center;min-width:0')}>
        <Cover title={g.title} url={g.coverImageUrl} width={44} radius={7} />
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 14px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
          <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
    </div>
  );
}

/** AI duplicate finder (issue #824): scans the shelf for cards that are probably the same game and
 * walks through them one at a time in a popup, asking yes or no before anything is merged (a merge
 * removes a card). The suggestion is always to merge into the base game / earlier release. */
export function DuplicatesDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const aiReady = !!ai.data && ai.data.effectiveSource !== 'none';
  const [scan, setScan] = useState<AiDuplicateScanResponse | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [tally, setTally] = useState({ merged: 0, kept: 0, skipped: 0 });
  const [error, setError] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: () => gamesApi.aiScanDuplicates(),
    onSuccess: (res) => {
      // A run that ended early (provider error, the daily limit on the shared AI) keeps what it found.
      setError(res.stopped ? t('add.review.ai.stopped', { reason: res.stopped }) : null);
      setGone([]);
      setSkipped([]);
      setFlipped([]);
      setTally({ merged: 0, kept: 0, skipped: 0 });
      setScan(res);
      setReviewing(res.pairs.length > 0);
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });
  const merge = useMutation({
    mutationFn: ({ remove, keep }: { remove: DuplicateSuggestionGame; keep: DuplicateSuggestionGame }) => gamesApi.mergeGame(remove.id, { targetGameId: keep.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.mergeFailed')),
  });
  const dismiss = useMutation({
    mutationFn: (p: DuplicateSuggestion) => gamesApi.dismissDuplicate({ gameIdA: p.a.id, gameIdB: p.b.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });

  /** The card to keep for a pair: the AI's pick (the base game / earlier release), unless the person
   * flipped it in the popup. */
  const keepOf = (p: DuplicateSuggestion): DuplicateSuggestionGame => {
    const useA = (p.keep === 'a') !== flipped.includes(pairKey(p));
    return useA ? p.a : p.b;
  };
  const removeOf = (p: DuplicateSuggestion): DuplicateSuggestionGame => (keepOf(p).id === p.a.id ? p.b : p.a);

  async function mergeNow(p: DuplicateSuggestion, keep: DuplicateSuggestionGame) {
    const remove = keep.id === p.a.id ? p.b : p.a;
    setError(null);
    await merge.mutateAsync({ remove, keep });
    setGone((g) => [...g, pairKey(p)]);
    setTally((n) => ({ ...n, merged: n.merged + 1 }));
    void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    ui.notify(t('settings.duplicates.merged', { remove: remove.title, keep: keep.title }));
  }

  /** From the list below the popup: the same merge, with its own confirmation. */
  async function mergePair(p: DuplicateSuggestion, keep: DuplicateSuggestionGame) {
    const remove = keep.id === p.a.id ? p.b : p.a;
    const ok = await confirm({
      title: t('settings.duplicates.confirmTitle', { remove: remove.title, keep: keep.title }),
      message: t('settings.duplicates.confirmMessage', { remove: remove.title, keep: keep.title }),
      confirmLabel: t('settings.duplicates.merge'),
      danger: true,
    });
    if (ok) await mergeNow(p, keep);
  }

  async function notDuplicates(p: DuplicateSuggestion) {
    setError(null);
    await dismiss.mutateAsync(p);
    setGone((g) => [...g, pairKey(p)]);
    setTally((n) => ({ ...n, kept: n.kept + 1 }));
  }

  const pairs = (scan?.pairs ?? []).filter((p) => !gone.includes(pairKey(p)));
  // What the popup still has to ask about: everything not merged, dismissed or put off.
  const queue = pairs.filter((p) => !skipped.includes(pairKey(p)));
  const busy = run.isPending || merge.isPending || dismiss.isPending;
  const total = scan?.pairs.length ?? 0;

  // When the last question has been answered, close the popup and say how it went.
  useEffect(() => {
    if (reviewing && queue.length === 0) {
      setReviewing(false);
      ui.notify(t('settings.duplicates.reviewDone', tally));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, queue.length]);

  const current = reviewing ? queue[0] : undefined;

  return (
    <>
      <Dialog onClose={() => ui.closeDialog('duplicates')} title={t('settings.duplicates.title')} gap={14}>
        <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.duplicates.intro')}</span>
        {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
        {ai.data && !aiReady ? (
          <span style={st('font:500 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{t('settings.duplicates.needsAi')}</span>
        ) : (
          <div style={st('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}>
            <Btn height={40} padX={18} disabled={busy || !aiReady} onClick={() => run.mutate()}>
              {run.isPending ? t('settings.duplicates.scanning') : scan ? t('settings.duplicates.scanAgain') : t('settings.duplicates.scan')}
            </Btn>
            {pairs.length > 0 && !reviewing && (
              <Btn kind="soft" height={40} padX={18} disabled={busy} onClick={() => { setSkipped([]); setReviewing(true); }}>
                {t('settings.duplicates.reviewButton', { n: pairs.length })}
              </Btn>
            )}
          </div>
        )}
        {scan && pairs.length === 0 && <span style={st('font:500 14px/1.45 var(--font-ui)')}>{scan.pairs.length === 0 ? t('settings.duplicates.none', { n: scan.checked }) : t('settings.duplicates.allDone')}</span>}
        {pairs.map((p) => (
          <div key={pairKey(p)} style={st('display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:var(--surf)')}>
            <div style={st('display:flex;align-items:center;gap:8px')}>
              <AiPickedBadge title={t('settings.duplicates.badge')} />
              <Kicker size={11}>{t('settings.duplicates.confidence', { n: Math.round(p.confidence * 100) })}</Kicker>
            </div>
            <div style={st('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
              {[p.a, p.b].map((g) => {
                const original = keepOf(p).id === g.id;
                return (
                  <div key={g.id} style={st(`min-width:0;display:flex;flex-direction:column;gap:8px;padding:8px;margin:-8px;border-radius:14px;${original ? 'background:var(--accSoft)' : ''}`)}>
                    {original && <Kicker size={10.5}>{t('settings.duplicates.original')}</Kicker>}
                    <div style={st('display:flex;gap:10px;align-items:center;min-width:0')}>
                      <Cover title={g.title} url={g.coverImageUrl} width={40} radius={7} />
                      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                        <span style={st('font:600 14px var(--font-ui);overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
                        <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
                      </span>
                    </div>
                    <Btn kind={original ? 'accent' : 'soft'} height={36} padX={10} fontSize={12.5} disabled={busy} onClick={() => void mergePair(p, g)}>
                      {t('settings.duplicates.keepThis')}
                    </Btn>
                  </div>
                );
              })}
            </div>
            {p.reason && <span style={st('font:400 13px/1.4 var(--font-ui);color:var(--text2)')}>{p.reason}</span>}
            <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={busy} onClick={() => void notDuplicates(p)}>
              {t('settings.duplicates.notDuplicates')}
            </Btn>
          </div>
        ))}
      </Dialog>

      {current && (
        <Dialog onClose={() => setReviewing(false)} title={t('settings.duplicates.reviewTitle')} gap={14} width={480}>
          <div style={st('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
            <AiPickedBadge title={t('settings.duplicates.badge')} />
            <Kicker size={11}>{t('settings.duplicates.reviewProgress', { i: Math.min(total, total - queue.length + 1), n: total })}</Kicker>
            <Kicker size={11}>{t('settings.duplicates.confidence', { n: Math.round(current.confidence * 100) })}</Kicker>
          </div>
          <span style={st('font:700 19px/1.25 var(--font-display);letter-spacing:-0.01em;overflow-wrap:anywhere')}>
            {t('settings.duplicates.reviewQuestion', { remove: removeOf(current).title, keep: keepOf(current).title })}
          </span>
          <div style={st('display:flex;flex-direction:column;gap:12px;padding:12px;border-radius:16px;background:var(--surf)')}>
            <GameLine g={removeOf(current)} label={t('settings.duplicates.willBeRemoved')} />
            <GameLine g={keepOf(current)} label={t('settings.duplicates.original')} />
          </div>
          {current.reason && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{current.reason}</span>}
          <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.duplicates.reviewConsequence', { keep: keepOf(current).title })}</span>
          <div style={st('display:flex;gap:10px;flex-wrap:wrap')}>
            <Btn kind="accent" height={46} padX={20} weight={700} disabled={busy} onClick={() => void mergeNow(current, keepOf(current))}>
              {merge.isPending ? t('settings.duplicates.merging') : t('settings.duplicates.reviewYes')}
            </Btn>
            <Btn height={46} padX={20} weight={700} disabled={busy} onClick={() => void notDuplicates(current)}>
              {t('settings.duplicates.reviewNo')}
            </Btn>
          </div>
          <div style={st('display:flex;gap:14px;flex-wrap:wrap')}>
            <Btn kind="ghost" height={32} padX={10} fontSize={12.5} disabled={busy} onClick={() => setFlipped((f) => (f.includes(pairKey(current)) ? f.filter((k) => k !== pairKey(current)) : [...f, pairKey(current)]))}>
              {t('settings.duplicates.reviewFlip')}
            </Btn>
            <Btn
              kind="ghost"
              height={32}
              padX={10}
              fontSize={12.5}
              disabled={busy}
              onClick={() => {
                setSkipped((s) => [...s, pairKey(current)]);
                setTally((n) => ({ ...n, skipped: n.skipped + 1 }));
              }}
            >
              {t('settings.duplicates.reviewLater')}
            </Btn>
          </div>
        </Dialog>
      )}
    </>
  );
}
