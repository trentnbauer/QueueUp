import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, Kicker } from '../ui/primitives';
import { SystemsPicker } from '../ui/SystemsPicker';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
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

  return (
    <Dialog onClose={() => ui.closeDialog('shelfSettings')} title="Shelf settings" gap={24}>
      <div style={st('display:flex;flex-direction:column;gap:10px')}>
        <Kicker>SYSTEMS OWNED</Kicker>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>Limits the add-game search to games on these systems. Leave all off to see every platform.</span>
        <SystemsPicker onSaved={() => ui.notify('Systems saved')} />
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
