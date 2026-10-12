import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BundleSuggestion, Game, GameSearchResult } from '@queueup/shared';
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
export function BundleSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Map<number, Pick>>(new Map());
  const [seeded, setSeeded] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 350);
  const [error, setError] = useState<string | null>(null);

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.selectGame(null);
      ui.notify(t(picked.size === 1 ? 'game.bundle.done.one' : 'game.bundle.done.other', { n: picked.size, title: game.title }));
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : t('game.bundle.failed')),
  });

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
      <div style={st('color:var(--muted);font:400 13.5px/1.4 var(--font-ui)')}>{t('game.bundle.hint', { title: game.title })}</div>
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
