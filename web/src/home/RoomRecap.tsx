import { useMemo, type ReactNode } from 'react';
import { roomsApi } from '../api/rooms';
import { computeRoomYearInReview } from '../components/roomYearInReview';
import { YearStoryCard } from '../components/YearStoryCard';
import { useScope } from '../context/ScopeContext';
import { RoomWeeklyRecap } from '../dialogs/RoomWeeklyRecap';
import { roomStoryFacts } from '../lib/yearStoryFacts';
import { Kicker } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';
import { ActivityLog } from './ActivityLog';

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
  );
}

/** A room's Recap tab: this week, the last twelve months, and the room's activity log. */
export function RoomRecap() {
  const t = useT();
  const { room, games, members } = useScope();
  const year = useMemo(() => computeRoomYearInReview(games), [games]);
  if (!room) return null;
  const topGenre = year.genreSpread[0]?.genre ?? '—';
  return (
    <>
      <Section label={t('room.settings.recap.label')}>
        <RoomWeeklyRecap roomId={room.id} />
      </Section>
      <Section label={t('room.settings.yearLabel')}>
        <div style={st('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
          {[
            [String(year.completedGames.length), t(year.completedGames.length === 1 ? 'room.settings.gamesFinished.one' : 'room.settings.gamesFinished.other')],
            [topGenre, t('room.settings.topGenre')],
            [year.topVoted ? year.topVoted.title : '—', t('room.settings.mostVoted')],
          ].map(([v, l]) => (
            <div key={l} style={st('display:flex;flex-direction:column;gap:3px;padding:12px;border-radius:16px;background:var(--surf);min-width:0')}>
              <span style={st('font:700 17px/1.15 var(--font-display);overflow:hidden;text-overflow:ellipsis')}>{v}</span>
              <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>{l}</span>
            </div>
          ))}
        </div>
        <YearStoryCard roomId={room.id} facts={roomStoryFacts(year, members.length)} />
      </Section>
      <Section label={t('room.settings.activityLabel')}>
        <ActivityLog queryKey={['room-activity', room.id]} fetchPage={(before) => roomsApi.activity(room.id, before)} emptyText={t('room.settings.nothingYet')} />
      </Section>
    </>
  );
}
