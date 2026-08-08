import { ALL_FILTER_VALUE } from './gameGridLogic';
import styles from './Header.module.css';

export interface PillFilterProps {
  label: string;
  allLabel: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Fewer than this many distinct options hides the whole filter row (issue #249's "don't offer
   * a filter with nothing to filter" reasoning) - defaults to 2, right for Platform/Genre/Status:
   * those are exhaustive (every game has exactly one value), so a single distinct value present
   * means literally every game already has it, making "filter by it" a no-op. Tags aren't
   * exhaustive - a game can have zero - so even one distinct tag name still meaningfully
   * partitions the list into "tagged with it" vs "not", which is why Header passes
   * `minOptions={1}` for its Tags filter (issue #341). */
  minOptions?: number;
}

/** Single-select filter rendered as a row of toggleable pills (matching the app's existing
 * pill-badge look) instead of a bare <select> - reads as part of the header rather than a form.
 * Shared by Header's own inline filters (Tags) and FilterModal (Platform/Genre/Status, issue
 * #335), so it keeps using Header.module.css's filter classes rather than owning its own
 * stylesheet. */
export function PillFilter({ label, allLabel, options, value, onChange, minOptions = 2 }: PillFilterProps) {
  if (options.length < minOptions) return null;
  return (
    <div className={styles.filterGroup}>
      <span className={styles.filterLabel}>{label}</span>
      <div className={styles.filterPills}>
        <button
          type="button"
          aria-pressed={value === ALL_FILTER_VALUE}
          className={`${styles.filterPill} ${value === ALL_FILTER_VALUE ? styles.filterPillActive : ''}`}
          onClick={() => onChange(ALL_FILTER_VALUE)}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
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
