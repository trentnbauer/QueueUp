import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiDuplicateScanResponse, DuplicateSuggestion, DuplicateSuggestionGame, Game } from '@queueup/shared';
import { AI_SETTINGS_QUERY_KEY, aiApi } from '../api/ai';
import { DUPLICATE_COUNT_QUERY_KEY, DUPLICATE_LIST_QUERY_KEY, gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { MergeStage } from '../ui/MergeStage';
import { RemasterStage } from '../ui/RemasterStage';
import { BundleSheet } from '../game/BundleSheet';
import { RemasterDialog } from '../game/RemasterDialog';
import { suggestionToMergeGame } from '../game/mergeGame';
import { trackAiActivity } from '../hooks/useAiActivity';
import { useUndoChange } from '../hooks/useUndoChange';
import { AiPickedBadge, Banner, Btn, Kicker, Spinner } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const GAMES_QUERY_ROOT = ['games'];

/** A pair to show: one the AI judged, or a title-match candidate nobody has judged yet. */
type Row = DuplicateSuggestion & { ai: boolean; /** How many other people merged this pair (0 when none). */ community: number };

const pairKey = (p: DuplicateSuggestion) => `${p.a.id}:${p.b.id}`;

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
  const [kindFor, setKindFor] = useState<string | null>(null);
  // Pairs the AI called a remaster, remake or collection that the person says are the same game after all.
  const [asMerge, setAsMerge] = useState<string[]>([]);
  // "One of these is a bundle": which one, then the bundle flow for it.
  const [bundleChoice, setBundleChoice] = useState<string | null>(null);
  const [bundleGame, setBundleGame] = useState<Game | null>(null);
  const [savingKind, setSavingKind] = useState(false);
  const busy = run.isPending || merge.isPending || dismiss.isPending;

  /** The card to keep for a pair: the suggested one (the base game / earlier release), unless the
   * person tapped the other. */
  /** What the AI thinks this pair is besides a duplicate, unless the person said it is the same game. */
  const relationOf = (p: DuplicateSuggestion | undefined) => (p?.relation && !asMerge.includes(pairKey(p)) ? p.relation : null);
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

  /** One of the two is a bundle: open the bundle flow for it (it stays on the list and links the games inside), and drop the pair once linked. */
  async function openBundle(g: DuplicateSuggestion['a']) {
    setError(null);
    setBundleChoice(null);
    try {
      const { game } = await gamesApi.get(g.id);
      setBundleGame(game);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.duplicates.bundleFailed'));
    }
  }

  /** One of the two is a remaster or remake of the other: both stay, and the pair is not suggested again (issue #1173). The one that
   * would have been removed is taken to be the later release. */
  async function markRemaster(p: DuplicateSuggestion, kind: 'remaster' | 'remake', newerId: string, originalId: string) {
    setError(null);
    setSavingKind(true);
    try {
      await gamesApi.dismissDuplicate({ gameIdA: newerId, gameIdB: originalId, kind });
      setGone((g) => [...g, pairKey(p)]);
      moveOn(pairKey(p));
      invalidate();
      const [newerTitle, originalTitle] = newerId === p.a.id ? [p.a.title, p.b.title] : [p.b.title, p.a.title];
      ui.notify(t(kind === 'remaster' ? 'game.remaster.saved.remaster' : 'game.remaster.saved.remake', { title: newerTitle, original: originalTitle }));
      setKindFor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('game.remaster.failed'));
    } finally {
      setSavingKind(false);
    }
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
            {relationOf(current) ? (
              <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={busy} onClick={() => (relationOf(current) === 'bundle' ? void openBundle(current.a) : setKindFor(currentKey))}>
                {t(`settings.duplicates.link.${relationOf(current)}` as MessageKey)}
              </Btn>
            ) : (
              <Btn kind="accent" height={50} weight={700} fontSize={14} disabled={busy} onClick={() => void mergeNow(current)}>
                {merge.isPending ? t('settings.duplicates.merging') : t('settings.duplicates.merge')}
              </Btn>
            )}
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
                <span style={st('font:700 22px/1.2 var(--font-display);letter-spacing:-0.02em;overflow-wrap:anywhere')}>{relationOf(current) ? t(`settings.duplicates.looksLike.${relationOf(current)}` as MessageKey) : t('settings.duplicates.sameGame')}</span>
                {current.reason && <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>{current.reason}</span>}
                {relationOf(current) ? (
                  <>
                    <RemasterStage
                      original={suggestionToMergeGame(current.b)}
                      newer={suggestionToMergeGame(current.a)}
                      kind={relationOf(current) === 'bundle' ? null : (relationOf(current) as 'remaster' | 'remake')}
                      labels={relationOf(current) === 'bundle' ? { original: t('settings.duplicates.bundleInside'), newer: t('settings.duplicates.bundleLabel'), rel: t('settings.duplicates.bundleRel') } : undefined}
                    />
                    <Btn kind="ghost" height={34} padX={10} fontSize={12.5} disabled={busy} style={{ alignSelf: 'flex-start' }} onClick={() => setAsMerge((m) => [...m, currentKey as string])}>
                      {t('settings.duplicates.sameAfterAll')}
                    </Btn>
                  </>
                ) : (
                  <MergeStage remove={suggestionToMergeGame(removeOf(current))} keep={suggestionToMergeGame(keepOf(current))} onSwap={() => keep(current, removeOf(current))} disabled={busy} />
                )}
                <Kicker size={11}>{t('settings.duplicates.notStraight')}</Kicker>
                <div style={st('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px')}>
                  <button type="button" disabled={busy} onClick={() => setKindFor(currentKey)} className="hv-surf2" style={st('display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left')}>
                    <span style={st('font:700 14px var(--font-ui)')}>✨ {t('settings.duplicates.remasterTile')}</span>
                    <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t('settings.duplicates.remasterTileSub')}</span>
                  </button>
                  <button type="button" disabled={busy} onClick={() => setBundleChoice(currentKey)} className="hv-surf2" style={st('display:flex;flex-direction:column;gap:3px;padding:12px 14px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left')}>
                    <span style={st('font:700 14px var(--font-ui)')}>📦 {t('settings.duplicates.bundleTile')}</span>
                    <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{t('settings.duplicates.bundleTileSub')}</span>
                  </button>
                </div>
              </>
            ) : (
              emptyMessage && <span style={st('font:500 14px/1.45 var(--font-ui)')}>{emptyMessage}</span>
            )}
          </>
        )}
      </div>
      {kindFor && current && currentKey === kindFor && (
        <RemasterDialog
          newer={{ id: (current.relation ? current.a : removeOf(current)).id, game: suggestionToMergeGame(current.relation ? current.a : removeOf(current)) }}
          original={{ id: (current.relation ? current.b : keepOf(current)).id, game: suggestionToMergeGame(current.relation ? current.b : keepOf(current)) }}
          initialKind={relationOf(current) === 'remaster' || relationOf(current) === 'remake' ? (relationOf(current) as 'remaster' | 'remake') : null}
          busy={savingKind}
          onSave={(kind, newerId, originalId) => void markRemaster(current, kind, newerId, originalId)}
          onClose={() => setKindFor(null)}
        />
      )}
      {bundleChoice && current && currentKey === bundleChoice && (
        <Dialog onClose={() => setBundleChoice(null)} title={t('settings.duplicates.whichBundle')} gap={12}>
          <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t('settings.duplicates.whichBundleHint')}</div>
          {[current.a, current.b].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => void openBundle(g)}
              className="hv-surf2"
              style={st('display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;border:none;background:var(--surf);color:var(--text);text-align:left')}
            >
              <span style={{ width: 36, height: 54, flexShrink: 0, borderRadius: 6, background: g.coverImageUrl ? `url("${g.coverImageUrl}") center/cover no-repeat` : 'var(--surf2)' }} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
                <span style={st('color:var(--muted);font:400 12.5px var(--font-ui)')}>{[g.releaseYear, g.platform].filter(Boolean).join(' · ')}</span>
                <span style={st('color:var(--faint);font:400 12px var(--font-ui)')}>{[g.developer, g.publisher].filter(Boolean).join(' · ')}</span>
              </span>
              <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
            </button>
          ))}
        </Dialog>
      )}
      {bundleGame && (
        <BundleSheet
          game={bundleGame}
          onLinked={() => {
            if (current) {
              setBundled((b) => [...b, bundleGame.id]);
              moveOn(pairKey(current));
            }
            void queryClient.invalidateQueries({ queryKey: GAMES_QUERY_ROOT });
            invalidate();
          }}
          onClose={() => setBundleGame(null)}
        />
      )}
    </Dialog>
  );
}
