import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ViewProvider } from './context/ViewContext';
import { GameFilterProvider } from './context/GameFilterContext';
import { ThemeProvider } from './context/ThemeContext';
import { ThemeModeProvider } from './context/ThemeModeContext';
import { CurrencyRegionProvider } from './context/CurrencyRegionContext';
import { CardDensityProvider } from './context/CardDensityContext';
import { ViewModeProvider } from './context/ViewModeContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { AchievementUnlockProvider } from './context/AchievementUnlockContext';
import { ToastProvider } from './context/ToastContext';
import { getBasePath } from './utils/basePath';
import { applyThemeMode, getPreferredThemeMode } from './theme/applyThemeMode';
import './theme/global.css';

// Applied synchronously, before the first render, so the page never flashes the wrong theme.
applyThemeMode(getPreferredThemeMode());

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={getBasePath()}>
        <AuthProvider>
          <ViewProvider>
            <GameFilterProvider>
              <ThemeModeProvider>
                <ThemeProvider>
                  <CurrencyRegionProvider>
                    <CardDensityProvider>
                      <ViewModeProvider>
                        <ConfirmProvider>
                          <AchievementUnlockProvider>
                            <ToastProvider>
                              <App />
                            </ToastProvider>
                          </AchievementUnlockProvider>
                        </ConfirmProvider>
                      </ViewModeProvider>
                    </CardDensityProvider>
                  </CurrencyRegionProvider>
                </ThemeProvider>
              </ThemeModeProvider>
            </GameFilterProvider>
          </ViewProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
