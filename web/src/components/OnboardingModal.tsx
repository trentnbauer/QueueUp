import { useState } from 'react';
import { PRICE_REGION_LABELS, type PriceRegion } from '@squadqueue/shared';
import { useCurrencyRegion } from '../context/CurrencyRegionContext';
import styles from './OnboardingModal.module.css';

const PRICE_REGION_OPTIONS = Object.keys(PRICE_REGION_LABELS) as PriceRegion[];

interface OnboardingModalProps {
  onDone: () => void;
}

/** One-time, first-login prompt. Currently just currency/region (the only real per-user
 * preference the app has today) - more settings can be added here as they come up. */
export function OnboardingModal({ onDone }: OnboardingModalProps) {
  const { region, setRegion } = useCurrencyRegion();
  const [selected, setSelected] = useState<PriceRegion | ''>(region ?? '');

  function handleConfirm() {
    setRegion(selected || undefined);
    onDone();
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label="Welcome to SquadQueue">
        <div className={styles.title}>Welcome to SquadQueue</div>
        <p className={styles.subtitle}>Pick a currency for prices — you can change this anytime from the profile menu.</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="onboarding-region">
            Price currency
          </label>
          <select
            id="onboarding-region"
            className={styles.select}
            value={selected}
            onChange={(e) => setSelected(e.target.value as PriceRegion | '')}
          >
            <option value="">Server default</option>
            {PRICE_REGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {PRICE_REGION_LABELS[r]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.confirmButton} onClick={handleConfirm}>
            Get started
          </button>
          <button type="button" className={styles.skipButton} onClick={onDone}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
