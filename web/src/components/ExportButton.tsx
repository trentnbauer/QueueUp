import { useRef } from 'react';
import type { Game } from '@squadqueue/shared';
import { exportGames } from '../utils/exportGames';
import styles from './ExportButton.module.css';

interface ExportButtonProps {
  games: Game[];
  /** Used as the downloaded file's base name, e.g. "my-shelf" or "squad-room". */
  baseName: string;
}

export function ExportButton({ games, baseName }: ExportButtonProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  function handleExport(format: 'csv' | 'json') {
    exportGames(games, format, baseName);
    menuRef.current?.removeAttribute('open');
  }

  if (games.length === 0) return null;

  return (
    <div className={styles.row}>
      <details className={styles.menu} ref={menuRef}>
        <summary className={styles.button}>Export ▾</summary>
        <div className={styles.panel}>
          <button type="button" className={styles.item} onClick={() => handleExport('csv')}>
            Export as CSV
          </button>
          <button type="button" className={styles.item} onClick={() => handleExport('json')}>
            Export as JSON
          </button>
        </div>
      </details>
    </div>
  );
}
