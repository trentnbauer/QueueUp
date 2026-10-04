import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gamesApi } from '../api/games';
import { badgesApi } from '../api/badges';
import { useAnnounceUnlock } from '../context/AchievementUnlockContext';
import { useUi } from '../context/UiContext';
import { Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { PageShell, SectionTitle, StatTiles } from './PageShell';
import { t as tr, useT } from '../i18n';

const BAR = 'flex:1;height:12px;border-radius:999px;background:var(--surf);overflow:hidden';

function Bars({ rows, labelWidth = 84 }: { rows: { label: string; count: number }[]; labelWidth?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} style={st('display:flex;align-items:center;gap:10px')}>
          <span style={st(`width:${labelWidth}px;flex-shrink:0;font:500 12.5px var(--font-ui);color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{r.label}</span>
          <div style={st(BAR)}>
            <div style={{ width: `${(r.count / max) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--acc)' }} />
          </div>
          <span style={st('min-width:22px;text-align:right;font:600 12.5px var(--font-mono)')}>{r.count}</span>
        </div>
      ))}
    </>
  );
}

export function InsightsPage() {
  const ui = useUi();
  const t = useT();
  const { data, isLoading, isError } = useQuery({ queryKey: ['me', 'backlog-insights'], queryFn: gamesApi.backlogInsights });

  return (
    <PageShell
      title={t('pages.insights.title')}
      hint={t('pages.insights.hint')}
    >
      {isLoading && <span style={st('color:var(--muted)')}>{t('common.loading')}</span>}
      {isError && <span style={st('color:var(--muted)')}>{t('pages.common.loadFailed')}</span>}
      {data && (
        <>
          <StatTiles
            stats={[
              {
                v: data.averageDaysToBeat !== null ? t('pages.insights.days', { n: data.averageDaysToBeat }) : '—',
                l: data.finishedEntryCount ? t('pages.insights.avgDaysCount', { n: data.finishedEntryCount }) : t('pages.insights.avgDays'),
              },
              {
                v: data.averageHoursToBeat !== null ? t('pages.insights.hours', { n: data.averageHoursToBeat }) : '—',
                l: data.hoursTrackedEntryCount ? t('pages.insights.avgHoursCount', { n: data.hoursTrackedEntryCount }) : t('pages.insights.avgHours'),
              },
              { v: data.backlogCount, l: t(data.backlogCount === 1 ? 'pages.insights.inBacklog.one' : 'pages.insights.inBacklog.other') },
            ]}
          />
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            <SectionTitle>{t('pages.insights.mostNeglected')}</SectionTitle>
            {data.mostNeglectedGame ? (
              <div
                role="button"
                tabIndex={0}
                onClick={() => ui.selectGame(data.mostNeglectedGame!.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), ui.selectGame(data.mostNeglectedGame!.id))}
                style={st('display:flex;align-items:center;gap:14px;padding:12px;border-radius:18px;background:var(--surf);cursor:pointer')}
              >
                <Cover title={data.mostNeglectedGame.title} url={data.mostNeglectedGame.coverImageUrl} width={52} radius={10} />
                <span style={st('flex:1;display:flex;flex-direction:column;gap:3px')}>
                  <span style={st('font:600 16px var(--font-ui)')}>{data.mostNeglectedGame.title}</span>
                  <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('pages.insights.untouched', { n: data.mostNeglectedGame.daysSinceActivity })}</span>
                </span>
              </div>
            ) : (
              <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.insights.noDust')}</span>
            )}
          </div>
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            <SectionTitle>{t('pages.insights.backlogAge')}</SectionTitle>
            {data.backlogCount === 0 ? <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('pages.insights.empty')}</span> : <Bars rows={data.ageDistribution} />}
          </div>
        </>
      )}
    </PageShell>
  );
}

