import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { I18nProvider } from './i18n';
import { AuthProvider } from './context/AuthContext';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { CurrencyRegionProvider } from './context/CurrencyRegionContext';
import { CardDensityProvider } from './context/CardDensityContext';
import { ViewModeProvider } from './context/ViewModeContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { AchievementUnlockProvider } from './context/AchievementUnlockContext';
import { ToastProvider } from './context/ToastContext';
import { UiProvider } from './context/UiContext';
import { getBasePath } from './utils/basePath';
import { applyAccent, applyThemeMode, getAccent, getPreferredThemeMode } from './theme/applyThemeMode';
import './theme/global.css';

// Applied synchronously, before the first render, so the page never flashes the wrong theme.
applyThemeMode(getPreferredThemeMode());
applyAccent(getAccent());

// Polling (notifications, shared spins, import progress) stops while the tab is hidden and picks
// back up on return. This is TanStack Query's default; it's set here so no hook quietly opts out.
// staleTime: switching back to the tab doesn't refetch everything that was fetched in the last 30s
// (the games list alone can be thousands of rows); polled queries and mutations still refresh.
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchIntervalInBackground: false, staleTime: 30_000 } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={getBasePath()}>
        <I18nProvider>
        <AuthProvider>
          <ThemeModeProvider>
            <CurrencyRegionProvider>
              <CardDensityProvider>
                <ViewModeProvider>
                  <UiProvider>
                    <ConfirmProvider>
                      <AchievementUnlockProvider>
                        <ToastProvider>
                          <App />
                        </ToastProvider>
                      </AchievementUnlockProvider>
                    </ConfirmProvider>
                  </UiProvider>
                </ViewModeProvider>
              </CardDensityProvider>
            </CurrencyRegionProvider>
          </ThemeModeProvider>
        </AuthProvider>
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
