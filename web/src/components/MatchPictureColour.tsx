import { useState, type ReactNode } from 'react';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { accentColourOfPicture } from '../utils/pictureColour';
import { useT } from '../i18n';

/** "Match my picture": reads the accent colour from the person's profile picture in the browser and
 * hands it to `onColour`. Says so when the picture cannot be read (its host does not allow it, or it
 * has no colour). Renders nothing without a picture. */
export function MatchPictureColour({ url, onColour }: { url: string | null; onColour: (colour: string) => void }): ReactNode {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!url) return null;

  async function match() {
    setBusy(true);
    setFailed(false);
    const colour = await accentColourOfPicture(url!);
    setBusy(false);
    if (colour) onColour(colour);
    else setFailed(true);
  }

  return (
    <div style={st('display:flex;flex-direction:column;align-items:flex-start;gap:6px')}>
      <Btn kind="soft" height={38} padX={14} fontSize={13} disabled={busy} onClick={() => void match()}>
        {busy ? t('settings.avatar.matching') : t('settings.avatar.match')}
      </Btn>
      {failed && <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('settings.avatar.matchFailed')}</span>}
    </div>
  );
}
