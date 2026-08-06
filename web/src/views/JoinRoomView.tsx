import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useRooms } from '../hooks/useRooms';
import { ActionErrorBanner } from '../components/ActionErrorBanner';

/**
 * Landing page for a shareable invite link (`/join/:inviteCode`). By the time this route
 * renders, the user is guaranteed to be signed in (App only mounts these Routes once
 * `user` is set) - the not-signed-in case is handled in App.tsx by stashing the code in
 * sessionStorage and completing the join right after the auth redirect lands.
 */
export function JoinRoomView() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { joinRoom } = useRooms();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!inviteCode || attempted.current) return;
    attempted.current = true;

    joinRoom
      .mutateAsync({ inviteCode })
      .then(({ room }) => navigate(`/room/${room.id}`, { replace: true }))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'This invite link is invalid or has expired.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteCode]);

  return (
    <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 16px' }}>
      <ActionErrorBanner message={error} onDismiss={() => setError(null)} />
      {!error && <p style={{ color: 'var(--qu-muted)' }}>Joining room…</p>}
      {error && (
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            marginTop: 12,
            padding: '10px 20px',
            borderRadius: 'var(--qu-radius)',
            border: '1px solid var(--qu-border)',
            background: 'transparent',
            color: 'var(--qu-text)',
            cursor: 'pointer',
          }}
        >
          Back to your shelf
        </button>
      )}
    </div>
  );
}
