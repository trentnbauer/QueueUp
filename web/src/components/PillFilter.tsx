import { ALL_FILTER_VALUE } from './gameGridLogic';
import styles from './Header.module.css';

export interface PillFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

/** Single-select filter rendered as a row of toggleable pills (matching the app's existing
 * pill-badge look) instead of a bare <select> - reads as part of the header rather than a form.
 * Shared by Header's own inline filters (Tags) and FilterModal (Platform/Genre/Status, issue
 * #335), so it keeps using Header.module.css's filter classes rather than owning its own
 * stylesheet. */
export function PillFilter({ label, allLabel, options, value, onChange }: PillFilterProps) {
  if (options.length < 2) return null;
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.filterPills}>
        <button
          type="button"
          className={`${styles.filterPill} ${value === ALL_FILTER_VALUE ? styles.filterPillActive : ''}`}
          onClick={() => onChange(ALL_FILTER_VALUE)}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`${styles.filterPill} ${value === option ? styles.filterPillActive : ''}`}
            onClick={() => onChange(value === option ? ALL_FILTER_VALUE : option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
