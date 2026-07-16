import styles from './TruncatedListBanner.module.css';

interface TruncatedListBannerProps {
  truncated: boolean;
}

/** Shown when a shelf/room has hit the server's per-list cap (MAX_GAMES_PER_LIST) - without this,
 * older games past the cap silently stop appearing with no indication anything was cut off. */
export function TruncatedListBanner({ truncated }: TruncatedListBannerProps) {
  if (!truncated) return null;

  return (
    <div className={styles.banner} role="status">
      Showing the 500 most recently added games - older games aren't shown. Consider marking some as
      Done or removing ones you no longer want to track.
    </div>
  );
}
