import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { suggestsBeatenByPlaytime, suggestsPlayingFromMinutes, type GameSearchResult } from '@queueup/shared';
import { gamesApi } from '../api/games';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useChangeStatus } from '../game/useChangeStatus';
import { useChangelog } from '../hooks/useChangelog';
import { usePlaytimeReview } from '../hooks/usePlaytimeReview';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';
import { statusLabel } from '../i18n/labels';

/** DLC & expansions for the selected game, one tap to add each. */
export function DlcDialog() {
  const ui = useUi();
  const t = useT();
  const { games } = useScope();
  const queryClient = useQueryClient();
  const base = games.find((g) => g.id === ui.selectedGameId);
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Every add in flight, so one Add never waits for another to finish (#868).
  const [adding, setAdding] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<Record<number, 'added' | 'suggested'>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    setLoading(true);
    gamesApi
      .dlc(base.id)
      .then(({ results }) => !cancelled && setResults(results))
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : t('settings.dlc.loadFailed')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [base?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!base) return null;

  async function add(r: GameSearchResult) {
    setAdding((a) => new Set(a).add(r.igdbId));
    setError(null);
    try {
      // baseGameId: this menu is the base game's own DLC list, so the server links the new card to it.
      const res = await gamesApi.create({ igdbId: r.igdbId, roomId: base!.roomId, baseGameId: base!.id });
      setAdded((a) => ({ ...a, [r.igdbId]: 'suggestion' in res ? 'suggested' : 'added' }));
      if (!('suggestion' in res)) await queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify('suggestion' in res ? t('settings.dlc.suggested', { title: r.title }) : t('settings.dlc.added', { title: r.title }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.dlc.addFailed'));
    } finally {
      setAdding((a) => {
        const next = new Set(a);
        next.delete(r.igdbId);
        return next;
      });
    }
  }

  return (
    <Dialog
      onClose={() => ui.closeDialog('dlc')}
      padded={false}
      header={
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
          <span style={st('font:700 21px var(--font-display);letter-spacing:-0.02em')}>{t('settings.dlc.title')}</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t('settings.dlc.for', { title: base.title })}</span>
        </span>
      }
    >
      <div style={st('overflow-y:auto;padding:0 12px 28px')}>
        {error && <div style={{ padding: '0 8px 10px' }}><Banner onDismiss={() => setError(null)}>{error}</Banner></div>}
        {loading && <div style={st('padding:20px 10px;color:var(--muted);font-size:14px')}>{t('common.loading')}</div>}
        {loadError && <div style={{ padding: '0 8px' }}><Banner>{loadError}</Banner></div>}
        {!loading && !loadError && results.length === 0 && <div style={st('padding:20px 10px;color:var(--muted);font-size:14px')}>{t('settings.dlc.empty')}</div>}
        {results.map((r) => {
          const state = added[r.igdbId];
          return (
            <div key={r.igdbId} style={st('display:flex;align-items:center;gap:12px;padding:8px;border-radius:14px')}>
              <Cover title={r.title} url={r.coverImageUrl} width={38} radius={7} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{r.title}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{[r.releaseYear, r.platform].filter(Boolean).join(' · ')}</span>
              </span>
              <button
                type="button"
                disabled={adding.has(r.igdbId) || !!state}
                onClick={() => add(r)}
                style={st(`height:36px;padding:0 14px;border-radius:999px;border:none;background:${state ? 'var(--mintSoft)' : 'var(--accSoft2)'};color:${state ? 'var(--mint)' : 'var(--accText)'};font:600 13px var(--font-ui)`)}
              >
                {adding.has(r.igdbId) ? t('settings.dlc.adding') : state === 'suggested' ? t('settings.dlc.suggestedDone') : state ? t('settings.dlc.addedDone') : t('common.add')}
              </button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "What's new": the generated changelog, one group per release ("Updated to v1.5.0"), newest
 * first. A changelog from before releases were tracked falls back to one group per month. Closing
 * marks everything seen. */
export function ChangelogDialog() {
  const ui = useUi();
  const t = useT();
  const { entries, markAllSeen } = useChangelog();
  const month = (d: Date) => t(`settings.changelog.month.${MONTHS[d.getMonth()]}` as MessageKey);
  const groups = useMemo(() => {
    const byRelease = entries.some((e) => e.version !== undefined);
    const out: { key: string; label: string; date: string | null; items: typeof entries }[] = [];
    for (const e of entries) {
      const d = new Date(e.mergedAt);
      const key = byRelease ? (e.version ?? 'next') : `${month(d)} ${d.getFullYear()}`;
      const existing = out.find((g) => g.key === key);
      if (existing) {
        existing.items.push(e);
        continue;
      }
      out.push({
        key,
        label: !byRelease ? key : e.version ? t('settings.changelog.updatedTo', { version: e.version }) : t('settings.changelog.next'),
        // Newest-first, so a group's first entry is its release date.
        date: byRelease && e.version ? `${d.getDate()} ${month(d)} ${d.getFullYear()}` : null,
        items: [e],
      });
    }
    return out;
  }, [entries, t]);

  const close = () => {
    markAllSeen();
    ui.closeDialog('changelog');
  };

  return (
    <Dialog onClose={close} title={t('settings.changelog.title')} height="tall" gap={22}>
      {groups.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('settings.changelog.empty')}</span>}
      {groups.map((g) => (
        <div key={g.key} style={st('display:flex;flex-direction:column;gap:8px')}>
          <span style={st('display:flex;align-items:baseline;gap:10px;flex-wrap:wrap')}>
            <span style={st('font:700 17px var(--font-mono)')}>{g.label}</span>
            {g.date && <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>{g.date}</span>}
          </span>
          {g.items.map((it) => (
            <a
              key={it.number}
              href={it.url}
              target="_blank"
              rel="noopener noreferrer"
              style={st('display:flex;gap:10px;font:400 14px/1.45 var(--font-ui);color:var(--text);text-decoration:none')}
            >
              <span style={st('flex-shrink:0;width:6px;height:6px;margin-top:8px;border-radius:50%;background:var(--acc)')} />
              <span>{it.title}</span>
            </a>
          ))}
        </div>
      ))}
    </Dialog>
  );
}

/** "Played anything?": Steam playtime that rose since last time, with one-tap Mark Playing / Beaten. */
export function PlaytimeDialog() {
  const ui = useUi();
  const t = useT();
  const { games, ops } = useScope();
  const changeStatus = useChangeStatus();
  const { entries, markReviewed } = usePlaytimeReview(games);
  const [settled, setSettled] = useState<Record<string, string>>({});
  const close = () => {
    markReviewed();
    ui.closeDialog('playtime');
  };

  return (
    <Dialog onClose={close} bare padded={false} width={520} ariaLabel={t('settings.playtime.aria')}>
      <div style={st('padding:22px 18px 18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto')}>
        <div style={st('display:flex;flex-direction:column;gap:4px;padding:0 4px')}>
          <span style={st('font:700 23px/1.1 var(--font-display);letter-spacing:-0.02em')}>{t('settings.playtime.title')}</span>
          <span style={st('font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.playtime.intro')}</span>
        </div>
        <div style={st('display:flex;flex-direction:column;gap:6px')}>
          {entries.map(({ game, currentMinutes }) => {
            const canPlay = suggestsPlayingFromMinutes(game.status, game.roomId, currentMinutes);
            const canBeat = suggestsBeatenByPlaytime(game);
            const done = settled[game.id];
            return (
              <div key={game.id} style={st('display:flex;align-items:center;gap:12px;padding:10px;border-radius:16px;background:var(--surf)')}>
                <Cover title={game.title} url={game.coverImageUrl} width={38} radius={8} />
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{game.title}</span>
                  <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>{t('settings.playtime.hours', { h: Math.round(currentMinutes / 60) })}</span>
                </span>
                <div style={st('display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:flex-end')}>
                  {done ? (
                    <span style={st('height:28px;padding:0 10px;border-radius:999px;background:var(--mintSoft);color:var(--mint);font:600 12px var(--font-ui);display:flex;align-items:center')}>✓ {done}</span>
                  ) : (
                    <>
                      {canPlay && (
                        <Btn kind="text" height={32} padX={12} fontSize={12.5} weight={700} onClick={() => { ops.updateStatus(game.id, 'playing'); setSettled((s) => ({ ...s, [game.id]: statusLabel('playing') })); }}>
                          {t('settings.playtime.markPlaying')}
                        </Btn>
                      )}
                      {canBeat && (
                        <Btn kind="accent" height={32} padX={12} fontSize={12.5} weight={700} onClick={() => { changeStatus(game, 'done'); setSettled((s) => ({ ...s, [game.id]: statusLabel('done') })); }}>
                          {t('settings.playtime.markBeaten')}
                        </Btn>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <Btn height={48} fontSize={14.5} weight={700} style={{ background: 'var(--chip)', border: 'none' }} onClick={close}>
          {t('settings.playtime.gotIt')}
        </Btn>
      </div>
    </Dialog>
  );
}
