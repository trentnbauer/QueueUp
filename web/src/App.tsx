import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { authApi } from './api/auth';
import { useRooms } from './hooks/useRooms';
import { ActionErrorBanner } from './components/ActionErrorBanner';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { OnboardingModal } from './components/OnboardingModal';
import { ChangelogModal } from './components/ChangelogModal';
import { SteamImportProvider } from './context/SteamImportContext';
import { ShelfView } from './views/ShelfView';
import { RoomView } from './views/RoomView';
import { SettingsView } from './views/SettingsView';
import { ProfileSettingsView } from './views/ProfileSettingsView';
import { JoinRoomView } from './views/JoinRoomView';

const ONBOARDED_KEY = 'sq-onboarded';
// Invite links (`/join/:inviteCode`) need to survive a full-page OAuth sign-in/callback
// round trip, which drops the URL back at APP_BASE_URL with no way to carry a query param
// through the redirect. Stashing the code in sessionStorage lets us pick it back up and
// finish the join automatically once the user lands back in the app authenticated.
const PENDING_INVITE_KEY = 'sq-pending-invite';

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
        borderRadius: 'var(--qu-radius)',
        background: 'var(--qu-accent)',
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
  const location = useLocation();
  const navigate = useNavigate();
  const { joinRoom } = useRooms();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingJoinError, setPendingJoinError] = useState<string | null>(null);
  const [accountLinkError, setAccountLinkError] = useState<string | null>(null);
  const completingPendingJoin = useRef(false);

  // Linking a provider account (see ProfileSettingsView / SteamImportCard / server
  // /auth/:provider/link) ends in a full-page redirect back here with the outcome in the query
  // string, since a redirect flow has no other channel back to the UI. Surface any error, then
  // strip the params so they don't linger in the URL or re-fire on a later remount - the success
  // case needs nothing further here, since this redirect is a fresh page load and AuthContext's own
  // mount-time fetch already picks up the newly-linked provider.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('accountLinkError');
    const linked = params.get('accountLinked');
    if (!error && !linked) return;
    if (error) setAccountLinkError(error);
    params.delete('accountLinkError');
    params.delete('accountLinked');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) authApi.providers().then(({ providers }) => setProviders(providers));
  }, [user]);

  useEffect(() => {
    if (user && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
  }, [user]);

  // Capture an invite code from a shared `/join/:inviteCode` link before the sign-in gate
  // below can swallow it. If the user isn't signed in yet, this is the only chance we get to
  // remember which room they meant to join.
  useEffect(() => {
    if (user) return;
    const match = location.pathname.match(/^\/join\/([^/]+)$/);
    if (match) sessionStorage.setItem(PENDING_INVITE_KEY, decodeURIComponent(match[1]));
  }, [location.pathname, user]);

  // Once signed in, finish any join that was stashed above (this is what runs right after the
  // OAuth callback redirects back to APP_BASE_URL). Visiting /join/:inviteCode directly while
  // already signed in is instead handled by JoinRoomView, so skip that case here.
  useEffect(() => {
    if (!user || completingPendingJoin.current) return;
    const pendingCode = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!pendingCode || location.pathname.startsWith('/join/')) return;

    completingPendingJoin.current = true;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    joinRoom
      .mutateAsync({ inviteCode: pendingCode })
      .then(({ room }) => navigate(`/room/${room.id}`, { replace: true }))
      .catch((err) => {
        setPendingJoinError(err instanceof Error ? err.message : 'This invite link is invalid or has expired.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname]);

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
        <div style={{ fontFamily: 'var(--qu-header-font)', fontWeight: 700, fontSize: 28 }}>QueueUp</div>
        <p style={{ color: 'var(--qu-muted)', margin: 0 }}>Games the squad wants to play together</p>
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

  const hideRoomHeader = location.pathname === '/settings' || location.pathname === '/profile';

  return (
    <SteamImportProvider>
      <div style={{ minHeight: '100vh', background: 'var(--qu-bg)', display: 'flex' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {!hideRoomHeader && <Header />}
          <ActionErrorBanner message={pendingJoinError} onDismiss={() => setPendingJoinError(null)} />
          <ActionErrorBanner message={accountLinkError} onDismiss={() => setAccountLinkError(null)} />
          <div style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<ShelfView />} />
              <Route path="/room/:roomId" element={<RoomView />} />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="/profile" element={<ProfileSettingsView />} />
              <Route path="/join/:inviteCode" element={<JoinRoomView />} />
            </Routes>
          </div>
          <Footer />
        </div>
        {showOnboarding && <OnboardingModal onDone={handleOnboardingDone} />}
        <ChangelogModal />
      </div>
    </SteamImportProvider>
  );
}
