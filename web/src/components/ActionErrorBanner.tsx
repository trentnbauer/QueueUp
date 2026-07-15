import styles from './ActionErrorBanner.module.css';

interface ActionErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
  /** Set false when the banner already sits inside a padded container (e.g. Settings' page
   * padding) so its own horizontal margin doesn't double up. Defaults to true. */
  padded?: boolean;
}

export function ActionErrorBanner({ message, onDismiss, padded = true }: ActionErrorBannerProps) {
  if (!message) return null;

  return (
    <div className={`${styles.banner} ${padded ? '' : styles.flush}`} role="alert">
      <span>{message}</span>
      <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
