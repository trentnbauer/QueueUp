import { useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { Btn, Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { useT } from '../i18n';

/** Shown instead of the app when the operator requires the terms to be accepted (REQUIRE_TERMS_ACCEPTANCE)
 * and this person has not accepted the current version yet (#1097). Asks again when the terms change. */
export function TermsAcceptPage({ version }: { version: string }): ReactNode {
  const t = useT();
  const { refetch } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await authApi.acceptTerms(version);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pages.termsAccept.failed'));
    }
    // A changed version (409) is picked up here too: the page re-asks with the new one.
    await refetch().catch(() => undefined);
    setBusy(false);
  }

  async function signOut() {
    await authApi.logout().catch(() => undefined);
    await refetch();
  }

  const link = 'color:var(--text);text-decoration:underline';
  return (
    <div style={st('min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text)')}>
      <div style={st('width:100%;max-width:440px;display:flex;flex-direction:column;gap:16px')}>
        <Wordmark size={23} />
        <span style={st('font:700 28px/1.1 var(--font-display);letter-spacing:-0.03em')}>{t('pages.termsAccept.title')}</span>
        <span style={st('font:400 15px/1.5 var(--font-ui);color:var(--muted)')}>{t('pages.termsAccept.body')}</span>
        <div style={st('display:flex;gap:16px;font:500 14px var(--font-ui)')}>
          <a href={`${getBasePath()}/terms`} target="_blank" rel="noopener noreferrer" style={st(link)}>
            {t('pages.termsAccept.readTerms')}
          </a>
          <a href={`${getBasePath()}/privacy`} target="_blank" rel="noopener noreferrer" style={st(link)}>
            {t('pages.termsAccept.readPrivacy')}
          </a>
        </div>
        <label style={st('display:flex;align-items:flex-start;gap:10px;font:400 14.5px/1.4 var(--font-ui);cursor:pointer')}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={st('margin-top:3px')} />
          {t('pages.termsAccept.agree')}
        </label>
        {error && (
          <span role="alert" style={st('font:400 13px var(--font-ui);color:var(--danger)')}>
            {error}
          </span>
        )}
        <div style={st('display:flex;gap:10px;align-items:center')}>
          <Btn height={44} padX={18} disabled={busy || !agreed} onClick={() => void accept()}>
            {t('pages.termsAccept.accept')}
          </Btn>
          <Btn kind="text" height={44} padX={14} onClick={() => void signOut()}>
            {t('pages.termsAccept.signOut')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
