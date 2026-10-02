import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { alertEmailApi } from '../api/notificationPreferences';
import { Wordmark } from '../ui/primitives';
import { st } from '../ui/st';

/** `/confirm-email/:token`, opened from the link in the confirmation email. Works signed in or not:
 * the link's token is the proof. */
export function ConfirmEmailPage({ token }: { token: string }) {
  const [state, setState] = useState<{ kind: 'working' } | { kind: 'done'; email: string } | { kind: 'failed'; message: string }>({ kind: 'working' });

  useEffect(() => {
    let cancelled = false;
    alertEmailApi
      .confirm(token)
      .then((res) => !cancelled && setState({ kind: 'done', email: res.email }))
      .catch((e) => !cancelled && setState({ kind: 'failed', message: e instanceof Error ? e.message : 'This link is not valid or has expired' }));
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
        <h1 style={st('font:700 clamp(26px,5vw,36px)/1.1 var(--font-display);letter-spacing:-0.03em;margin:0')}>Confirm your email</h1>
        <p style={st('font:400 15px/1.5 var(--font-ui);margin:0')} role="status">
          {state.kind === 'working' && 'Confirming…'}
          {state.kind === 'done' && `Done. QueueUp alerts will go to ${state.email}.`}
          {state.kind === 'failed' && state.message}
        </p>
        <Link to="/" style={st('color:var(--accText);font:600 14px var(--font-ui);text-decoration:none')}>
          Back to QueueUp
        </Link>
      </div>
    </div>
  );
}
