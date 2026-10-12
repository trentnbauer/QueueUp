import { useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Btn, Wordmark, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Shown instead of the app to someone an administrator made give up their display name: they pick a
 * new one (the server refuses blacklisted names) and carry on. */
export function MustChangeNamePage(): ReactNode {
  const t = useT();
  const { refetch } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await authApi.setDisplayName(name.trim());
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('social.rename.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={st('min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text)')}>
      <div style={st('width:100%;max-width:420px;display:flex;flex-direction:column;gap:16px')}>
        <Wordmark size={23} />
        <span style={st('font:700 28px/1.1 var(--font-display);letter-spacing:-0.03em')}>{t('social.rename.title')}</span>
        <span style={st('font:400 15px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.rename.body')}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder={t('social.rename.placeholder')}
          aria-label={t('social.rename.placeholder')}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && void save()}
          style={st(`min-width:0;${inputPill}`)}
        />
        {error && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{error}</span>}
        <div>
          <Btn height={44} padX={18} disabled={busy || !name.trim()} onClick={() => void save()}>
            {t('social.rename.save')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
