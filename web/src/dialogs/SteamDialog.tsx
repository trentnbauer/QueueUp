import { useState } from 'react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useSteamImportContext } from '../context/SteamImportContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Banner, Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Manage the Steam link (issue #861), same shape as the PlayStation, Xbox and Exophase dialogs: sync
 * the library, wishlist and achievements, or disconnect. Disconnecting unlinks Steam from the account,
 * which is refused for the account's primary sign-in method. */
export function SteamDialog() {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const { primaryProvider, refetch } = useAuth();
  const { busy, completions, syncingEverything, runSyncEverything } = useSteamImportContext();
  const running = busy || completions.busy || syncingEverything;
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const isPrimary = primaryProvider === 'steam';

  async function sync() {
    setError(null);
    await runSyncEverything();
    ui.notify(t('add.import.steamDone'));
  }

  async function disconnect() {
    const ok = await confirm({
      title: t('settings.me.unlink.title', { provider: 'Steam' }),
      message: t('settings.me.unlink.steamMessage'),
      confirmLabel: t('settings.steam.disconnect'),
      danger: true,
    });
    if (!ok) return;
    setDisconnecting(true);
    try {
      await authApi.unlink('steam');
      await refetch();
      ui.notify(t('settings.me.unlink.done', { provider: 'Steam' }));
      ui.closeDialog('steam');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.me.unlink.failed', { provider: 'Steam' }));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Dialog onClose={() => ui.closeDialog('steam')} title={t('settings.steam.title')} gap={16}>
      {error && <Banner>{error}</Banner>}
      <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('add.import.steamSub')}</span>
      {isPrimary && <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('settings.steam.primary')}</span>}
      <div style={st('display:flex;gap:8px;flex-wrap:wrap')}>
        <Btn kind="accent" height={44} padX={18} disabled={running} onClick={() => void sync()}>
          {running ? t('add.import.importing') : t('settings.steam.syncNow')}
        </Btn>
        <Btn height={44} padX={18} disabled={disconnecting || isPrimary} onClick={() => void disconnect()}>
          {t('settings.steam.disconnect')}
        </Btn>
      </div>
    </Dialog>
  );
}
