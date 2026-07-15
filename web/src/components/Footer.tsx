import styles from './Footer.module.css';

export function Footer() {
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
          href="https://github.com/trentnbauer/SquadQueue"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source
        </a>
      </span>
    </footer>
  );
}
