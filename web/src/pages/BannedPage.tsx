import { useState, type ReactNode } from 'react';
import { authApi } from '../api/auth';
import { moderationApi } from '../api/moderation';
import { useAuth } from '../context/AuthContext';
import { Btn, Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const MAX_MESSAGE = 1000;

/** All a banned person sees: that they are banned, why, and a way to ask for an unban or sign out. */
export function BannedPage(): ReactNode {
  const t = useT();
  const { banned, refetch } = useAuth();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requested = sent || !!banned?.unbanRequested;

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await moderationApi.requestUnban(message.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('social.ban.requestFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await authApi.logout().catch(() => undefined);
    await refetch();
  }

  return (
    <div style={st('min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--text)')}>
      <div style={st('width:100%;max-width:460px;display:flex;flex-direction:column;gap:16px')}>
        <Wordmark size={23} />
        <span style={st('font:700 28px/1.1 var(--font-display);letter-spacing:-0.03em')}>{t('social.ban.title')}</span>
        <span style={st('font:400 15px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.ban.body')}</span>
        {banned?.reason && <span style={st('font:600 14.5px/1.5 var(--font-ui);overflow-wrap:anywhere')}>{t('social.ban.reason', { reason: banned.reason })}</span>}
        {requested ? (
          <span style={st('font:400 14.5px/1.5 var(--font-ui)')}>{t('social.ban.requested')}</span>
        ) : (
          <>
            <span style={st('font:400 14px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.ban.askHint')}</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={5}
              placeholder={t('social.ban.placeholder')}
              aria-label={t('social.ban.placeholder')}
              style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
            />
            {error && <span style={st('font:400 13px var(--font-ui);color:var(--danger)')}>{error}</span>}
            <div>
              <Btn height={40} padX={18} disabled={busy || !message.trim()} onClick={() => void send()}>
                {t('social.ban.request')}
              </Btn>
            </div>
          </>
        )}
        <div>
          <Btn kind="ghost" height={40} padX={14} onClick={() => void signOut()}>
            {t('social.ban.signOut')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
