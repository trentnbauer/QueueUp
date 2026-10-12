import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AvatarChoice } from '@queueup/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { ColourPicker } from '../ui/ColourPicker';
import { Avatar, Banner } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

/** Choose the profile picture's source (Steam, Discord, Gravatar, or just the colour and first letter)
 * and its colour. There is no upload: pictures only come from those services. The colour is the same
 * one that tints the Personal Shelf. */
export function AvatarPicker({ onClose }: { onClose: () => void }): ReactNode {
  const t = useT();
  const ui = useUi();
  const { user, shelfColor, refetch } = useAuth();
  const settings = useQuery({ queryKey: ['avatar-settings'], queryFn: authApi.avatarSettings });
  const [busy, setBusy] = useState<AvatarChoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;

  async function choose(choice: AvatarChoice) {
    setBusy(choice);
    setError(null);
    try {
      await authApi.setAvatarChoice(choice);
      await Promise.all([refetch(), settings.refetch()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.avatar.failed'));
    } finally {
      setBusy(null);
    }
  }

  async function saveColour(colour: string | null) {
    try {
      await authApi.setShelfColor(colour);
      await refetch();
      ui.notify(t('settings.shelfColour.saved'));
    } catch (e) {
      ui.showError(e instanceof Error ? e.message : t('settings.shelfColour.failed'));
    }
  }

  const data = settings.data;
  const tiles: { choice: AvatarChoice; url: string | null; available: boolean }[] = [
    { choice: 'auto', url: user.avatarUrl, available: !data?.blocked },
    { choice: 'steam', url: data?.options.steam ?? null, available: !!data?.options.steam && !data.blocked },
    { choice: 'discord', url: data?.options.discord ?? null, available: !!data?.options.discord && !data.blocked },
    { choice: 'gravatar', url: data?.options.gravatar ?? null, available: !!data?.options.gravatar && !data.blocked },
    { choice: 'letter', url: null, available: true },
  ];

  return (
    <Dialog onClose={onClose} title={t('settings.avatar.title')} gap={16}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.avatar.hint')}</span>
      {data?.blocked && <Banner>{t('settings.avatar.blocked')}</Banner>}
      {error && <Banner>{error}</Banner>}
      <div style={st('display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px')}>
        {tiles.map((tile) => {
          const on = data?.choice === tile.choice;
          return (
            <button
              key={tile.choice}
              type="button"
              disabled={!tile.available || busy !== null}
              aria-pressed={on}
              onClick={() => void choose(tile.choice)}
              style={st(
                `display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 8px;border-radius:16px;border:2px solid ${on ? 'var(--text)' : 'transparent'};background:var(--surf);color:var(--text);opacity:${tile.available ? 1 : 0.45}`,
              )}
            >
              <Avatar name={user.displayName} color={user.avatarColor} avatarUrl={tile.url} size={56} fontSize={22} />
              <span style={st('font:600 13px var(--font-ui)')}>{t(`settings.avatar.choice.${tile.choice}` as MessageKey)}</span>
              {!tile.available && tile.choice !== 'auto' && <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>{t('settings.avatar.unavailable')}</span>}
            </button>
          );
        })}
      </div>
      {data?.choice === 'gravatar' && <span style={st('font:400 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t('settings.avatar.gravatarNote')}</span>}
      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <span style={st('font:700 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{t('settings.avatar.colour')}</span>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('settings.avatar.colourHint')}</span>
        <ColourPicker value={shelfColor} onChange={(c) => void saveColour(c)} label={t('settings.shelfColour.title')} />
      </div>
    </Dialog>
  );
}
