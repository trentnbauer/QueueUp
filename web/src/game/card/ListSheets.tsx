import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DlcKind, Game, GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../../api/games';
import { defaultPrerequisite } from '../../components/gameGridLogic';
import { useScope } from '../../context/ScopeContext';
import { fmtMoney } from '../../lib/gameView';
import { Cover } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { PICKER_MAX_SHOWN, filterPickerOptions } from '../GamePicker';
import { dlcKindOrDefault, dlcPillTone } from './cardLogic';
import { cardStatusLabel } from './statusLabel';
import { RowGroup } from './ui';

/** What a DLC row opens: a game already on this list, or an IGDB entry that isn't yet (it gets a preview card). */
export type DlcTarget = { kind: DlcKind; game: Game; result?: GameSearchResult } | { kind: DlcKind; game: null; result: GameSearchResult };

/** Games a "Play after" can point at: everything else on this list that doesn't lead back to this game. */
export function useAfterCandidates(game: Game): Game[] {
  const { games } = useScope();
  return useMemo(() => {
    const byId = new Map(games.map((g) => [g.id, g]));
    const wouldCycle = (candidateId: string) => {
      const seen = new Set<string>([game.id]);
      let cur: string | null = candidateId;
      while (cur !== null) {
        if (seen.has(cur)) return true;
        seen.add(cur);
        cur = byId.get(cur)?.prerequisiteGameId ?? null;
      }
      return false;
    };
    return games.filter((g) => g.id !== game.id && !wouldCycle(g.id)).sort((a, b) => a.title.localeCompare(b.title));
  }, [games, game.id]);
}

