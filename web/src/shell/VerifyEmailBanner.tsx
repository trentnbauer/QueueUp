import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ALERT_EMAIL_QUERY_KEY, NOTIFICATION_PREFERENCES_QUERY_KEY, alertEmailApi, notificationPreferencesApi } from '../api/notificationPreferences';
import { useUi } from '../context/UiContext';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const DISMISSED_KEY = 'sq-verify-email-dismissed';

/** Sits at the very top of the app while QueueUp has no address it may email for this person: the
 * sign-in provider didn't vouch for their email (so it is never mailed - anyone can type one into a
 * Discord or single sign-on profile) and they haven't confirmed an alert address - and only when they
 * have email alerts switched on (otherwise there is nothing to verify). Only when this
 * server can send email at all. One tap sends a confirmation link to their sign-in email (or, if
 * that isn't a real address, opens the notification settings to enter one); when a link is already
 * out it says so and offers to resend it. Dismissing hides it for this browser session. */
export function VerifyEmailBanner() {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ALERT_EMAIL_QUERY_KEY, queryFn: alertEmailApi.get });
  // Only for people who actually want email alerts: with none switched on there is nothing to verify.
  const prefs = useQuery({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY, queryFn: notificationPreferencesApi.get });
  const emailAlertsOn = !!prefs.data?.preferences.some((p) => p.email);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const send = useMutation({
    mutationFn: (email: string) => alertEmailApi.set({ email }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ALERT_EMAIL_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
      ui.notify(res.status === 'confirmation_sent' ? t('shell.verifyEmail.sent') : t('shell.verifyEmail.saved'));
    },
    onError: (err) => ui.showError(err instanceof Error ? err.message : t('shell.verifyEmail.failed')),
  });

  if (!data || !data.canSend || data.verified || !emailAlertsOn || dismissed) return null;

  // A made-up address (a sign-in provider that gave no email) can't be sent to.
  const accountEmailIsReal = !/\.unknown$/i.test(data.accountEmail.split('@')[1] ?? '');
  const openSettings = () => ui.openDialog('notificationSettings');
  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="status"
      style={st('flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 16px;background:var(--accSoft);color:var(--accText);border-bottom:1px solid var(--line);font:600 13.5px/1.35 var(--font-ui)')}
    >
      <span style={st('flex:1 1 240px;min-width:0')}>
        {data.pending
          ? t('shell.verifyEmail.pending', { email: data.pending })
          : t('shell.verifyEmail.needed')}
      </span>
      <span style={st('display:flex;flex-wrap:wrap;align-items:center;gap:8px')}>
        {data.pending ? (
          <>
            <Btn kind="accent" height={32} padX={14} fontSize={13} disabled={send.isPending} onClick={() => send.mutate(data.pending!)}>
              {t('shell.verifyEmail.resend')}
            </Btn>
            <Btn height={32} padX={14} fontSize={13} onClick={openSettings}>
              {t('shell.verifyEmail.change')}
            </Btn>
          </>
        ) : accountEmailIsReal ? (
          <>
            <Btn kind="accent" height={32} padX={14} fontSize={13} disabled={send.isPending} onClick={() => send.mutate(data.accountEmail)}>
              {send.isPending ? '…' : t('shell.verifyEmail.send', { email: data.accountEmail })}
            </Btn>
            <Btn height={32} padX={14} fontSize={13} onClick={openSettings}>
              {t('shell.verifyEmail.other')}
            </Btn>
          </>
        ) : (
          <Btn kind="accent" height={32} padX={14} fontSize={13} onClick={openSettings}>
            {t('shell.verifyEmail.add')}
          </Btn>
        )}
        <button type="button" onClick={dismiss} aria-label={t('common.close')} style={st('width:30px;height:30px;border:none;border-radius:50%;background:transparent;color:var(--accText);font-size:18px;line-height:1')}>
          ×
        </button>
      </span>
    </div>
  );
}
