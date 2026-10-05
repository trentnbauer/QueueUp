import { apiGet, apiPut } from './client';

export type AnalyticsConsentAnswer = 'granted' | 'denied';

export const ANALYTICS_CONSENT_QUERY_KEY = ['analytics-consent'] as const;

/** The "share usage stats?" answer kept on the account (null = never answered). */
export const analyticsConsentApi = {
  get: () => apiGet<{ consent: AnalyticsConsentAnswer | null }>('/api/me/analytics-consent'),
  set: (granted: boolean) => apiPut<{ consent: AnalyticsConsentAnswer }>('/api/me/analytics-consent', { consent: granted ? 'granted' : 'denied' }),
};
