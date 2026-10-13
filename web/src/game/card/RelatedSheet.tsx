import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Game, GameRelatedResponse, RelatedGame } from '@queueup/shared';
import { gamesApi } from '../../api/games';
import { useUi } from '../../context/UiContext';
import { Cover } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { cardStatusLabel } from './statusLabel';
import { Kicker, RowGroup } from './ui';

const ROW = 'display:flex;align-items:center;gap:12px;min-height:60px;padding:6px 14px;border:none;background:var(--surf);color:var(--text);text-align:left;width:100%';

/** Related games: everything tied to this game, grouped by how (bundle, add-ons, remaster or remake, merged duplicates, other editions).
 * Games on your list open their own card. */
export function RelatedSheet({ game }: { game: Game }) {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['games', game.id, 'related'], queryFn: () => gamesApi.related(game.id), staleTime: 60_000 });
  const add = useMutation({
    mutationFn: (e: GameRelatedResponse['editions'][number]) => gamesApi.create({ igdbId: e.igdbId, roomId: game.roomId }),
    onSuccess: (_res, e) => {
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify(t('card.related.added', { title: e.title }));
    },
  });

  if (query.isPending) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('card.related.loading')}</span>;
  if (query.isError) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{query.error instanceof Error ? query.error.message : t('settings.dlc.loadFailed')}</span>;
  const r = query.data;

  const gameRow = (g: RelatedGame, sub?: string) => (
    <button key={g.id} type="button" onClick={() => ui.selectGame(g.id)} className="hv-surf2" style={st(ROW)}>
      <Cover title={g.title} url={g.coverImageUrl} width={34} radius={6} />
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 14px var(--font-ui);overflow-wrap:anywhere')}>{g.title}</span>
        <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>{sub ?? cardStatusLabel(g.status)}</span>
      </span>
      <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
    </button>
  );

  const sections: { key: string; title: string; rows: ReactNode[] }[] = [];
  if (r.bundle) sections.push({ key: 'bundle', title: t('card.related.bundle'), rows: [gameRow(r.bundle)] });
  if (r.bundled.length) sections.push({ key: 'bundled', title: t('card.related.bundled'), rows: r.bundled.map((g) => gameRow(g)) });
  if (r.base) sections.push({ key: 'base', title: t('card.related.base'), rows: [gameRow(r.base)] });
  if (r.dlc.length) sections.push({ key: 'dlc', title: t('card.related.dlc'), rows: r.dlc.map((g) => gameRow(g)) });
  if (r.remaster?.original) {
    const o = r.remaster.original;
    sections.push({
      key: 'remaster',
      title: t('card.related.remaster'),
      rows: [gameRow({ id: o.id, title: o.title, coverImageUrl: null, status: 'backlog' }, t(r.remaster.kind === 'remake' ? 'card.related.kind.remake' : 'card.related.kind.remaster'))],
    });
  }
  if (r.remadeAs.length) sections.push({ key: 'remadeAs', title: t('card.related.remadeAs'), rows: r.remadeAs.map((x) => gameRow(x.game, t(x.kind === 'remake' ? 'card.related.kind.remake' : 'card.related.kind.remaster'))) });
  if (r.merged.length) {
    sections.push({
      key: 'merged',
      title: t('card.related.merged'),
      rows: r.merged.map((m) => (
        <div key={m.igdbId} style={st(ROW)}>
          <Cover title={m.title} url={m.coverImageUrl} width={34} radius={6} />
          <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
            <span style={st('font:600 14px var(--font-ui);overflow-wrap:anywhere')}>{m.title}</span>
            <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{t('card.related.mergedSub')}</span>
          </span>
        </div>
      )),
    });
  }
  if (r.editions.length) {
    sections.push({
      key: 'editions',
      title: t('card.related.editions'),
      rows: r.editions.map((e) =>
        e.gameId ? (
          gameRow({ id: e.gameId, title: e.title, coverImageUrl: e.coverImageUrl, status: 'backlog' }, [e.releaseYear].filter(Boolean).join(' · ') || undefined)
        ) : (
          <div key={e.igdbId} style={st(ROW)}>
            <Cover title={e.title} url={e.coverImageUrl} width={34} radius={6} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:600 14px var(--font-ui);overflow-wrap:anywhere')}>{e.title}</span>
              <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{[e.releaseYear, t('card.related.notOnList')].filter(Boolean).join(' · ')}</span>
            </span>
            <button type="button" disabled={add.isPending} onClick={() => add.mutate(e)} style={st('flex-shrink:0;height:30px;padding:0 12px;border-radius:999px;border:none;background:var(--accSoft2);color:var(--accText);font:600 12.5px var(--font-ui)')}>
              {t('card.related.add')}
            </button>
          </div>
        ),
      ),
    });
  }

  if (sections.length === 0) return <span style={st('padding:0 4px;font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>{t('card.related.none')}</span>;
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      {sections.map((s) => (
        <div key={s.key} style={st('display:flex;flex-direction:column;gap:8px')}>
          <Kicker>{s.title}</Kicker>
          <RowGroup radius={16}>{s.rows}</RowGroup>
        </div>
      ))}
    </div>
  );
}
