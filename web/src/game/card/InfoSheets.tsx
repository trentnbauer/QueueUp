import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Game, GameHistoryEntry, SteamRequirementSet } from '@queueup/shared';
import { authApi } from '../../api/auth';
import { gamesApi } from '../../api/games';
import { useScope } from '../../context/ScopeContext';
import { useGameAchievements } from '../../hooks/useGameAchievements';
import { useGamePlayLog } from '../../hooks/useGamePlayLog';
import { shortDate } from '../../lib/gameView';
import { Avatar } from '../../ui/primitives';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { SeriesSection } from '../SeriesSection';
import { YourPc, memoryVerdict } from '../SystemRequirements';
import { RowGroup } from './ui';
import { cardStatusLabel } from './statusLabel';
import { SYNC_SOURCE_KEY } from './syncSources';

/** Time to beat: Rushed, Main and Completionist as bars scaled to the longest. Times from IGDB. */
export function TimeToBeatSheet({ game }: { game: Game }) {
  const t = useT();
  const bars = [
    { key: 'rushed', hours: game.timeToBeatRushedHours, label: t('card.ttb.rushed'), sub: t('card.ttb.rushedSub') },
    { key: 'main', hours: game.timeToBeatHours, label: t('card.ttb.main'), sub: t('card.ttb.mainSub') },
    { key: 'completionist', hours: game.timeToBeatCompletionistHours, label: t('card.ttb.completionist'), sub: t('card.ttb.completionistSub') },
  ].filter((b): b is typeof b & { hours: number } => b.hours != null);
  const max = Math.max(1, ...bars.map((b) => b.hours));

  if (bars.length === 0) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('card.ttb.none')}</span>;
  return (
    <div style={st('display:flex;flex-direction:column;gap:14px')}>
      <div style={st('display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:18px;background:var(--surf)')}>
        {bars.map((b) => (
          <div key={b.key} style={st('display:flex;flex-direction:column;gap:6px')}>
            <div style={st('display:flex;justify-content:space-between;align-items:baseline')}>
              <span style={st('font:600 13.5px var(--font-ui)')}>{b.label}</span>
              <span style={st('font:800 18px var(--font-display)')}>{b.hours}h</span>
            </div>
            <div style={st('height:8px;border-radius:999px;background:var(--chip);overflow:hidden')}>
              <span style={st(`display:block;height:100%;border-radius:999px;background:${b.key === 'main' ? 'var(--acc)' : 'var(--accA45)'};width:${Math.max(3, Math.round((b.hours / max) * 100))}%`)} />
            </div>
            <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>{b.sub}</span>
          </div>
        ))}
      </div>
      <span style={st('font:400 12px var(--font-ui);color:var(--muted);padding:0 4px')}>{t('card.ttb.source')}</span>
    </div>
  );
}

function SpecLines({ set, ownRamGb }: { set: SteamRequirementSet; ownRamGb: number | null }) {
  const t = useT();
  const verdict = memoryVerdict(ownRamGb, set.memoryGb);
  if (set.lines.length === 0) {
    return <div style={st('padding:12px 16px;background:var(--surf);font:500 13.5px/1.4 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{set.text}</div>;
  }
  return (
    <>
      {set.lines.map((l) => (
        <div key={l.label} style={st('display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;align-items:baseline;padding:12px 16px;background:var(--surf)')}>
          <span style={st('font:600 11px var(--font-mono);letter-spacing:0.05em;color:var(--faint);text-transform:uppercase')}>{l.label}</span>
          <span style={st('font:500 13.5px/1.4 var(--font-ui);text-wrap:pretty;overflow-wrap:anywhere')}>
            {l.value}
            {verdict && /^(memory|ram|system memory)$/i.test(l.label) && (
              <span style={st(`margin-left:8px;font-weight:700;color:${verdict === 'ok' ? 'var(--accText)' : 'var(--danger)'}`)}>{verdict === 'ok' ? t('game.reqs.memoryOk') : t('game.reqs.memoryLow')}</span>
            )}
          </span>
        </div>
      ))}
    </>
  );
}

/** System specs: Steam's minimum and recommended PC requirements, and (when you've saved them) how your own PC compares. Fetched when opened. */
export function SpecsSheet({ game }: { game: Game }) {
  const t = useT();
  const reqs = useQuery({ queryKey: ['game-requirements', game.id], queryFn: () => gamesApi.requirements(game.id), staleTime: 10 * 60_000 });
  const specs = useQuery({ queryKey: ['computer-specs'], queryFn: authApi.computerSpecs });
  const requirements = reqs.data?.requirements ?? null;
  const [tab, setTab] = useState<'minimum' | 'recommended'>('recommended');
  const active = requirements ? (requirements[tab] ?? requirements.recommended ?? requirements.minimum) : null;

  if (reqs.isPending) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>;
  if (reqs.isError) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{reqs.error instanceof Error ? reqs.error.message : t('game.reqs.failed')}</span>;
  if (!requirements || !active) return <span style={st('padding:0 4px;font:400 14px/1.4 var(--font-ui);color:var(--muted)')}>{t('game.reqs.none')}</span>;

  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      <div role="tablist" style={st('display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:3px;border-radius:999px;background:var(--surf)')}>
        {(['minimum', 'recommended'] as const).map((k) => {
          const on = tab === k;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={on}
              disabled={!requirements[k]}
              onClick={() => setTab(k)}
              style={st(`height:36px;border:none;border-radius:999px;font:600 13px var(--font-ui);background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--muted)'};opacity:${requirements[k] ? 1 : 0.4}`)}
            >
              {t(k === 'minimum' ? 'game.reqs.minimum' : 'game.reqs.recommended')}
            </button>
          );
        })}
      </div>
      <RowGroup radius={16}>
        <SpecLines set={active} ownRamGb={specs.data?.ramGb ?? null} />
      </RowGroup>
      <YourPc specs={specs.data} />
      <span style={st('font:400 12px var(--font-ui);color:var(--muted);padding:0 4px')}>{t('card.specs.source')}</span>
    </div>
  );
}

