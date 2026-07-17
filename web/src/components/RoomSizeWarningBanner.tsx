import styles from './RoomSizeWarningBanner.module.css';

const MAX_RECOMMENDED_MEMBERS = 4;

interface RoomSizeWarningBannerProps {
  memberCount?: number;
}

/** SquadQueue is meant for a small, fixed squad rather than an open community - most games
 * cap co-op at 4 players, so a 5th member is a signal worth surfacing rather than a hard limit. */
export function RoomSizeWarningBanner({ memberCount }: RoomSizeWarningBannerProps) {
  if (memberCount == null || memberCount <= MAX_RECOMMENDED_MEMBERS) return null;

  return (
    <div className={styles.banner} role="status">
      ⚠ This room has {memberCount} members — most games only support up to {MAX_RECOMMENDED_MEMBERS}-player
      co-op, so not everyone may be able to play together.
    </div>
  );
}
