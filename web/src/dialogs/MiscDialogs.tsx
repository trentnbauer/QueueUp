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

/** DLC & expansions for the selected game, one tap to add each. */
export function DlcDialog() {
  const ui = useUi();
  const { games } = useScope();
  const queryClient = useQueryClient();
  const base = games.find((g) => g.id === ui.selectedGameId);
  const [results, setResults] = useState<GameSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [added, setAdded] = useState<Record<number, 'added' | 'suggested'>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let cancelled = false;
    setLoading(true);
    gamesApi
      .dlc(base.id)
      .then(({ results }) => !cancelled && setResults(results))
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Could not load DLC for this game.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [base?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!base) return null;

  async function add(r: GameSearchResult) {
    setAdding(r.igdbId);
    setError(null);
    try {
      const res = await gamesApi.create({ igdbId: r.igdbId, roomId: base!.roomId });
      setAdded((a) => ({ ...a, [r.igdbId]: 'suggestion' in res ? 'suggested' : 'added' }));
      if (!('suggestion' in res)) await queryClient.invalidateQueries({ queryKey: ['games'] });
      ui.notify('suggestion' in res ? `${r.title} suggested` : `${r.title} added`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that DLC.');
    } finally {
      setAdding(null);
    }
  }

  return (
    <Dialog
      onClose={() => ui.closeDialog('dlc')}
      padded={false}
      header={
        <span style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
          <span style={st('font:700 21px var(--font-display);letter-spacing:-0.02em')}>DLC &amp; expansions</span>
          <span style={st('font:400 12.5px var(--font-ui);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>for {base.title}</span>
        </span>
      }
    >
      <div style={st('overflow-y:auto;padding:0 12px 28px')}>
        {error && <div style={{ padding: '0 8px 10px' }}><Banner onDismiss={() => setError(null)}>{error}</Banner></div>}
        {loading && <div style={st('padding:20px 10px;color:var(--muted);font-size:14px')}>Loading…</div>}
        {loadError && <div style={{ padding: '0 8px' }}><Banner>{loadError}</Banner></div>}
        {!loading && !loadError && results.length === 0 && <div style={st('padding:20px 10px;color:var(--muted);font-size:14px')}>No DLC on file for this game, or it's all already here.</div>}
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
                disabled={adding !== null || !!state}
                onClick={() => add(r)}
                style={st(`height:36px;padding:0 14px;border-radius:999px;border:none;background:${state ? 'var(--mintSoft)' : 'var(--accSoft2)'};color:${state ? 'var(--mint)' : 'var(--accText)'};font:600 13px var(--font-ui)`)}
              >
                {adding === r.igdbId ? 'Adding…' : state === 'suggested' ? 'Suggested ✓' : state ? 'Added ✓' : 'Add'}
              </button>
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "What's new": the generated changelog, one group per release ("Updated to v1.5.0"), newest
 * first. A changelog from before releases were tracked falls back to one group per month. Closing
 * marks everything seen. */
export function ChangelogDialog() {
  const ui = useUi();
  const { entries, markAllSeen } = useChangelog();
  const groups = useMemo(() => {
    const byRelease = entries.some((e) => e.version !== undefined);
    const out: { key: string; label: string; date: string | null; items: typeof entries }[] = [];
    for (const e of entries) {
      const d = new Date(e.mergedAt);
      const key = byRelease ? (e.version ?? 'next') : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const existing = out.find((g) => g.key === key);
      if (existing) {
        existing.items.push(e);
        continue;
      }
      out.push({
        key,
        label: !byRelease ? key : e.version ? `Updated to ${e.version}` : 'Coming in the next update',
        // Newest-first, so a group's first entry is its release date.
        date: byRelease && e.version ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : null,
        items: [e],
      });
    }
    return out;
  }, [entries]);

  const close = () => {
    markAllSeen();
    ui.closeDialog('changelog');
  };

  return (
    <Dialog onClose={close} title="What's new" height="tall" gap={22}>
      {groups.length === 0 && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing to show yet.</span>}
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
  const { games, ops } = useScope();
  const changeStatus = useChangeStatus();
  const { entries, markReviewed } = usePlaytimeReview(games);
  const [settled, setSettled] = useState<Record<string, string>>({});
  const close = () => {
    markReviewed();
    ui.closeDialog('playtime');
  };

  return (
    <Dialog onClose={close} bare padded={false} width={520} ariaLabel="Review played games">
      <div style={st('padding:22px 18px 18px;display:flex;flex-direction:column;gap:14px;overflow-y:auto')}>
        <div style={st('display:flex;flex-direction:column;gap:4px;padding:0 4px')}>
          <span style={st('font:700 23px/1.1 var(--font-display);letter-spacing:-0.02em')}>Played anything?</span>
          <span style={st('font:400 14px/1.45 var(--font-ui);color:var(--muted)')}>Steam says these picked up playtime since we last checked.</span>
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
                  <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>{Math.round(currentMinutes / 60)}h played</span>
                </span>
                <div style={st('display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:flex-end')}>
                  {done ? (
                    <span style={st('height:28px;padding:0 10px;border-radius:999px;background:var(--mintSoft);color:var(--mint);font:600 12px var(--font-ui);display:flex;align-items:center')}>✓ {done}</span>
                  ) : (
                    <>
                      {canPlay && (
                        <Btn kind="text" height={32} padX={12} fontSize={12.5} weight={700} onClick={() => { ops.updateStatus(game.id, 'playing'); setSettled((s) => ({ ...s, [game.id]: 'Playing' })); }}>
                          Mark Playing
                        </Btn>
                      )}
                      {canBeat && (
                        <Btn kind="accent" height={32} padX={12} fontSize={12.5} weight={700} onClick={() => { changeStatus(game, 'done'); setSettled((s) => ({ ...s, [game.id]: 'Beaten' })); }}>
                          Mark Beaten
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
          Got it
        </Btn>
      </div>
    </Dialog>
  );
}
