import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { analyticsConsentApi, ANALYTICS_CONSENT_QUERY_KEY } from '../api/analyticsConsent';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useT } from '../i18n';
import { fetchAnalyticsId, getAnalyticsConsent, setAnalyticsConsent, type AnalyticsConsent } from '../utils/analytics';

/** Whether this server has Google Analytics set up (so the consent question applies at all), and
 * the person's answer to it. The answer is kept on their account (and mirrored in this browser so
 * analytics can start before anything loads), so a cleared browser or a new device already knows it. */
export function useAnalyticsConsent(): { available: boolean; consent: AnalyticsConsent; setConsent: (granted: boolean) => void } {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: id } = useQuery({ queryKey: ['analytics-config'], queryFn: fetchAnalyticsId, staleTime: Infinity });
  const { data: stored } = useQuery({ queryKey: ANALYTICS_CONSENT_QUERY_KEY, queryFn: analyticsConsentApi.get, enabled: !!user });
  const [local, setLocal] = useState<AnalyticsConsent>(getAnalyticsConsent);
  return {
    available: !!id,
    // The account's answer wins; the browser's covers signed-out use and the moment before it loads.
    consent: stored?.consent ?? local,
    setConsent: (granted) => {
      setLocal(granted ? 'granted' : 'denied');
      void setAnalyticsConsent(granted);
      if (user) {
        void analyticsConsentApi
          .set(granted)
          .then((res) => queryClient.setQueryData(ANALYTICS_CONSENT_QUERY_KEY, res))
          .catch(() => undefined);
      }
    },
  };
}

/** Keeps analytics in step with the account's answer, and asks when there is none. Mount once near the
 * app root. The answer has three states: allowed, denied, or not answered yet. With no answer anywhere
 * (and analytics set up on this server), a toast asks; an answer already given in this browser before
 * answers were kept on the account is adopted rather than asked again. `suppressToast` holds the ask
 * back while onboarding is on screen, since it asks the same question itself. */
export function useAnalyticsConsentSync(suppressToast: boolean): void {
  const { user } = useAuth();
  const t = useT();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data: id } = useQuery({ queryKey: ['analytics-config'], queryFn: fetchAnalyticsId, staleTime: Infinity });
  const { data: stored } = useQuery({ queryKey: ANALYTICS_CONSENT_QUERY_KEY, queryFn: analyticsConsentApi.get, enabled: !!user });
  const asked = useRef(false);

  useEffect(() => {
    if (!user || !stored) return;
    const local = getAnalyticsConsent();
    const save = async (granted: boolean) => {
      await setAnalyticsConsent(granted);
      queryClient.setQueryData(ANALYTICS_CONSENT_QUERY_KEY, await analyticsConsentApi.set(granted));
    };

    if (stored.consent) {
      // The account's answer rules: bring this browser in line (starts or stops analytics).
      if (stored.consent !== local) void setAnalyticsConsent(stored.consent === 'granted');
      return;
    }
    if (local) {
      // Answered here before answers were kept on the account: keep it there from now on.
      void analyticsConsentApi.set(local === 'granted').then((res) => queryClient.setQueryData(ANALYTICS_CONSENT_QUERY_KEY, res)).catch(() => undefined);
      return;
    }
    if (!id || suppressToast || asked.current) return;
    asked.current = true;
    showToast({
      id: 'analytics-consent',
      message: t('settings.analytics.toast'),
      actions: [
        { label: t('settings.analytics.toastAllow'), onClick: () => save(true) },
        { label: t('settings.analytics.toastDeny'), onClick: () => save(false) },
      ],
    });
  }, [user, stored, id, suppressToast, showToast, t, queryClient]);
}
