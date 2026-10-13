import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiDuplicateScanResponse, DuplicateSuggestion, DuplicateSuggestionGame } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { DUPLICATE_COUNT_QUERY_KEY, DUPLICATE_LIST_QUERY_KEY, gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { MergeDirection } from '../ui/MergeDirection';
import { trackAiActivity } from '../hooks/useAiActivity';
import { useUndoChange } from '../hooks/useUndoChange';
import { AiPickedBadge, Banner, Btn, Cover, Kicker, Spinner } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];

/** A pair to show: one the AI judged, or a title-match candidate nobody has judged yet. */
type Row = DuplicateSuggestion & { ai: boolean; /** How many other people merged this pair (0 when none). */ community: number };

const pairKey = (p: DuplicateSuggestion) => `${p.a.id}:${p.b.id}`;

/** One card of the pair: tap it to keep it. Shows what tells two games apart - year, platform,
 * genre, developer and publisher. */
function GameCard({ g, keeping, disabled, onKeep, onBundle }: { g: DuplicateSuggestionGame; keeping: boolean; disabled: boolean; onKeep: () => void; onBundle: () => void }) {
  const t = useT();
  const details: [string, string | null | undefined][] = [
    [t('settings.duplicates.genre'), g.genre],
    [t('settings.duplicates.developer'), g.developer],
    [t('settings.duplicates.publisher'), g.publisher],
  ];
  return (
    <div style={st('display:flex;flex-direction:column;gap:4px')}>
      <button
        type="button"
        aria-pressed={keeping}
        disabled={disabled}
        onClick={onKeep}
        style={st(`display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:18px;border:2px solid ${keeping ? 'var(--acc)' : 'transparent'};background:${keeping ? 'var(--accSoft)' : 'var(--surf)'};color:var(--text);text-align:left`)}
      >
        <Kicker size={10.5}>{keeping ? t('settings.duplicates.keeping') : t('settings.duplicates.willBeRemoved')}</Kicker>
        <span style={st('display:flex;gap:12px;align-items:center;min-width:0')}>
          <Cover title={g.title} url={g.coverImageUrl} width={52} radius={8} />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
            <span style={st('font:600 15px/1.3 var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
          </span>
        </span>
        <span style={st('display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font:400 13px/1.35 var(--font-ui)')}>
          {details.map(([label, value]) => (
            <span key={label} style={st('display:contents')}>
              <span style={st('color:var(--muted)')}>{label}</span>
              <span style={st(`min-width:0;overflow-wrap:anywhere;${value ? '' : 'color:var(--muted)'}`)}>{value || t('settings.duplicates.unknown')}</span>
            </span>
          ))}
        </span>
      </button>
      <Btn kind="ghost" height={30} padX={8} fontSize={12} disabled={disabled} title={t('settings.duplicates.markBundleHint')} style={{ alignSelf: 'flex-start' }} onClick={onBundle}>
        {t('settings.duplicates.markBundle')}
      </Btn>
    </div>
  );
}

/** Duplicate finder (issue #824): the shelf's likely duplicates, one pair per screen like the match
 * dialog - title matches straight away, or what the AI scan judged to be the same game. Nothing is
 * merged until the person says so (a merge removes a card, and can be undone from its toast). The
 * suggestion is always to keep the base game / earlier release; tapping the other card keeps that. */
export function DuplicatesDialog() {
  const t = useT();
  const ui = useUi();
  const undoable = useUndoChange();
  const queryClient = useQueryClient();
  const ai = useQuery({ queryKey: AI_SETTINGS_QUERY_KEY, queryFn: aiApi.mine });
  const aiReady = !!ai.data && ai.data.effectiveSource !== 'none';
  const [scan, setScan] = useState<AiDuplicateScanResponse | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [flipped, setFlipped] = useState<string[]>([]);
  // Pairs already passed (skipped, merged or dismissed), newest last, for "Back"; and the one Back
  // brought to the front of the line, if any.
  const [history, setHistory] = useState<string[]>([]);
  const [front, setFront] = useState<string | null>(null);
  // Cards marked as bundles this session: every pair they are in drops out at once.
  const [bundled, setBundled] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The pairs behind the shelf's "possible duplicates" count (title matches, no AI): shown straight
  // away, so the dialog is useful before - or without - an AI scan.
  const candidates = useQuery({ queryKey: DUPLICATE_LIST_QUERY_KEY, queryFn: gamesApi.duplicateCandidates });

  const run = useMutation({
    // Tracked app-wide, so the shelf nudge and Settings row show the scan while this dialog is closed too.
    mutationFn: (fresh: boolean) => trackAiActivity('duplicates', () => gamesApi.aiScanDuplicates(fresh)),
    onSuccess: (res) => {
      // A run that ended early (provider error, the daily limit on the shared AI) keeps what it found.
      setError(res.stopped ? t('add.review.ai.stopped', { reason: res.stopped }) : null);
      setGone([]);
      setSkipped([]);
      setFlipped([]);
      setHistory([]);
      setFront(null);
      setScan(res);
      // The server also notified (so it works if this dialog was closed meanwhile); pick that up now.
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: AI_SETTINGS_QUERY_KEY });
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });
  const merge = useMutation({
    mutationFn: ({ remove, keep }: { remove: DuplicateSuggestionGame; keep: DuplicateSuggestionGame }) => gamesApi.mergeGame(remove.id, { targetGameId: keep.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.mergeFailed')),
  });
  const bundle = useMutation({
    mutationFn: (g: DuplicateSuggestionGame) => gamesApi.markBundle(g.id),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.bundleFailed')),
  });
  const dismiss = useMutation({
    mutationFn: (p: DuplicateSuggestion) => gamesApi.dismissDuplicate({ gameIdA: p.a.id, gameIdB: p.b.id }),
    onError: (err) => setError(err instanceof Error ? err.message : t('settings.duplicates.failed')),
  });

  const hasBundle = (p: DuplicateSuggestion) => bundled.includes(p.a.id) || bundled.includes(p.b.id);
  // After a scan the pairs are what the AI judged to be the same game; before one, the title matches.
  const pairs: Row[] = (
    scan
      ? scan.pairs.map((p) => ({ ...p, ai: p.source !== 'community' && p.source !== 'igdb', community: p.mergedBy ?? 0 }))
      : (candidates.data?.pairs ?? []).map(({ communityMergedBy, ...p }) => ({ ...p, confidence: 0, reason: '', ai: false, community: communityMergedBy }))
  ).filter((p) => !gone.includes(pairKey(p)) && !hasBundle(p));
  // Skipped pairs go to the back of the line; Back brings one to the front.
  const queue = [...pairs.filter((p) => !skipped.includes(pairKey(p))), ...pairs.filter((p) => skipped.includes(pairKey(p)))];
  const frontPair = front ? queue.find((p) => pairKey(p) === front) : undefined;
  const current: Row | undefined = frontPair ?? queue[0];
  const currentKey = current ? pairKey(current) : null;
  const backTo = [...history].reverse().find((k) => k !== currentKey && pairs.some((p) => pairKey(p) === k));
  const busy = run.isPending || merge.isPending || dismiss.isPending || bundle.isPending;

  /** The card to keep for a pair: the suggested one (the base game / earlier release), unless the
   * person tapped the other. */
  const keepOf = (p: DuplicateSuggestion): DuplicateSuggestionGame => ((p.keep === 'a') !== flipped.includes(pairKey(p)) ? p.a : p.b);
  const removeOf = (p: DuplicateSuggestion): DuplicateSuggestionGame => (keepOf(p).id === p.a.id ? p.b : p.a);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: DUPLICATE_COUNT_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: DUPLICATE_LIST_QUERY_KEY });
  };

  /** Done with this pair for now: remember it for Back and let the next one come up. */
  function moveOn(key: string) {
    setHistory((h) => [...h.filter((x) => x !== key), key]);
    setFront(null);
  }

  function goBack() {
    if (!backTo) return;
    setHistory((h) => h.slice(0, h.lastIndexOf(backTo)));
    setSkipped((s) => s.filter((x) => x !== backTo));
    setFront(backTo);
  }

  function keep(p: DuplicateSuggestion, g: DuplicateSuggestionGame) {
    if (keepOf(p).id === g.id) return;
    setFlipped((f) => (f.includes(pairKey(p)) ? f.filter((k) => k !== pairKey(p)) : [...f, pairKey(p)]));
  }

  async function mergeNow(p: DuplicateSuggestion) {
    const keepCard = keepOf(p);
    const remove = removeOf(p);
    setError(null);
    const merged = await merge.mutateAsync({ remove, keep: keepCard });
    setGone((g) => [...g, pairKey(p)]);
    moveOn(pairKey(p));
    void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    invalidate();
    undoable(t('settings.duplicates.merged', { remove: remove.title, keep: keepCard.title }), merged.undoToken);
  }

  /** The card is a bundle of several games: hide it from the shelf and drop every pair it is in. */
  async function markBundle(p: DuplicateSuggestion, g: DuplicateSuggestionGame) {
    setError(null);
    await bundle.mutateAsync(g);
    setBundled((b) => [...b, g.id]);
    moveOn(pairKey(p));
    void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
    invalidate();
    ui.notify(t('settings.duplicates.bundled', { title: g.title }));
  }

  async function notDuplicates(p: DuplicateSuggestion) {
    setError(null);
    await dismiss.mutateAsync(p);
    setGone((g) => [...g, pairKey(p)]);
    moveOn(pairKey(p));
    invalidate();
  }

  function skip(p: DuplicateSuggestion) {
    setSkipped((s) => [...s.filter((x) => x !== pairKey(p)), pairKey(p)]);
    moveOn(pairKey(p));
  }

  // What to say when there is no pair to show.
  const emptyMessage = scan
    ? scan.pairs.length > 0
      ? t('settings.duplicates.allDone')
      : scan.checked > 0 || scan.alreadyChecked > 0
        ? t('settings.duplicates.none', { n: scan.checked + scan.alreadyChecked })
        : scan.candidates === 0
          ? t('settings.duplicates.noTitleMatches')
          : t('settings.duplicates.noneAskedAi', { n: scan.reused })
    : candidates.data
      ? t('settings.duplicates.noCandidates')
      : null;

  return (
    <Dialog
      onClose={() => ui.closeDialog('duplicates')}
      ariaLabel={t('settings.duplicates.title')}
      height="tall"
      padded={false}
      header={
        <>
          {backTo && (
            <Btn hover height={32} padX={12} fontSize={13} disabled={busy} onClick={goBack} ariaLabel={t('settings.duplicates.backAria')}>
              {t('settings.duplicates.back')}
            </Btn>
          )}
          <Kicker size={12} style={{ flex: 1 }}>
            {current ? t('settings.duplicates.kickerLeft', { n: pairs.length }) : t('settings.duplicates.title')}
          </Kicker>
        </>
      }
      footer={
        current && !run.isPending && (
          <div style={st('flex-shrink:0;display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:8px;padding:12px 16px 26px;border-top:1px solid var(--chip)')}>
            <Btn kind="soft" height={50} fontSize={13} style={{ background: 'var(--chip)', color: 'var(--text)' }} disabled={busy} onClick={() => void notDuplicates(current)}>
              {t('settings.duplicates.notDuplicates')}
            </Btn>
            <Btn height={50} style={{ background: 'var(--chip)', border: 'none' }} disabled={busy} onClick={() => skip(current)}>
              {t('common.skip')}
            </Btn>
            <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={busy} onClick={() => void mergeNow(current)}>
              {merge.isPending ? t('settings.duplicates.merging') : t('settings.duplicates.merge')}
            </Btn>
          </div>
        )
      }
    >
      <div style={st('flex:1;min-height:0;overflow-y:auto;padding:0 20px 16px;display:flex;flex-direction:column;gap:14px')}>
        {ai.data && !aiReady ? (
          <span style={st('font:500 13px/1.45 var(--font-ui);color:var(--text2)')}>{t('settings.duplicates.needsAi')}</span>
        ) : (
          <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:8px')}>
            <Btn kind="soft" height={36} padX={14} fontSize={13} disabled={busy || !aiReady} onClick={() => run.mutate(!!scan)}>
              {run.isPending ? (
                <span style={st('display:inline-flex;align-items:center;gap:8px')}>
                  <Spinner />
                  {t('settings.duplicates.scanning')}
                </span>
              ) : scan ? (
                t('settings.duplicates.scanAgain')
              ) : (
                t('settings.duplicates.scan')
              )}
            </Btn>
            <span style={st('flex:1;min-width:160px;font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{scan ? t('settings.duplicates.scanHint') : t('settings.duplicates.candidatesHint')}</span>
          </div>
        )}
        {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
        {run.isPending ? (
          <div role="status" style={st('display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--surf)')}>
            <Spinner size={20} />
            <span style={st('flex:1;min-width:0;font:500 13.5px/1.45 var(--font-ui);text-wrap:pretty')}>{t('settings.duplicates.scanningNoPairs')}</span>
          </div>
        ) : (
          <>
            {scan && scan.remaining > 0 && <span style={st('font:500 13px/1.45 var(--font-ui);text-wrap:pretty')}>{t('settings.duplicates.remaining', { n: scan.remaining })}</span>}
            {scan && scan.alreadyChecked > 0 && (
              <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.duplicates.alreadyChecked', { n: scan.alreadyChecked })}</span>
            )}
            {scan && scan.reused > 0 && <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.duplicates.reused', { n: scan.reused })}</span>}
            {current ? (
              <>
                <div style={st('display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:20px')}>
                  {current.a.igdbId === current.b.igdbId ? (
                    <Kicker size={11}>{t('settings.duplicates.igdbBadge')}</Kicker>
                  ) : current.community > 0 ? (
                    <Kicker size={11}>{t('settings.duplicates.communityBadge', { n: current.community })}</Kicker>
                  ) : current.ai ? (
                    <>
                      <AiPickedBadge title={t('settings.duplicates.badge')} />
                      <Kicker size={11}>{t('settings.duplicates.confidence', { n: Math.round(current.confidence * 100) })}</Kicker>
                    </>
                  ) : (
                    <Kicker size={11}>{t('settings.duplicates.titleMatch')}</Kicker>
                  )}
                </div>
                <span style={st('font:700 22px/1.2 var(--font-display);letter-spacing:-0.02em;overflow-wrap:anywhere')}>
                  {t('settings.duplicates.reviewQuestion', { remove: removeOf(current).title, keep: keepOf(current).title })}
                </span>
                {current.reason && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{current.reason}</span>}
                <MergeDirection remove={removeOf(current)} keep={keepOf(current)} onSwap={() => keep(current, removeOf(current))} disabled={busy} />
                <Kicker size={11}>{t('settings.duplicates.tapToKeep')}</Kicker>
                {[current.a, current.b].map((g) => (
                  <GameCard key={g.id} g={g} keeping={keepOf(current).id === g.id} disabled={busy} onKeep={() => keep(current, g)} onBundle={() => void markBundle(current, g)} />
                ))}
                <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.duplicates.reviewConsequence', { keep: keepOf(current).title })}</span>
              </>
            ) : (
              emptyMessage && <span style={st('font:500 14px/1.45 var(--font-ui)')}>{emptyMessage}</span>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
