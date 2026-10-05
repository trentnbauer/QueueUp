import type { YearInReview, YearStoryFacts } from '@queueup/shared';
import type { RoomYearInReview } from '../components/roomYearInReview';

/** The facts a personal Year in Review story is written from (issue #826): the numbers and titles the
 * page already shows. The names of people in a room are left out, and so are notes and journal text,
 * which are never loaded here at all. */
export function personalStoryFacts(y: YearInReview): YearStoryFacts {
  return {
    windowStart: y.windowStart,
    windowEnd: y.windowEnd,
    finishedCount: y.doneCount,
    estimatedHours: y.estimatedHours > 0 ? y.estimatedHours : null,
    finishedTitles: y.completedByGroup.flatMap((g) => g.games.map((x) => x.title)),
    topGenres: y.genreSpread.slice(0, 5),
    longestGames: y.mostTimeConsuming.map((g) => ({ title: g.title, hours: g.hours })),
    mostVoted: y.topVoted.map((g) => g.title),
    rooms: y.completedByGroup.filter((g) => g.roomName).map((g) => ({ name: g.roomName!, games: g.games.map((x) => x.title) })),
    rarestAchievements: y.rarestAchievements.map((a) => ({ game: a.gameTitle, name: a.achievementName })),
    memberCount: null,
  };
}

/** The facts a room's story is written from: what the room finished and voted for, and how many people play. */
export function roomStoryFacts(y: RoomYearInReview, memberCount: number): YearStoryFacts {
  return {
    windowStart: y.windowStart,
    windowEnd: y.windowEnd,
    finishedCount: y.completedGames.length,
    estimatedHours: null,
    finishedTitles: y.completedGames.map((g) => g.title),
    topGenres: y.genreSpread.slice(0, 5),
    longestGames: [],
    mostVoted: y.topVoted ? [y.topVoted.title] : [],
    rooms: [],
    rarestAchievements: [],
    memberCount,
  };
}
