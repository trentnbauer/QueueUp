import { useState } from 'react';
import type { Toast } from '../context/toastReducer';
import styles from './ToastStack.module.css';

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

// A separate component (rather than inline JSX inside ToastStack's .map) so each toast can hold
// its own useState for "which action is currently in flight" - hooks can't be called inside a
// .map callback directly.
function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  function dismiss() {
    toast.onDismiss?.();
    onDismiss(toast.id);
  }

  async function handleAction(action: Toast['actions'][number]) {
    setPendingLabel(action.label);
    try {
      await action.onClick();
      dismiss();
    } catch {
      // Bug fix: previously dismissed unconditionally right after firing the action, so a failed
      // mutation (network blip, a conflicting concurrent change) silently vanished the toast while
      // telling the person nothing went wrong. Leaving it up (with the button re-enabled) at least
      // lets them notice and retry, instead of believing an action succeeded when it didn't.
      setPendingLabel(null);
    }
  }

  return (
    <div className={styles.toast} role="status">
      <div className={styles.message}>{toast.message}</div>
      <div className={styles.actions}>
        {toast.actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={styles.actionButton}
            disabled={pendingLabel !== null}
            onClick={() => handleAction(action)}
          >
            {pendingLabel === action.label ? '…' : action.label}
          </button>
        ))}
        <button type="button" className={styles.dismissButton} onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    </div>
  );
}

interface ToastStackProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

/** Renders whatever ToastContext is currently holding - see that file for why this is a stack
 * rather than a one-at-a-time queue. Purely presentational; all the list logic lives in
 * toastReducer.ts. */
export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.stack} role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
