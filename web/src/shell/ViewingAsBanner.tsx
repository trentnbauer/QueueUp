import { useState } from 'react';
import { adminApi } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { useT } from '../i18n';

/** Sits at the very top of the app while an administrator is viewing it as someone else (#1102):
 * whose account this is, that nothing can be changed, and an Exit back to their own. */
export function ViewingAsBanner() {
  const t = useT();
  const ui = useUi();
  const { user, viewingAs } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!viewingAs || !user) return null;

  const exit = async () => {
    setBusy(true);
    try {
      await adminApi.stopViewingAs();
      // A full reload, so nothing cached from their account is left on screen.
      window.location.assign(`${getBasePath()}/admin`);
    } catch (e) {
      setBusy(false);
      ui.showError(e instanceof Error ? e.message : t('shell.viewingAs.exitFailed'));
    }
  };

  return (
    <div
      role="status"
      style={st('flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 16px;background:var(--accSoft);color:var(--accText);border-bottom:1px solid var(--line);font:600 13.5px/1.35 var(--font-ui)')}
    >
      <span style={st('flex:1 1 240px;min-width:0')}>
        {t('shell.viewingAs.text', {
          name: user.displayName,
          time: new Date(viewingAs.until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        })}
      </span>
      <Btn kind="accent" height={32} padX={14} fontSize={13} disabled={busy} onClick={() => void exit()}>
        {t('shell.viewingAs.exit')}
      </Btn>
    </div>
  );
}