export function AchievementsPage() {
  const announce = useAnnounceUnlock();
  const t = useT();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['me', 'badges'], queryFn: badgesApi.list });
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setErr(null);
    try {
      const { unlockedBadges } = await badgesApi.refresh();
      announce(unlockedBadges);
      await refetch();
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('pages.achievements.refreshFailed'));
    } finally {
      setRefreshing(false);
    }
  }

  const badges = data?.badges ?? [];
  const earned = badges.filter((b) => b.unlockedAt).length;

  return (
    <PageShell title={t('pages.achievements.title')} hint={t('pages.achievements.hint')}>
      {isLoading && <span style={st('color:var(--muted)')}>{t('common.loading')}</span>}
      {isError && <span style={st('color:var(--muted)')}>{t('pages.common.loadFailed')}</span>}
      {err && <span style={st('color:var(--danger);font-size:14px')}>{err}</span>}
      {data && (
        <>
          <div style={st('display:flex;align-items:center;gap:12px;flex-wrap:wrap')}>
            <span style={st('font:500 13px var(--font-mono);color:var(--muted)')}>{t('pages.achievements.earnedCount', { earned, total: badges.length })}</span>
            <Btn height={36} fontSize={13} disabled={refreshing} onClick={refresh}>
              {refreshing ? t('pages.achievements.checking') : t('pages.achievements.refresh')}
            </Btn>
          </div>
          <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px')}>
            {badges.map((b) => {
              const got = !!b.unlockedAt;
              return (
                <div
                  key={b.key}
                  style={st(`display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:18px;background:${got ? 'var(--surf)' : 'transparent'};border:${got ? '1px solid transparent' : '1px solid var(--chip)'};opacity:${got ? 1 : 0.75}`)}
                >
                  <span style={st(`font-size:28px;line-height:1;filter:${got ? 'none' : 'grayscale(1)'}`)}>{b.emoji}</span>
                  <span style={st('font:600 14.5px var(--font-ui)')}>{b.name}</span>
                  <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{b.description}</span>
                  {got && (
                    <span style={st('font:500 11.5px var(--font-mono);color:var(--accText)')}>
                      {t('pages.achievements.earnedOn', { date: new Date(b.unlockedAt!).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) })}
                    </span>
                  )}
                  <div style={st('margin-top:2px;padding-top:8px;border-top:1px solid var(--chip);font:500 11.5px var(--font-ui);color:var(--text2)')}>{t('pages.achievements.rarity', { n: b.rarityPercent })}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}

export function YearPage() {
  const t = useT();
  const { data, isLoading, isError } = useQuery({ queryKey: ['me', 'year-in-review'], queryFn: gamesApi.yearInReview });

  return (
    <PageShell title={t('pages.year.title')} hint={t('pages.year.hint')}>
      {isLoading && <span style={st('color:var(--muted)')}>{t('common.loading')}</span>}
      {isError && <span style={st('color:var(--muted)')}>{t('pages.year.loadFailed')}</span>}
      {data && (
        <>
          <div style={st('display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px')}>
            {[
              [
                data.doneCount,
                data.steamAutoDetectedCount
                  ? t(data.doneCount === 1 ? 'pages.year.finishedSteam.one' : 'pages.year.finishedSteam.other', { steam: data.steamAutoDetectedCount })
                  : t(data.doneCount === 1 ? 'pages.year.finished.one' : 'pages.year.finished.other'),
              ],
              [data.estimatedHours, t('pages.year.estimatedHours')],
              ...(data.achievementsUnlocked > 0 ? [[data.achievementsUnlocked, t('pages.year.achievementsUnlocked')]] : []),
            ].map(([v, l]) => (
              <div key={String(l)} style={st('display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:18px;background:linear-gradient(140deg, var(--hero1), var(--surf))')}>
                <span style={st('font:700 36px var(--font-display);letter-spacing:-0.02em')}>{v}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{l}</span>
              </div>
            ))}
          </div>
          {data.genreSpread.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:10px')}>
              <SectionTitle>{t('pages.year.genreSpread')}</SectionTitle>
              <Bars rows={data.genreSpread.map((g) => ({ label: g.genre, count: g.count }))} labelWidth={110} />
            </div>
          )}
          {data.mostTimeConsuming.length > 0 && (
            <List title={t('pages.year.hoursWent')} rows={data.mostTimeConsuming.map((g) => [g.title, t('pages.insights.hours', { n: g.hours })])} />
          )}
          {data.completedByGroup.length > 0 && (
            <div style={st('display:flex;flex-direction:column;gap:8px')}>
              <SectionTitle>{t('pages.year.completedWith')}</SectionTitle>
              {data.completedByGroup.map((g) => (
                <div key={g.roomId ?? 'solo'} style={st('display:flex;flex-direction:column;gap:2px')}>
                  <span style={st('font:600 14px var(--font-ui)')}>
                    {g.roomName ?? t('pages.year.solo')}
                    {g.memberNames.length > 0 && <span style={st('font-weight:400;color:var(--muted)')}> ({g.memberNames.join(', ')})</span>}
                  </span>
                  <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--text2)')}>{g.games.map((x) => x.title).join(' · ')}</span>
                </div>
              ))}
            </div>
          )}
          {data.rarestAchievements.length > 0 && (
            <List title={t('pages.year.rarest')} rows={data.rarestAchievements.map((a) => [`${a.achievementName} (${a.gameTitle})`, `${a.globalUnlockPercent.toFixed(1)}%`])} />
          )}
          {data.topVoted.length > 0 && <List title={t('pages.year.topVoted')} accent rows={data.topVoted.map((g) => [g.title, t('pages.year.points', { n: g.voteScore })])} />}
        </>
      )}
    </PageShell>
  );
}

function List({ title, rows, accent }: { title: string; rows: string[][]; accent?: boolean }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      <SectionTitle>{title}</SectionTitle>
      {rows.map(([t, v], i) => (
        <div key={`${t}-${i}`} style={st('display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--chip);font:500 14.5px var(--font-ui)')}>
          <span style={{ minWidth: 0 }}>{t}</span>
          <span style={st(`flex-shrink:0;font-family:var(--font-mono);color:${accent ? 'var(--accText)' : 'var(--muted)'}`)}>{v}</span>
        </div>
      ))}
    </div>
  );
}
