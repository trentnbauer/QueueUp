import { Link, useLocation } from 'react-router-dom';
import styles from './ShelfTabs.module.css';

const TABS = [
  { to: '/', label: 'Shelf' },
  { to: '/playing', label: 'Playing' },
  { to: '/beaten', label: 'Beaten' },
] as const;

/** Tab bar switching between the three views that make up "Personal Shelf" - the interactive shelf
 * itself, plus the read-only cross-room Playing/Beaten aggregates that used to be separate
 * top-level sidebar destinations (issue #490: "merge...into 1 tab but still separate them
 * somehow"). Each tab is still its own route (bookmarkable, back-button-friendly) - this is a
 * styled nav, not shared client state, same visual language as AddGameModal's Search/Popular tabs
 * (issue #363) rather than a new pattern. */
export function ShelfTabs() {
  const pathname = useLocation().pathname;
  return (
    <div className={styles.tabRow} role="tablist" aria-label="Personal Shelf sections">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          role="tab"
          aria-selected={pathname === tab.to}
          className={`${styles.tabButton} ${pathname === tab.to ? styles.tabButtonActive : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
