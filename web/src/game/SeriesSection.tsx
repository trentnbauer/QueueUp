import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game, GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useUi } from '../context/UiContext';
import { Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Most earlier entries listed at once; the rest are one add away from the Add game search. */
const MAX_LISTED = 6;

/** "Part of {series}": the earlier entries of this game's IGDB series that are not on this list yet, each with a button
 * to add it (to the wishlist on the Personal Shelf, so nothing is marked owned). Nothing at all for a game with no
 * series or no missing earlier entries. The series comes from a server cache shared by everyone (#1082). */
export function SeriesSection({ game, isShelf }: { game: Game; isShelf: boolean }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<number | null>(null);
  const hasSeries = game.igdbCollectionId !== null && game.igdbCollectionId !== undefined;
  const query = useQuery({ queryKey: ['game-series', game.id], queryFn: () => gamesApi.series(game.id), enabled: hasSeries, staleTime: 5 * 60_000 });
  const add = useMutation({
    mutationFn: (g: GameSearchResult) => gamesApi.create({ igdbId: g.igdbId, roomId: game.roomId, ...(isShelf ? { status: 'wishlist' as const } : {}) }),
    onMutate: (g) => setAdding(g.igdbId),
    onSuccess: (_res, g) => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      void queryClient.invalidateQueries({ queryKey: ['game-series', game.id] });
      ui.notify(t(isShelf ? 'game.series.addedWishlist' : 'game.series.addedRoom', { title: g.title }));
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : t('game.series.addFailed')),
    onSettled: () => setAdding(null),
  });

  const series = query.data?.series;
  if (!series || series.earlierMissing.length === 0) return null;
  const listed = series.earlierMissing.slice(0, MAX_LISTED);
  const more = series.earlierMissing.length - listed.length;

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <span style={st('font:600 15px var(--font-display)')}>{t('game.series.title', { name: series.name })}</span>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>
        {t(series.earlierMissing.length === 1 ? 'game.series.missing.one' : 'game.series.missing.other', { n: series.earlierMissing.length })}
      </span>
      {listed.map((g) => (
        <div key={g.igdbId} style={st('display:flex;align-items:center;gap:12px;padding:8px 12px 8px 8px;border-radius:14px;background:var(--surf)')}>
          <Cover title={g.title} url={g.coverImageUrl} width={32} radius={6} />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
            <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
            {g.releaseYear && <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{g.releaseYear}</span>}
          </span>
          <button
            type="button"
            disabled={adding !== null}
            onClick={() => add.mutate(g)}
            style={st(`flex-shrink:0;height:32px;padding:0 14px;border-radius:999px;border:none;background:var(--chip);color:var(--text2);font:600 12.5px var(--font-ui);opacity:${adding !== null ? 0.6 : 1}`)}
          >
            {adding === g.igdbId ? '…' : t(isShelf ? 'game.series.addWishlist' : 'game.series.addRoom')}
          </button>
        </div>
      ))}
      {(more > 0 || series.truncated) && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('game.series.more', { n: more })}</span>}
    </div>
  );
}
