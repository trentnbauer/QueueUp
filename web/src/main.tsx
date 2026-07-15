import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ViewProvider } from './context/ViewContext';
import { ThemeProvider } from './context/ThemeContext';
import { CurrencyRegionProvider } from './context/CurrencyRegionContext';
import { ConfirmProvider } from './context/ConfirmContext';
import './theme/global.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ViewProvider>
            <ThemeProvider>
              <CurrencyRegionProvider>
                <ConfirmProvider>
                  <App />
                </ConfirmProvider>
              </CurrencyRegionProvider>
            </ThemeProvider>
          </ViewProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