/** Play journal: when you started and finished it, and for how long. */
export function JournalSheet({ game }: { game: Game }) {
  const t = useT();
  const { entries } = useGamePlayLog(game.id);
  if (entries.length === 0) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('card.journal.none')}</span>;
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:0 4px')}>
      {entries.map((e) => (
        <div key={e.id} style={st('display:flex;gap:12px;font:400 13.5px var(--font-ui)')}>
          <span style={st('width:52px;flex-shrink:0;font:500 12px var(--font-mono);color:var(--muted);padding-top:1px')}>{shortDate(e.finishedAt ?? e.startedAt)}</span>
          <span>
            {e.finishedAt ? t('game.detail.journal.finished', { date: shortDate(e.startedAt) }) : t('game.detail.journal.started', { date: shortDate(e.startedAt) })}
            {e.minutesPlayed !== null && ` · ${t('game.detail.journal.played', { hours: Math.round(e.minutesPlayed / 60) })}`}
            {e.roomName && ` · ${t('game.detail.journal.beatenWith', { room: e.roomName })}`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** History: every dated thing recorded about this card (added, synced, console ownership, status moves, play log), newest first. */
export function HistorySheet({ game }: { game: Game }) {
  const t = useT();
  const { data, isLoading } = useQuery({ queryKey: ['games', game.id, 'history'], queryFn: () => gamesApi.history(game.id), staleTime: 0, retry: false });
  const entries = data?.entries ?? [];
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const describe = (e: GameHistoryEntry): string => {
    switch (e.kind) {
      case 'added':
        return t('card.history.added');
      case 'synced':
        return t('card.history.synced', { source: e.source ? t(SYNC_SOURCE_KEY[e.source]) : '' });
      case 'ownership':
        return t('card.history.ownership', { platforms: e.platforms?.length ? e.platforms.join(', ') : t('card.history.ownershipNone') });
      case 'status':
        return e.status
          ? e.from
            ? t('card.history.statusFrom', { from: cardStatusLabel(e.from), status: cardStatusLabel(e.status) })
            : t('card.history.status', { status: cardStatusLabel(e.status) })
          : t('card.history.added');
      case 'started':
        return t('card.history.started');
      case 'finished':
        return e.minutesPlayed != null ? t('card.history.finishedPlayed', { hours: Math.round(e.minutesPlayed / 60) }) : t('card.history.finished');
      case 'reviewed':
        return t('card.history.reviewed');
      case 'purchased':
        return t('card.history.purchased');
      case 'replayed':
        return t('card.history.replayed');
    }
  };
  if (isLoading) return null;
  if (entries.length === 0) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('card.history.none')}</span>;
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px;padding:0 4px')}>
      {entries.map((e) => (
        <div key={e.id} style={st('display:flex;gap:12px;font:400 13.5px var(--font-ui)')}>
          <span style={st('width:92px;flex-shrink:0;font:500 12px var(--font-mono);color:var(--muted);padding-top:1px')}>{when(e.at)}</span>
          <span>{describe(e)}</span>
        </div>
      ))}
      <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('card.history.note')}</span>
    </div>
  );
}

/** Achievements: everyone's Steam progress on this game (live), or just yours on the shelf. */
export function AchievementsSheet({ game }: { game: Game }) {
  const t = useT();
  const { isShelf } = useScope();
  const { players, isLoading } = useGameAchievements(game.id);
  const rows = players.length
    ? players.map((p) => ({ id: p.user.id, name: p.user.displayName, color: p.user.avatarColor, avatarUrl: p.user.avatarUrl, unlocked: p.unlocked, total: p.total }))
    : [];
  if (isLoading) return <span style={st('padding:0 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>;
  if (rows.length === 0 && !game.myAchievements) return <span style={st('padding:0 4px;font:400 14px/1.4 var(--font-ui);color:var(--muted)')}>{t(isShelf ? 'card.ach.noneShelf' : 'card.ach.noneRoom')}</span>;
  const list = rows.length ? rows : [{ id: 'me', name: t('common.you'), color: 'var(--acc)', avatarUrl: null, unlocked: game.myAchievements!.unlocked, total: game.myAchievements!.total }];
  return (
    <RowGroup radius={16}>
      {list.map((r) => {
        const pct = r.total > 0 ? Math.round((r.unlocked / r.total) * 100) : 0;
        return (
          <div key={r.id} style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;background:var(--surf)')}>
            <Avatar name={r.name} color={r.color} avatarUrl={r.avatarUrl} size={30} fontSize={12} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:5px')}>
              <span style={st('display:flex;justify-content:space-between;gap:8px;font:600 13.5px var(--font-ui)')}>
                <span style={st('white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.name}</span>
                <span style={st('flex-shrink:0;color:var(--accText);font-family:var(--font-mono);font-size:12px')}>{r.unlocked} / {r.total}</span>
              </span>
              <span style={st('display:block;height:4px;border-radius:999px;background:var(--chip);overflow:hidden')}>
                <span style={st(`display:block;height:100%;border-radius:999px;background:var(--acc);width:${pct}%`)} />
              </span>
            </span>
          </div>
        );
      })}
    </RowGroup>
  );
}

/** Tags: your own filing labels on this game. Only the person who added a game can tag it. */
export function TagsSheet({ game }: { game: Game }) {
  const t = useT();
  const { ops } = useScope();
  const [draft, setDraft] = useState('');
  function save() {
    const tag = draft.trim();
    if (!tag) return;
    void ops.applyTag(game.id, tag);
    setDraft('');
  }
  return (
    <div style={st('display:flex;flex-wrap:wrap;gap:6px;padding:0 4px')}>
      {game.tags.map((tag) => (
        <span key={tag.id} style={st('display:flex;align-items:center;gap:4px;height:32px;padding:0 4px 0 12px;border-radius:999px;background:var(--surf);font:500 13px var(--font-ui)')}>
          #{tag.name}
          <button type="button" onClick={() => ops.removeTag(game.id, tag.id)} aria-label={t('game.detail.removeTag')} style={st('width:24px;height:24px;border-radius:50%;border:none;background:transparent;color:var(--muted);font-size:15px;line-height:1;padding:0')}>
            ×
          </button>
        </span>
      ))}
      <div style={st('display:flex;gap:6px')}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\s+/g, '-').toLowerCase())}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder={t('game.detail.addTag')}
          aria-label={t('game.detail.addTag')}
          style={st('width:140px;height:32px;padding:0 12px;border-radius:999px;background:transparent;border:1px dashed var(--line);color:var(--text);font-size:13px;outline:none')}
        />
        {draft.trim() && (
          <button type="button" onClick={save} style={st('height:32px;padding:0 12px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 12.5px var(--font-ui)')}>
            {t('common.add')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Series: the earlier entries of this game's IGDB series that aren't on the list yet, each one tap from being added. */
export function SeriesSheet({ game }: { game: Game }) {
  const t = useT();
  const { isShelf } = useScope();
  return (
    <div style={st('display:flex;flex-direction:column;gap:12px')}>
      <SeriesSection game={game} isShelf={isShelf} />
      <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted);padding:0 4px')}>{t('card.series.hint')}</span>
    </div>
  );
}
