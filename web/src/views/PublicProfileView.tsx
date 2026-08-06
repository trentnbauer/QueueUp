import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PublicUserProfile } from '@queueup/shared';
import { publicProfileApi } from '../api/publicProfile';
import { AvatarBadge } from '../components/AvatarBadge';
import { Logo } from '../components/Logo';
import achievementsStyles from './AchievementsView.module.css';
import shelfStyles from './CurrentlyPlayingView.module.css';
import styles from './PublicProfileView.module.css';

interface PublicProfileViewProps {
  userId: string;
}

/** The shareable, unauthenticated `/u/:id` counterpart to a user's Personal Shelf (issue #511) -
 * badges, Beaten count, and Currently Playing, reachable with no sign-in at all. Deliberately a
 * standalone page, not rendered inside the normal authenticated shell (Sidebar/Header) - App.tsx
 * routes here before its own sign-in gate, the one place in the app that's reachable while
 * signed out. Reuses AchievementsView's badge-tile grid and CurrentlyPlayingView's game-cover tile
 * styling (imported CSS modules, not the components themselves - those are wired to authenticated
 * queries/contexts this page has none of) rather than a third, driftable copy of the same look. */
export function PublicProfileView({ userId }: PublicProfileViewProps) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    publicProfileApi
      .get(userId)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div className={styles.page}>
      <Link to="/" className={styles.brand}>
        <Logo size={28} />
        <span className={styles.brandName}>QueueUp</span>
      </Link>

      {loading && <p className={styles.status}>Loading…</p>}
      {!loading && notFound && <p className={styles.status}>This profile isn't public, or doesn't exist.</p>}

      {!loading && profile && (
        <>
          <div className={styles.identity}>
            <AvatarBadge name={profile.displayName} color={profile.avatarColor} avatarUrl={profile.avatarUrl} size={64} />
            <div>
              <div className={styles.displayName}>{profile.displayName}</div>
              <div className={styles.statLine}>
                {profile.beatenGameCount} game{profile.beatenGameCount === 1 ? '' : 's'} beaten · {profile.badges.length} achievement
                {profile.badges.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Achievements</div>
            {profile.badges.length === 0 ? (
              <p className={achievementsStyles.empty}>No achievements unlocked yet.</p>
            ) : (
              <div className={achievementsStyles.grid}>
                {profile.badges.map((badge) => (
                  <div key={badge.key} className={achievementsStyles.tile} title={badge.description}>
                    <div className={achievementsStyles.emoji} aria-hidden="true">
                      {badge.emoji}
                    </div>
                    <span className={achievementsStyles.name}>{badge.name}</span>
                    <span className={achievementsStyles.description}>{badge.description}</span>
                    <span className={achievementsStyles.rarity}>{badge.rarityPercent}% of players have this</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Currently Playing</div>
            {profile.currentlyPlaying.length === 0 ? (
              <p className={shelfStyles.empty}>Nothing in progress right now.</p>
            ) : (
              <div className={shelfStyles.row}>
                {profile.currentlyPlaying.map((game) => (
                  <div key={game.id} className={shelfStyles.tile}>
                    <div
                      className={shelfStyles.cover}
                      style={game.coverImageUrl ? { backgroundImage: `url(${game.coverImageUrl})` } : undefined}
                    >
                      {!game.coverImageUrl && <span className={shelfStyles.coverFallback}>{game.title.charAt(0).toUpperCase()}</span>}
                    </div>
                    <span className={shelfStyles.tileTitle}>{game.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
