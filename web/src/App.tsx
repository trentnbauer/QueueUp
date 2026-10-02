import { Navigate, Routes, Route, useLocation, useNavigate, useParams } from 'react-router';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './context/AuthContext';
import { authApi } from './api/auth';
import { friendsApi } from './api/friends';
import { useRooms } from './hooks/useRooms';
import { useActionableNotificationToasts } from './hooks/useActionableNotificationToasts';
import { useActiveRoomSpinToasts } from './hooks/useActiveRoomSpinToasts';
import { usePlayniteSyncToasts } from './hooks/usePlayniteSyncToasts';
import { ScopeProvider } from './context/ScopeContext';
import { SteamImportProvider } from './context/SteamImportContext';
import { useUi } from './context/UiContext';
import { HomeView } from './home/HomeView';
import { AdminPage } from './pages/AdminPage';
import { JoinPage, LoginPage, PublicProfilePage } from './pages/EntryPages';
import { ActivityPage } from './pages/FriendPages';
import { AchievementsPage, InsightsPage, YearPage } from './pages/InsightPages';
import { AppShell } from './shell/AppShell';
import { Onboarding } from './shell/Onboarding';

const ONBOARDED_KEY = 'sq-onboarded';
// Invite links (`/join/:inviteCode`) need to survive a full-page OAuth sign-in/callback round trip,
// which drops the URL back at APP_BASE_URL with no way to carry a query param through the redirect.
// Stashing the code in sessionStorage lets us pick it back up and finish the join automatically once
// the user lands back in the app authenticated.
const PENDING_INVITE_KEY = 'sq-pending-invite';
// Same idea for friend links (`/add/:friendCode`).
const PENDING_FRIEND_KEY = 'sq-pending-friend';

function JoinRoute() {
  const { inviteCode = '' } = useParams();
  return <JoinPage code={inviteCode} />;
}

/** `/add/:code` while signed in: using someone's friend link makes you friends straight away. */
function AddFriendRoute() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const ui = useUi();
  const queryClient = useQueryClient();
  const attempted = useRef(false);
  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    friendsApi
      .sendRequest({ code })
      .then((res) => ui.notify(res.accepted ? `You and ${res.user.displayName} are friends` : `Request sent to ${res.user.displayName}`))
      .catch((err) => ui.showError(err instanceof Error ? err.message : 'That friend link is invalid or has expired.'))
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ['friends'] });
        navigate('/', { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  return null;
}

function FriendRedirect() {
  const { userId = '' } = useParams();
  return <Navigate to={`/u/${userId}`} replace />;
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const ui = useUi();
  const { joinRoom } = useRooms();
  useActionableNotificationToasts();
  useActiveRoomSpinToasts();
  usePlayniteSyncToasts();
  const [providers, setProviders] = useState<string[] | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const completingPendingJoin = useRef(false);

  // Linking a provider account ends in a full-page redirect back here with the outcome in the query
  // string. Surface any error, then strip the params so they don't linger or re-fire.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const error = params.get('accountLinkError');
    const linked = params.get('accountLinked');
    if (!error && !linked) return;
    if (error) ui.showError(error);
    params.delete('accountLinkError');
    params.delete('accountLinked');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user)
      authApi.providers().then(({ providers, turnstileSiteKey }) => {
        setProviders(providers);
        setTurnstileSiteKey(turnstileSiteKey);
      });
  }, [user]);

  useEffect(() => {
    try {
      if (user && !localStorage.getItem(ONBOARDED_KEY)) setShowOnboarding(true);
    } catch {
      /* storage unavailable: skip onboarding */
    }
  }, [user]);

  // Capture an invite code from a shared `/join/:inviteCode` link before the sign-in gate can swallow it.
  useEffect(() => {
    if (user) return;
    const match = location.pathname.match(/^\/join\/([^/]+)$/);
    if (match) sessionStorage.setItem(PENDING_INVITE_KEY, decodeURIComponent(match[1]));
  }, [location.pathname, user]);

  // Same for a shared `/add/:friendCode` link: stash it, and AddFriendRoute finishes it after sign-in.
  useEffect(() => {
    if (user) return;
    const match = location.pathname.match(/^\/add\/([^/]+)$/);
    if (match) sessionStorage.setItem(PENDING_FRIEND_KEY, decodeURIComponent(match[1]));
  }, [location.pathname, user]);

  // Once signed in, finish a friend link stashed above (right after the OAuth callback redirect).
  useEffect(() => {
    if (!user || location.pathname.startsWith('/add/')) return;
    const pendingCode = sessionStorage.getItem(PENDING_FRIEND_KEY);
    if (!pendingCode) return;
    sessionStorage.removeItem(PENDING_FRIEND_KEY);
    navigate(`/add/${encodeURIComponent(pendingCode)}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname]);

  // Once signed in, finish any join that was stashed above (right after the OAuth callback redirect).
  // Visiting /join/:inviteCode directly while signed in is handled by JoinPage instead.
  useEffect(() => {
    if (!user || completingPendingJoin.current) return;
    const pendingCode = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (!pendingCode || location.pathname.startsWith('/join/')) return;

    completingPendingJoin.current = true;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    joinRoom
      .mutateAsync({ inviteCode: pendingCode })
      .then(({ room }) => {
        navigate(`/room/${room.id}`, { replace: true });
        ui.notify(`Joined ${room.name}`);
      })
      .catch((err) => ui.showError(err instanceof Error ? err.message : 'This invite link is invalid or has expired.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, location.pathname]);

  function finishOnboarding() {
    try {
      localStorage.setItem(ONBOARDED_KEY, 'true');
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  }

  if (loading) return null;

  // Reachable regardless of sign-in state: checked before the sign-in gate, outside the app shell.
  const publicMatch = location.pathname.match(/^\/u\/([^/]+)$/);
  if (publicMatch) return <PublicProfilePage userId={decodeURIComponent(publicMatch[1])} signedIn={!!user} />;

  if (!user) return <LoginPage providers={providers} turnstileSiteKey={turnstileSiteKey} />;

  return (
    <SteamImportProvider>
      <ScopeProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/room/:roomId" element={<HomeView />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="/friends/:userId" element={<FriendRedirect />} />
            <Route path="/insights" element={<InsightsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/year" element={<YearPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/join/:inviteCode" element={<JoinRoute />} />
            <Route path="/add/:code" element={<AddFriendRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
        {showOnboarding && <Onboarding onDone={finishOnboarding} />}
      </ScopeProvider>
    </SteamImportProvider>
  );
}
