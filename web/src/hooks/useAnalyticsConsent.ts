import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsId, getAnalyticsConsent, setAnalyticsConsent, type AnalyticsConsent } from '../utils/analytics';

/** Whether this server has Google Analytics set up (so the consent question applies at all), and
 * this browser's answer to it. */
export function useAnalyticsConsent(): { available: boolean; consent: AnalyticsConsent; setConsent: (granted: boolean) => void } {
  const { data: id } = useQuery({ queryKey: ['analytics-config'], queryFn: fetchAnalyticsId, staleTime: Infinity });
  const [consent, setLocal] = useState<AnalyticsConsent>(getAnalyticsConsent);
  return {
    available: !!id,
    consent,
    setConsent: (granted) => {
      setLocal(granted ? 'granted' : 'denied');
      void setAnalyticsConsent(granted);
    },
  };
}
