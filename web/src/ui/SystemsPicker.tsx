import { useState } from 'react';
import { ROOM_PLATFORM_LABELS, type RoomPlatform } from '@queueup/shared';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Btn, ChipToggle } from './primitives';
import { st } from './st';
import { useT } from '../i18n';

const PLATFORMS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

/** "Systems owned" chips with a Save button (shelf settings, profile, onboarding). */
export function SystemsPicker({ onSaved, saveLabel }: { onSaved?: () => void; saveLabel?: string }) {
  const t = useT();
  const { ownedPlatforms, refetch } = useAuth();
  const [selected, setSelected] = useState<RoomPlatform[]>(ownedPlatforms);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = selected.length !== ownedPlatforms.length || ownedPlatforms.some((p) => !selected.includes(p));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await authApi.updateOwnedPlatforms(selected);
      await refetch();
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('shell.systems.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
        {PLATFORMS.map((p) => (
          <ChipToggle
            key={p}
            on={selected.includes(p)}
            height={36}
            onClick={() => setSelected((s) => (s.includes(p) ? s.filter((x) => x !== p) : [...s, p]))}
          >
            {ROOM_PLATFORM_LABELS[p]}
          </ChipToggle>
        ))}
      </div>
      {error && <span style={st('font:500 13px var(--font-ui);color:var(--danger)')}>{error}</span>}
      {dirty && (
        <Btn kind="text" height={40} padX={18} weight={700} style={{ alignSelf: 'flex-start' }} disabled={saving} onClick={save}>
          {saving ? t('common.saving') : (saveLabel ?? t('shell.systems.saveChanges'))}
        </Btn>
      )}
    </>
  );
}
