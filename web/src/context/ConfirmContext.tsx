import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import styles from './ConfirmContext.module.css';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

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
      {options && (
        <div className={styles.backdrop} role="presentation" onClick={() => settle(false)}>
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-label={options.title ?? 'Confirm'}
            onClick={(e) => e.stopPropagation()}
          >
            {options.title && <div className={styles.title}>{options.title}</div>}
            <p className={styles.message}>{options.message}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => settle(false)} autoFocus>
                {options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={options.danger ? styles.dangerButton : styles.confirmButton}
                onClick={() => settle(true)}
              >
                {options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used within a ConfirmProvider');
  return confirm;
}
