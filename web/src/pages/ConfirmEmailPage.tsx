import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { alertEmailApi } from '../api/notificationPreferences';
import { Wordmark } from '../ui/primitives';
import { st } from '../ui/st';
import { t as tr, useT } from '../i18n';

/** `/confirm-email/:token`, opened from the link in the confirmation email. Works signed in or not:
 * the link's token is the proof. */
export function ConfirmEmailPage({ token }: { token: string }) {
  const t = useT();
  const [state, setState] = useState<{ kind: 'working' } | { kind: 'done'; email: string } | { kind: 'failed'; message: string }>({ kind: 'working' });

  useEffect(() => {
    let cancelled = false;
    alertEmailApi
      .confirm(token)
      .then((res) => !cancelled && setState({ kind: 'done', email: res.email }))
      .catch((e) => !cancelled && setState({ kind: 'failed', message: e instanceof Error ? e.message : tr('pages.confirmEmail.invalid') }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={st('min-height:100vh;background:var(--bg);color:var(--text)')}>
      <div style={st('max-width:560px;margin:0 auto;padding:0 clamp(16px,4vw,40px) 64px;display:flex;flex-direction:column;gap:24px')}>
        <div style={st('display:flex;align-items:center;height:68px')}>
          <Link to="/" style={st('display:flex;text-decoration:none')}>
            <Wordmark size={23} />
          </Link>
        </div>
        <h1 style={st('font:700 clamp(26px,5vw,36px)/1.1 var(--font-display);letter-spacing:-0.03em;margin:0')}>{t('pages.confirmEmail.title')}</h1>
        <p style={st('font:400 15px/1.5 var(--font-ui);margin:0')} role="status">
          {state.kind === 'working' && t('pages.confirmEmail.confirming')}
          {state.kind === 'done' && t('pages.confirmEmail.done', { email: state.email })}
          {state.kind === 'failed' && state.message}
        </p>
        <Link to="/" style={st('color:var(--accText);font:600 14px var(--font-ui);text-decoration:none')}>
          {t('pages.common.backToQueueUp')}
        </Link>
      </div>
    </div>
  );
}
