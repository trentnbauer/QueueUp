import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BundleSuggestion, Game, GameSearchResult, SetGameReviewRequest } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, Cover, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

type Pick = GameSearchResult & { source?: BundleSuggestion['source'] };

/** "Bundle?" (issue #857): this card is several games sold together. Shows the games it probably holds
 * (what IGDB lists for it, plus the names in its title), all ticked, lets the person untick, search
 * for others and add them, then replaces the card with those games. */
export function BundleSheet({ game, onClose, onLinked }: { game: Game; onClose: () => void; /** Runs once the games are linked to the bundle. */ onLinked?: () => void }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Map<number, Pick>>(new Map());
  const [seeded, setSeeded] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 350);
  const [error, setError] = useState<string | null>(null);
  // A Beaten bundle: once its games are linked, ask whether they are Beaten too and what to do about the review (issue #1171).
  const [afterBeaten, setAfterBeaten] = useState<{ id: string; igdbId: number }[] | null>(null);
  const [working, setWorking] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const suggestions = useQuery({ queryKey: ['bundle-suggestions', game.id], queryFn: () => gamesApi.bundleSuggestions(game.id), staleTime: 5 * 60_000 });
  // Prefill: every suggestion starts ticked, once, so the person only has to confirm or trim.
  useEffect(() => {
    if (seeded || !suggestions.data) return;
    setPicked(new Map(suggestions.data.suggestions.map((s) => [s.igdbId, s])));
    setSeeded(true);
  }, [suggestions.data, seeded]);

  const search = useQuery({
    queryKey: ['bundle-search', game.id, debounced],
    queryFn: () => gamesApi.igdbSearch(game.id, debounced),
    enabled: debounced.length > 0,
  });
  const results = (search.data?.results ?? []).filter((r) => r.title !== game.title);

  const split = useMutation({
    mutationFn: () => gamesApi.splitBundle(game.id, [...picked.keys()]),
    onSuccess: ({ linked }) => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      onLinked?.();
      ui.notify(t(picked.size === 1 ? 'game.bundle.done.one' : 'game.bundle.done.other', { n: picked.size, title: game.title }));
      if (game.status === 'done' && linked.length > 0) {
        setAfterBeaten(linked);
        return;
      }
      ui.selectGame(null);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('game.bundle.failed')),
  });

  /** The games inside a Beaten bundle are Beaten too; optionally with the bundle's own review copied onto each. */
  async function markBeaten(withReview: boolean) {
    if (!afterBeaten) return;
    setWorking(true);
    setError(null);
    const r = game.review;
    const review: SetGameReviewRequest | null =
      withReview && r ? { art: r.art, gameplay: r.gameplay, story: r.story, sound: r.sound, themes: r.themes, note: r.note, recommend: r.recommend } : null;
    try {
      for (const g of afterBeaten) {
        await gamesApi.updateStatus(g.id, { status: 'done' });
        if (review) await gamesApi.setReview(g.id, review);
      }
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      if (review) finishFollowUp(t('game.bundle.beaten.applied', { n: afterBeaten.length }));
      else setReviewing(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('game.bundle.failed'));
    } finally {
      setWorking(false);
    }
  }

  function finishFollowUp(message?: string) {
    if (message) ui.notify(message);
    ui.selectGame(null);
    onClose();
  }

  function toggle(g: Pick) {
    setPicked((current) => {
      const next = new Map(current);
      if (next.has(g.igdbId)) next.delete(g.igdbId);
      else next.set(g.igdbId, g);
      return next;
    });
  }

  const row = (g: Pick) => {
    const on = picked.has(g.igdbId);
    return (
      <button
        key={g.igdbId}
        type="button"
        aria-pressed={on}
        onClick={() => toggle(g)}
        style={st('display:flex;align-items:center;gap:12px;min-height:60px;padding:6px 12px;border:none;background:var(--surf);color:var(--text);text-align:left')}
      >
        <input type="checkbox" checked={on} readOnly tabIndex={-1} style={st('flex-shrink:0;pointer-events:none')} />
        <Cover title={g.title} url={g.coverImageUrl} width={34} radius={6} />
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>
            {g.title}
            {g.releaseYear ? ` (${g.releaseYear})` : ''}
          </span>
          <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>
            {g.source ? t(g.source === 'igdb' ? 'game.bundle.fromIgdb' : 'game.bundle.fromTitle') : g.platform}
          </span>
        </span>
      </button>
    );
  };

  const chosen = [...picked.values()];

  if (afterBeaten) {
    const titleOf = (igdbId: number) => picked.get(igdbId)?.title ?? '';
    const coverOf = (igdbId: number) => picked.get(igdbId)?.coverImageUrl ?? null;
    return (
      <Dialog
        onClose={() => finishFollowUp()}
        title={t('game.bundle.beaten.title', { title: game.title })}
        gap={12}
        footer={
          reviewing ? (
            <div style={st('display:flex;padding:12px 20px')}>
              <Btn kind="accent" height={46} padX={18} weight={700} style={{ flex: 1 }} onClick={() => finishFollowUp()}>
                {t('common.done')}
              </Btn>
            </div>
          ) : undefined
        }
      >
        {error && <Banner>{error}</Banner>}
        {reviewing ? (
          <>
            <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t('game.bundle.beaten.individualHint')}</div>
            <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip)')}>
              {afterBeaten.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => ui.openDialog('review', { gameId: g.id, edit: true })}
                  className="hv-surf2"
                  style={st('display:flex;align-items:center;gap:12px;min-height:60px;padding:6px 12px;border:none;background:var(--surf);color:var(--text);text-align:left')}
                >
                  <Cover title={titleOf(g.igdbId)} url={coverOf(g.igdbId)} width={34} radius={6} />
                  <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{titleOf(g.igdbId) || g.id}</span>
                  <span style={st('flex-shrink:0;height:30px;padding:0 12px;border-radius:999px;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui);display:flex;align-items:center')}>{t('game.bundle.beaten.review')}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t(game.review ? 'game.bundle.beaten.hint' : 'game.bundle.beaten.hintNoReview')}</div>
            <Btn kind="accent" height={48} weight={700} disabled={working} onClick={() => void markBeaten(true)}>
              {working ? t('game.bundle.beaten.working') : game.review ? t('game.bundle.beaten.applyAll') : t('game.bundle.beaten.markAll')}
            </Btn>
            {game.review && (
              <Btn height={48} disabled={working} onClick={() => void markBeaten(false)}>
                {t('game.bundle.beaten.individually')}
              </Btn>
            )}
            <Btn kind="ghost" height={44} disabled={working} onClick={() => finishFollowUp()}>
              {t('game.bundle.beaten.leave')}
            </Btn>
          </>
        )}
      </Dialog>
    );
  }
  const extra = results.filter((r) => !picked.has(r.igdbId));

  return (
    <Dialog
      onClose={onClose}
      title={t('game.bundle.title')}
      gap={12}
      footer={
        <div style={st('display:flex;gap:8px;padding:12px 20px')}>
          <Btn kind="ghost" height={46} padX={16} onClick={onClose} disabled={split.isPending}>
            {t('common.cancel')}
          </Btn>
          <Btn kind="accent" height={46} padX={18} weight={700} style={{ flex: 1 }} disabled={picked.size === 0 || split.isPending} onClick={() => split.mutate()}>
            {split.isPending ? t('game.bundle.splitting') : t('game.bundle.confirm', { n: picked.size })}
          </Btn>
        </div>
      }
    >
      <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t(game.roomId ? 'game.bundle.hintRoom' : 'game.bundle.hint', { title: game.title })}</div>
      {error && <Banner>{error}</Banner>}
      {suggestions.isLoading && <div style={st('color:var(--muted);font-size:14px')}>{t('game.bundle.looking')}</div>}
      {suggestions.data && suggestions.data.suggestions.length === 0 && chosen.length === 0 && <div style={st('color:var(--muted);font-size:14px')}>{t('game.bundle.noSuggestions')}</div>}
      {chosen.length > 0 && <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip)')}>{chosen.map(row)}</div>}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('game.bundle.search')}
        aria-label={t('game.bundle.search')}
        style={st(`min-width:0;${inputPill}`)}
      />
      {debounced && search.isFetching && <div style={st('color:var(--muted);font-size:14px')}>{t('add.manualMatch.searching')}</div>}
      {extra.length > 0 && <div style={st('display:flex;flex-direction:column;gap:1px;border-radius:18px;overflow:hidden;background:var(--chip);max-height:40vh;overflow-y:auto')}>{extra.map(row)}</div>}
    </Dialog>
  );
}
