import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog } from '../ui/Dialog';
import { Btn } from '../ui/primitives';
import { inputField } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** When set, the confirm button stays disabled until the user types this exact phrase (e.g. "DELETE"). */
  typedConfirmation?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// A separate component so the typed-confirmation field gets a clean slate every time it opens.
function ConfirmDialog({ options, onSettle }: { options: ConfirmOptions; onSettle: (value: boolean) => void }) {
  const t = useT();
  const [typed, setTyped] = useState('');
  const required = options.typedConfirmation;
  const blocked = required !== undefined && typed !== required;

  return (
    <Dialog onClose={() => onSettle(false)} alert width={520} ariaLabel={options.title ?? t('common.confirm')} bare padded={false}>
      <div style={st('display:flex;flex-direction:column;gap:14px;padding:24px 22px 22px')}>
        {options.title && <span style={st('font:700 21px/1.2 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{options.title}</span>}
        <span style={st('font:400 14.5px/1.5 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{options.message}</span>
        {required !== undefined && (
          <label style={st('display:flex;flex-direction:column;gap:8px;font:600 12.5px var(--font-ui);color:var(--muted)')}>
            {t('shell.confirm.typeToConfirm', { phrase: required })}
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              style={st(inputField, { width: '100%' })}
            />
          </label>
        )}
        <div style={st('display:flex;justify-content:flex-end;gap:8px;margin-top:6px')}>
          <Btn kind='ghost' height={44} style={{ background: 'var(--chip)', color: 'var(--text)' }} onClick={() => onSettle(false)}>
            {options.cancelLabel ?? t('common.cancel')}
          </Btn>
          <Btn
            kind={options.danger ? 'danger' : 'text'}
            height={44}
            weight={700}
            fontSize={14}
            disabled={blocked}
            onClick={() => onSettle(true)}
          >
            {options.confirmLabel ?? t('common.confirm')}
          </Btn>
        </div>
      </div>
    </Dialog>
  );
}

/** Replaces window.confirm with the design's centred confirm dialog. One instance for the whole app;
 * the promise resolves from the last confirm() call whichever button is pressed. */
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
