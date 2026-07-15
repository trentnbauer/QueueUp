import { Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { authApi } from './api/auth';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { OnboardingModal } from './components/OnboardingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { ShelfView } from './views/ShelfView';
import { RoomView } from './views/RoomView';
import { SettingsView } from './views/SettingsView';

const ONBOARDED_KEY = 'sq-onboarded';

const PROVIDER_LABEL: Record<string, string> = {
  oidc: 'Sign in',
  google: 'Sign in with Google',
  discord: 'Sign in with Discord',
  steam: 'Sign in with Steam',
};

function LoginButton({ provider }: { provider: string }) {
  return (
    <a
      href={authApi.loginUrl(provider)}
      style={{
        padding: '12px 28px',
        borderRadius: 'var(--sq-radius)',
        background: 'var(--sq-accent)',
        color: '#fff',
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      {PROVIDER_LABEL[provider] ?? `Sign in with ${provider}`}
    </a>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!user) authApi.providers().then(({ providers }) => setProviders(providers));
  }, [user]);

  useEffect(() => {
    if (user && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
  }, [user]);

  function handleOnboardingDone() {
    localStorage.setItem(ONBOARDED_KEY, 'true');
    setShowOnboarding(false);
  }

  if (loading) return null;

  if (!user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <div style={{ fontFamily: 'var(--sq-header-font)', fontWeight: 700, fontSize: 28 }}>SquadQueue</div>
        <p style={{ color: 'var(--sq-muted)', margin: 0 }}>Games the squad wants to play together</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {providers === null ? null : providers.length > 0 ? (
            providers.map((p) => <LoginButton key={p} provider={p} />)
          ) : (
            <LoginButton provider="dev" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--sq-bg)' }}>
      <Header />
      <Routes>
        <Route path="/" element={<ShelfView />} />
        <Route path="/room/:roomId" element={<RoomView />} />
        <Route path="/settings" element={<SettingsView />} />
      </Routes>
      <Footer />
      {showOnboarding && <OnboardingModal onDone={handleOnboardingDone} />}
      <ChangelogModal />
    </div>
  );
}
