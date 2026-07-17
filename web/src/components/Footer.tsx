import { useVersion } from '../hooks/useVersion';
import styles from './Footer.module.css';

export function Footer() {
  const { version, sha } = useVersion();

  return (
    <footer className={styles.footer}>
      <span>
        Designed by{' '}
        <a
          className={styles.link}
          href="https://trentbauer.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Trent Bauer
        </a>
        <span className={styles.sep}>·</span>
        Built with Claude
        <span className={styles.sep}>·</span>
        <a
          className={styles.link}
          href="https://github.com/trentnbauer"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <span className={styles.sep}>·</span>
        <a
          className={styles.link}
          href="https://github.com/trentnbauer/QueueUp"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source
        </a>
        <span className={styles.sep}>·</span>
        <a
          className={styles.link}
          href="https://github.com/trentnbauer/QueueUp/issues/new/choose"
          target="_blank"
          rel="noopener noreferrer"
        >
          Report an issue
        </a>
        {version && (
          <>
            <span className={styles.sep}>·</span>
            {sha ? (
              <a
                className={styles.link}
                href={`https://github.com/trentnbauer/QueueUp/commit/${sha}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`Commit ${sha}`}
              >
                {version}
              </a>
            ) : (
              <span>{version}</span>
            )}
          </>
        )}
      </span>
    </footer>
  );
}