/** Play after: hold this game back until another is beaten. Search the list, "None" first, the suggested game tagged. */
export function PlayAfterSheet({ game, onDone }: { game: Game; onDone: () => void }) {
  const t = useT();
  const { ops, games, isShelf } = useScope();
  const candidates = useAfterCandidates(game);
  const [q, setQ] = useState('');
  const suggestedId = game.prerequisiteGameId ? null : (defaultPrerequisite(game, games)?.id ?? null);
  const options = useMemo(() => candidates.map((g) => ({ id: g.id, title: g.title, sub: cardStatusLabel(g.status) })), [candidates]);
  const { shown, total } = filterPickerOptions(options, q, PICKER_MAX_SHOWN);
  // The suggestion floats to the top while nothing is typed.
  const ordered = !q.trim() && suggestedId ? [...shown.filter((o) => o.id === suggestedId), ...shown.filter((o) => o.id !== suggestedId)] : shown;
  const byId = new Map(candidates.map((g) => [g.id, g]));
  const current = game.prerequisiteGameId;

  function pick(id: string | null) {
    ops.setPrerequisite(game.id, id);
    onDone();
  }

  const rowStyle = (on: boolean) => st(`display:flex;align-items:center;gap:12px;min-height:54px;padding:6px 10px;border:none;border-radius:14px;text-align:left;color:var(--text);background:${on ? 'var(--chip)' : 'transparent'}`);

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);padding:0 4px;text-wrap:pretty')}>{t('card.after.help')}</span>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={isShelf ? t('card.after.searchShelf') : t('card.after.searchRoom')}
        aria-label={t('card.after.searchRoom')}
        style={st('height:44px;padding:0 16px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--text);font:500 15px var(--font-ui);outline:none')}
      />
      <div style={st('display:flex;flex-direction:column;gap:2px')}>
        {!q.trim() && (
          <button type="button" onClick={() => pick(null)} style={rowStyle(current === null)}>
            <span style={st('width:30px;aspect-ratio:2/3;flex-shrink:0;border-radius:6px;background:var(--chip)')} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
              <span style={st('font:600 14.5px var(--font-ui)')}>{t('game.detail.none')}</span>
              <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('card.after.noneSub')}</span>
            </span>
            <span style={st('width:16px;font:700 14px var(--font-ui);color:var(--accText)')}>{current === null ? '✓' : ''}</span>
          </button>
        )}
        {ordered.map((o) => {
          const g = byId.get(o.id);
          return (
            <button key={o.id} type="button" onClick={() => pick(o.id)} style={rowStyle(current === o.id)}>
              <Cover title={o.title} url={g?.coverImageUrl ?? null} width={30} radius={6} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{o.title}</span>
                <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{o.sub}</span>
              </span>
              {o.id === suggestedId && <span style={st('font:600 10.5px var(--font-mono);letter-spacing:0.06em;color:var(--accText)')}>{t('game.picker.suggested')}</span>}
              <span style={st('width:16px;font:700 14px var(--font-ui);color:var(--accText)')}>{current === o.id ? '✓' : ''}</span>
            </button>
          );
        })}
        {ordered.length === 0 && <span style={st('padding:10px 12px;font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('game.picker.noMatches')}</span>}
        {total > ordered.length && <span style={st('padding:8px 12px;font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('game.picker.more', { n: ordered.length })}</span>}
      </div>
      {game.prerequisiteAuto && <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted);padding:0 4px')}>{t('game.detail.playAfter.auto')}</span>}
    </div>
  );
}

const KIND_KEY = { dlc: 'card.dlc.kind.dlc', expansion: 'card.dlc.kind.expansion', standalone: 'card.dlc.kind.standalone', pack: 'card.dlc.kind.pack' } as const;

export function useDlcKindLabel() {
  const t = useT();
  return (kind: DlcKind | undefined | null) => t(KIND_KEY[dlcKindOrDefault(kind)]);
}

/** A game's IGDB add-ons (all of them, added or not), cached per base game. */
export function useDlcList(baseGameId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['game-dlc', baseGameId, 'all'],
    queryFn: () => gamesApi.dlc(baseGameId!, true),
    enabled: enabled && !!baseGameId,
    staleTime: 10 * 60 * 1000,
  });
}

/** DLC: every add-on IGDB lists plus any added by hand, each with its own status. Tapping one opens its own card. */
export function DlcSheet({ game, onOpen }: { game: Game; onOpen: (target: DlcTarget) => void }) {
  const t = useT();
  const kindLabel = useDlcKindLabel();
  const { games, isShelf } = useScope();
  const query = useDlcList(game.id);
  const added = useMemo(() => games.filter((g) => g.baseGameId === game.id), [games, game.id]);

  const rows = useMemo(() => {
    const out: (DlcTarget & { title: string; cover: string | null })[] = [];
    const seen = new Set<number>();
    for (const r of query.data?.results ?? []) {
      seen.add(r.igdbId);
      const g = added.find((a) => a.igdbId === r.igdbId) ?? null;
      out.push({ kind: dlcKindOrDefault(r.dlcKind), game: g, result: r, title: g?.title ?? r.title, cover: g?.coverImageUrl ?? r.coverImageUrl });
    }
    // Added by hand but not on IGDB's list.
    for (const g of added) if (!seen.has(g.igdbId)) out.push({ kind: 'dlc', game: g, title: g.title, cover: g.coverImageUrl } as DlcTarget & { title: string; cover: string | null });
    return out;
  }, [query.data, added]);

  const owned = rows.filter((r) => r.game?.youOwn).length;
  const beaten = rows.filter((r) => r.game?.status === 'done').length;

  const pill = (tone: ReturnType<typeof dlcPillTone>) =>
    tone === 'mint'
      ? 'background:var(--mintSoft);color:var(--mint)'
      : tone === 'accent'
        ? 'background:var(--accA18);color:var(--accText)'
        : tone === 'neutral'
          ? 'background:var(--chip);color:var(--text2)'
          : 'background:transparent;color:var(--faint)';

  if (query.isPending && added.length === 0) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>;
  if (rows.length === 0) {
    return (
      <span style={st('padding:0 4px;font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>
        {query.isError ? (query.error instanceof Error ? query.error.message : t('settings.dlc.loadFailed')) : t('settings.dlc.empty')}
      </span>
    );
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);padding:0 4px')}>
        {t(rows.length === 1 ? 'card.dlc.summary.one' : 'card.dlc.summary.other', { n: rows.length, owned, beaten })}
      </span>
      <RowGroup radius={16}>
        {rows.map((r) => {
          const g = r.game;
          const status = g ? g.status : null;
          const price = g ? (g.price.amount ? fmtMoney(g.price.amount, g.price.currency) : g.manualPrice ? fmtMoney(g.manualPrice, g.price.currency) : '') : '';
          const sub = [kindLabel(r.kind), price, g?.youOwn ? '✅' : isShelf && status === 'wishlist' ? '🎁' : ''].filter(Boolean).join(' · ');
          return (
            <button
              key={g?.id ?? `igdb-${r.result?.igdbId}`}
              type="button"
              onClick={() => onOpen(r)}
              className="hv-surf2"
              style={st('display:flex;align-items:center;gap:12px;padding:10px 12px;border:none;background:var(--surf);text-align:left;color:var(--text)')}
            >
              <span style={st(`width:56px;height:26px;flex-shrink:0;border-radius:6px;background:var(--surf2) ${r.cover ? `url("${r.cover}") center/cover no-repeat` : ''}`)} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                <span style={st('font:600 13.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.title}</span>
                <span style={st(`font:400 11.5px var(--font-ui);color:${g?.youOwn ? 'var(--mint)' : status === 'wishlist' ? 'var(--accText)' : 'var(--muted)'}`)}>{sub}</span>
              </span>
              <span style={st(`flex-shrink:0;height:26px;padding:0 10px;border-radius:999px;font:600 11.5px var(--font-ui);display:flex;align-items:center;${pill(dlcPillTone(status))}`)}>
                {status ? cardStatusLabel(status) : t('card.dlc.notAdded')}
              </span>
              <span aria-hidden style={st('color:var(--faint);font-size:18px')}>›</span>
            </button>
          );
        })}
      </RowGroup>
      <span style={st('font:400 12px var(--font-ui);color:var(--muted);padding:0 4px')}>{t('card.dlc.footer')}</span>
    </div>
  );
}
