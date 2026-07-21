import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useModalA11y } from '../hooks/useModalA11y';
import styles from './ConfirmContext.module.css';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the user types this exact phrase into a
   * text field (e.g. "DELETE"). Mirrors the typed-confirmation pattern from self-service account
   * deletion, for actions destructive enough that a single misclick shouldn't be enough to trigger
   * them - deleting someone else's account, or a whole room's worth of games and membership. */
  typedConfirmation?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmDialogProps {
  options: ConfirmOptions;
  onSettle: (value: boolean) => void;
}

// A separate component (rather than inline JSX in ConfirmProvider) so useModalA11y - which must run
// unconditionally - only mounts/unmounts along with the dialog itself, instead of being called
// conditionally within ConfirmProvider's own render. Mounting fresh per open also gives the typed-
// confirmation text field a clean slate every time, with no reset effect needed.
function ConfirmDialog({ options, onSettle }: ConfirmDialogProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(() => onSettle(false));
  const [typedText, setTypedText] = useState('');
  const requiredText = options.typedConfirmation;
  const confirmDisabled = requiredText !== undefined && typedText !== requiredText;

  return (
    <div className={styles.backdrop} role="presentation" onClick={() => onSettle(false)}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-label={options.title ?? 'Confirm'}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {options.title && <div className={styles.title}>{options.title}</div>}
        <p className={styles.message}>{options.message}</p>
        {requiredText !== undefined && (
          <div className={styles.typedConfirmBox}>
            <label className={styles.typedConfirmLabel} htmlFor="confirm-dialog-typed-input">
              Type {requiredText} to confirm
            </label>
            <input
              id="confirm-dialog-typed-input"
              type="text"
              className={styles.typedConfirmInput}
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={() => onSettle(false)} autoFocus>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            className={options.danger ? styles.dangerButton : styles.confirmButton}
            onClick={() => onSettle(true)}
            disabled={confirmDisabled}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Replaces window.confirm with an in-app, themed dialog. Renders one modal instance for the
 * whole app and resolves the promise from the last confirm() call whichever button is clicked. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts;
    setOptions(normalized);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setOptions(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && <ConfirmDialog options={options} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
  return confirm;
}
