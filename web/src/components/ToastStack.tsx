import type { Toast } from '../context/toastReducer';
import styles from './ToastStack.module.css';

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
        <div key={toast.id} className={styles.toast} role="status">
          <div className={styles.message}>{toast.message}</div>
          <div className={styles.actions}>
            {toast.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  action.onClick();
                  onDismiss(toast.id);
                }}
              >
                {action.label}
              </button>
            ))}
            <button type="button" className={styles.dismissButton} onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
