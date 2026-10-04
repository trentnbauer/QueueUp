import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, ChipToggle, Kicker } from '../ui/primitives';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { BACKLOG_SORT_OPTIONS, toggleBacklogSort, useBacklogSort } from '../home/backlogSort';
import { formatRelativeTime } from '../utils/relativeTime';

export function ShelfSettingsDialog() {
  const ui = useUi();
  const { games } = useScope();
  const [showAct, setShowAct] = useState(false);
  const activity = useInfiniteQuery({
    queryKey: ['shelf-activity'],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => gamesApi.activity(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: showAct,
  });
  const entries = activity.data?.pages.flatMap((p) => p.entries) ?? [];
  const [backlogSort, setBacklogSort] = useBacklogSort();

  return (
    <Dialog onClose={() => ui.closeDialog('shelfSettings')} title="Shelf settings" gap={24}>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>SYSTEMS OWNED</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Add Game can limit its search to these systems with the "Owned systems only" button.</span>
        <SystemsPicker onSaved={() => ui.notify('Systems saved')} />
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>SORT BACKLOG BY</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Pick one or more. The first you pick sorts the Backlog; the next breaks ties.</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {BACKLOG_SORT_OPTIONS.map((o) => {
            const rank = backlogSort.indexOf(o.key) + 1;
            return (
              <ChipToggle key={o.key} on={rank > 0} height={36} onClick={() => setBacklogSort(toggleBacklogSort(backlogSort, o.key))}>
                {backlogSort.length > 1 && rank > 0 && (
                  <span aria-label={`priority ${rank}`} style={st('margin-right:6px;font:700 11px var(--font-mono);opacity:0.7')}>{rank}</span>
                )}
                {o.label}
              </ChipToggle>
            );
          })}
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>EXPORT · {games.length} GAMES</Kicker>
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'personal-shelf')}>Export CSV</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'personal-shelf')}>Export JSON</Btn>
        </div>
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>ACTIVITY</Kicker>
        {!showAct ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAct(true)}>
            Show shelf activity
          </Btn>
        ) : (
          <>
            {activity.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Loading…</span>}
            {!activity.isLoading && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Nothing's happened on your shelf yet.</span>}
            {entries.map((a) => (
              <div key={a.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
                <span>{a.message}</span>
                <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(a.createdAt)}</span>
              </div>
            ))}
            {activity.hasNextPage && (
              <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
                {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Btn>
            )}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          ui.closeDialog('shelfSettings');
          ui.openDialog('me');
        }}
        style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:400 13px/1.5 var(--font-ui);text-align:left')}
      >
        Currency, layout, sign-in methods and your account live in{' '}
        <span style={st('color:var(--accText);text-decoration:underline;text-underline-offset:3px')}>your profile</span>.
      </button>
    </Dialog>
  );
}
