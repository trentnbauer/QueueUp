import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DISCORD_EVENT_KEYS,
  DISCORD_EVENT_LABELS,
  ROOM_PLATFORM_LABELS,
  SPIN_WHEEL_THEMES,
  SPIN_WHEEL_THEME_HINTS,
  SPIN_WHEEL_THEME_LABELS,
  resolveDiscordEvents,
  type DiscordEventKey,
  type RoomPlatform,
  type RoomRole,
} from '@queueup/shared';
import { gameSuggestionsApi, roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useFriends } from '../hooks/useFriends';
import { useRooms } from '../hooks/useRooms';
import { computeRoomYearInReview } from '../components/roomYearInReview';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, ChipToggle, Cover, Group, Segmented, Toggle, initialsOf, inputField, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';

const PLATFORMS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
// The design's six room colours, as hex (room colours also feed Discord and other non-CSS-colour
// consumers, so they're stored as hex rather than the design's oklch strings).
/** Small mono heading for each row of Spin defaults. */
const DEFAULT_LABEL = 'font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--faint);margin-top:2px';

const ROOM_COLORS = ['#c0693c', '#2e8a63', '#5a73c4', '#b05a9c', '#3b86a3', '#6c9136'];
const LABEL = 'font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)';
const ROW = 'display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 16px;background:var(--surf);color:var(--text);text-align:left;border:none;width:100%';

function pickColor(existing: { accentColor: string }[]): string {
  const used = new Set(existing.map((r) => r.accentColor));
  const free = ROOM_COLORS.filter((c) => !used.has(c));
  const pool = free.length ? free : ROOM_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      <span style={st(LABEL)}>{label}</span>
      {children}
    </div>
  );
}

const TITLES = { options: 'Add a room', create: 'Create a room', join: 'Join a room', browse: 'Public rooms' } as const;

/** Create / join (code or link) / browse public rooms. */
export function AddRoomDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const { rooms, createRoom, joinRoom, joinPublicRoom } = useRooms();
  const step = ui.dialogs.addRoom?.step ?? 'options';
  const setStep = (s: keyof typeof TITLES) => ui.openDialog('addRoom', { step: s });
  const close = () => ui.closeDialog('addRoom');

  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<RoomPlatform | null>('pc');
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const publicRooms = useQuery({ queryKey: ['public-rooms'], queryFn: () => roomsApi.publicRooms(), enabled: step === 'browse' });
  const mine = new Set(rooms.map((r) => r.id));
  const browse = (publicRooms.data?.rooms ?? []).filter((r) => !mine.has(r.id));

  async function create() {
    if (!name.trim()) return;
    setBusy('create');
    setError(null);
    try {
      const { room } = await createRoom.mutateAsync({ name: name.trim(), platform, accentColor: pickColor(rooms), isPublic });
      close();
      navigate(`/room/${room.id}`);
      ui.notify(`${room.name} created`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that room');
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    const t = code.trim();
    if (!t) return;
    setBusy('join');
    setError(null);
    try {
      const m = t.match(/\/join\/([^/?#]+)/);
      const { room } = await joinRoom.mutateAsync({ inviteCode: m ? decodeURIComponent(m[1]) : t });
      close();
      navigate(`/room/${room.id}`);
      ui.notify(`Joined ${room.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join with that invite code');
    } finally {
      setBusy(null);
    }
  }

  async function joinPublic(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { room } = await joinPublicRoom.mutateAsync(id);
      close();
      navigate(`/room/${room.id}`);
      ui.notify(`Joined ${room.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that room');
    } finally {
      setBusy(null);
    }
  }

  const platOpts: { v: RoomPlatform | null; l: string }[] = [{ v: null, l: 'Any platform' }, ...PLATFORMS.map((p) => ({ v: p, l: ROOM_PLATFORM_LABELS[p] }))];

  return (
    <Dialog onClose={close} title={TITLES[step]} onBack={step === 'options' ? undefined : () => { setError(null); setStep('options'); }}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {step === 'options' && (
        <Group>
          {(
            [
              ['create', 'Create a new room', 'Pick a name and a platform'],
              ['join', 'Join with invite code', 'Paste a code or link from a friend'],
              ['browse', 'Browse public rooms', 'Open rooms on this server'],
            ] as const
          ).map(([k, l, sub]) => (
            <button key={k} type="button" onClick={() => setStep(k)} style={st(ROW)} className="hv-surf2">
              <span style={st('flex:1;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{l}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{sub}</span>
              </span>
              <span style={st('color:var(--muted);font-size:20px')}>›</span>
            </button>
          ))}
        </Group>
      )}
      {step === 'create' && (
        <>
          <Field label="ROOM NAME">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday Night Co-op" aria-label="Room name" autoFocus style={st(inputField, { height: 48, borderRadius: 14, background: 'var(--surf)', fontSize: 16 })} />
          </Field>
          <Field label="PLATFORM">
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {platOpts.map((p) => (
                <ChipToggle key={p.l} on={platform === p.v} height={36} onClick={() => setPlatform(p.v)}>
                  {p.l}
                </ChipToggle>
              ))}
            </div>
          </Field>
          <Field label="VISIBILITY">
            <Segmented
              columns={2}
              value={isPublic ? 'public' : 'invite'}
              onChange={(v) => setIsPublic(v === 'public')}
              options={[
                { value: 'invite', label: 'Invite only' },
                { value: 'public', label: 'Public' },
              ]}
            />
          </Field>
          <Btn kind="accent" height={50} fontSize={15} weight={700} disabled={!name.trim() || busy === 'create'} onClick={create}>
            {busy === 'create' ? 'Creating…' : 'Create room'}
          </Btn>
        </>
      )}
      {step === 'join' && (
        <>
          <Field label="INVITE CODE OR LINK">
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-123 or https://…/join/…" aria-label="Invite code or link" autoFocus style={st(inputField, { height: 48, borderRadius: 14, background: 'var(--surf)', fontSize: 16 })} />
          </Field>
          <Btn kind="accent" height={50} fontSize={15} weight={700} disabled={!code.trim() || busy === 'join'} onClick={join}>
            {busy === 'join' ? 'Joining…' : 'Join room'}
          </Btn>
        </>
      )}
      {step === 'browse' && (
        <Group>
          {publicRooms.isLoading && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>Loading public rooms…</div>}
          {browse.map((r) => (
            <div key={r.id} style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 12px 10px 14px;background:var(--surf)')}>
              <span style={st(`width:36px;height:36px;flex-shrink:0;border-radius:12px;background:${r.accentColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11px var(--font-mono)`)}>{initialsOf(r.name)}</span>
              <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{r.name}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                  {r.platform ? ROOM_PLATFORM_LABELS[r.platform] : 'Any platform'} · {r.memberCount} member{r.memberCount === 1 ? '' : 's'}
                </span>
              </div>
              <Btn kind="soft" height={36} padX={16} fontSize={13} disabled={busy === r.id} onClick={() => joinPublic(r.id)}>
                {busy === r.id ? 'Joining…' : 'Join'}
              </Btn>
            </div>
          ))}
          {!publicRooms.isLoading && browse.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>No public rooms left to join.</div>}
        </Group>
      )}
    </Dialog>
  );
}

type FriendsApi = ReturnType<typeof useFriends>;

/** Per-member friend state in the member list: already a friend, request sent, request waiting on
 * you, or a button to send one. */
export function FriendStatus({ userId, name, friends, notify, onError }: { userId: string; name: string; friends: FriendsApi; notify: (m: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  // Flip to "Request sent" right away instead of waiting for the friends list to refetch.
  const [sent, setSent] = useState(false);
  const chip = 'height:28px;padding:0 10px;border-radius:999px;display:flex;align-items:center;font:600 12px var(--font-ui);white-space:nowrap';
  if (friends.friends.some((f) => f.id === userId)) {
    return <span style={st(`${chip};background:var(--mintSoft);color:var(--mint)`)}>✓ Friend</span>;
  }
  if (sent || friends.outgoing.some((r) => r.user.id === userId)) {
    return <span style={st(`${chip};background:var(--chip);color:var(--muted)`)}>Request sent</span>;
  }
  const incoming = friends.incoming.find((r) => r.user.id === userId);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      notify(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }
  if (incoming) {
    return (
      <Btn kind="soft" height={28} padX={10} fontSize={12} disabled={busy} onClick={() => run(() => friends.accept(incoming.id), `You and ${name} are friends`)}>
        Accept request
      </Btn>
    );
  }
  return (
    <Btn kind="soft" height={28} padX={10} fontSize={12} disabled={busy} onClick={() => run(async () => {
        await friends.sendRequestToUser(userId);
        setSent(true);
      }, `Friend request sent to ${name}`)}>
      Add friend
    </Btn>
  );
}

const ROLE_LABEL: Record<RoomRole, string> = { room_master: 'Room Master', moderator: 'Moderator', member: 'Member' };
const MEMBER_PREVIEW = 6;

function Switch({ title, sub, on, onChange }: { title: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={st('display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 14px 8px 16px;border-radius:14px;background:var(--surf)')}>
      <span style={st('flex:1;display:flex;flex-direction:column;gap:1px')}>
        <span style={st('font:500 14.5px var(--font-ui)')}>{title}</span>
        <span style={st('font:400 12px/1.4 var(--font-ui);color:var(--muted)')}>{sub}</span>
      </span>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  );
}

/** Everything about the room in focus: invite, suggestions, members, details, Discord, export,
 * year in review, activity, leave/delete. Most switches save straight away. */
export function RoomSettingsDialog() {
  const scope = useScope();
  const ui = useUi();
  const { user } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { room, members, games, canManage, suggestions } = scope;
  const canInvite = canManage || room?.invitePermission === 'members';
  const friends = useFriends();

  const [name, setName] = useState(room?.name ?? '');
  const [hook, setHook] = useState(room?.discordWebhookUrl ?? '');
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [memberQ, setMemberQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [showYear, setShowYear] = useState(false);
  const [showAct, setShowAct] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const roomId = room?.id ?? '';
  const isMaster = room?.myRole === 'room_master';

  const candidates = useQuery({ queryKey: ['room-invite-candidates', roomId], queryFn: () => roomsApi.inviteCandidates(roomId), enabled: !!room && canInvite });
  const activity = useInfiniteQuery({
    queryKey: ['room-activity', roomId],
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => roomsApi.activity(roomId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: showAct && !!room,
  });
  const year = useMemo(() => computeRoomYearInReview(games), [games]);

  const approve = useMutation({
    mutationFn: (id: string) => gameSuggestionsApi.approve(roomId, id),
    onSuccess: () => refreshSuggestions(),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not approve that suggestion'),
  });
  const decline = useMutation({
    mutationFn: (id: string) => gameSuggestionsApi.decline(roomId, id),
    onSuccess: () => refreshSuggestions(),
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not decline that suggestion'),
  });

  if (!room) return null;
  const close = () => ui.closeDialog('roomSettings');

  function refreshSuggestions() {
    queryClient.invalidateQueries({ queryKey: ['room-suggestions', roomId] });
    queryClient.invalidateQueries({ queryKey: ['games', 'room', roomId] });
    queryClient.invalidateQueries({ queryKey: ['attention'] });
  }
  const refreshRoom = () => {
    queryClient.invalidateQueries({ queryKey: ['rooms'] });
    queryClient.invalidateQueries({ queryKey: ['room-members', roomId] });
    queryClient.invalidateQueries({ queryKey: ['room-invite-candidates', roomId] });
  };

  async function patch(body: Parameters<typeof roomsApi.update>[1], toast?: string) {
    setError(null);
    try {
      await roomsApi.update(roomId, body);
      refreshRoom();
      if (toast) ui.notify(toast);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save room settings');
    }
  }

  const invite = inviteCode ?? room.inviteCode ?? null;
  const inviteUrl = invite ? `${window.location.origin}${getBasePath()}/join/${invite}` : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    ui.notify('Invite link copied');
  }

  async function regen() {
    const ok = await confirm({ title: 'Generate a new code?', message: 'The old invite link stops working straight away.', confirmLabel: 'Generate' });
    if (!ok) return;
    try {
      const { inviteCode: next } = await roomsApi.regenerateInvite(roomId);
      setInviteCode(next);
      refreshRoom();
      ui.notify('New invite code generated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate a new code');
    }
  }

  async function setRole(userId: string, displayName: string, role: RoomRole) {
    if (role === 'room_master') {
      const ok = await confirm({
        title: 'Transfer Room Master?',
        message: `${displayName} will become the new Room Master. You'll be moved to Moderator.`,
        confirmLabel: 'Transfer',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await roomsApi.setRole(roomId, userId, role);
      refreshRoom();
      ui.notify(role === 'room_master' ? `${displayName} is the new Room Master` : `${displayName} is now ${ROLE_LABEL[role]}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update that member's role");
    }
  }

  async function removeMember(userId: string, displayName: string) {
    const ok = await confirm({ title: 'Remove this member?', message: `${displayName} will be removed from ${room!.name}.`, confirmLabel: 'Remove', danger: true });
    if (!ok) return;
    try {
      await roomsApi.removeMember(roomId, userId);
      refreshRoom();
      ui.notify(`${displayName} removed`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove that member');
    }
  }

  async function addMember(userId: string, displayName: string) {
    try {
      await roomsApi.addMember(roomId, userId);
      refreshRoom();
      ui.notify(`${displayName} added`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add that member');
    }
  }

  async function leave() {
    const ok = await confirm({ title: 'Leave this room?', message: `You'll lose access to ${room!.name}. You can rejoin with an invite.`, confirmLabel: 'Leave room', danger: true });
    if (!ok || !user) return;
    try {
      await roomsApi.removeMember(roomId, user.id);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      close();
      navigate('/');
      ui.notify(`Left ${room!.name}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not leave this room');
    }
  }

  async function del() {
    const ok = await confirm({
      title: 'Delete this room?',
      message: `${room!.name} and all its games, votes, and membership will be permanently deleted. This can't be undone.`,
      confirmLabel: 'Delete room',
      danger: true,
      typedConfirmation: room!.name,
    });
    if (!ok) return;
    try {
      await roomsApi.delete(roomId);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      close();
      navigate('/');
      ui.notify('Room deleted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete this room');
    }
  }

  const q = memberQ.trim().toLowerCase();
  const filtered = members.filter((m) => !q || m.user.displayName.toLowerCase().includes(q));
  const shown = q || showAll ? filtered : filtered.slice(0, MEMBER_PREVIEW);
  const events = resolveDiscordEvents(room.discordEvents);
  const hasHook = !!room.discordWebhookUrl;
  const hookValid = !hook.trim() || /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(hook.trim());
  const entries = activity.data?.pages.flatMap((p) => p.entries) ?? [];
  const topGenre = year.genreSpread[0]?.genre ?? '—';
  const spinMax = room.spinOwnershipMaxPrice;
  const spinDefaults = room.spinDefaults ?? {};

  return (
    <Dialog
      onClose={close}
      height="tall"
      gap={24}
      header={
        <>
          <span style={st(`width:40px;height:40px;flex-shrink:0;border-radius:14px;background:${room.accentColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px var(--font-mono)`)}>{initialsOf(room.name)}</span>
          <div style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
            <span style={st('font:700 20px var(--font-display);letter-spacing:-0.02em')}>Room settings</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>You're {ROLE_LABEL[room.myRole]}</span>
          </div>
        </>
      }
    >
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

      {canInvite && (
      <Field label="INVITE">
        <div style={st('display:flex;align-items:center;gap:10px;padding:10px 10px 10px 16px;border-radius:16px;background:var(--surf)')}>
          <span style={st('flex:1;min-width:0;font:600 17px var(--font-mono);letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{invite ?? '—'}</span>
          <Btn kind="text" height={36} padX={14} fontSize={13} weight={700} disabled={!inviteUrl} onClick={copyInvite}>
            Copy link
          </Btn>
        </div>
        {canManage && (
          <button type="button" onClick={regen} style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}>
            Generate a new code
          </button>
        )}
      </Field>
      )}

      {canManage && suggestions.length > 0 && (
        <Field label={`SUGGESTED GAMES · ${suggestions.length}`}>
          <Group>
            {suggestions.map((s) => (
              <div key={s.id} style={st('display:flex;align-items:center;gap:10px;min-height:60px;padding:8px 10px 8px 12px;background:var(--surf)')}>
                <Cover title={s.title} url={s.coverImageUrl} width={32} radius={6} />
                <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{s.title}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>from {s.suggestedBy.displayName}</span>
                </div>
                <Btn kind="ghost" height={34} padX={10} fontSize={12.5} onClick={async () => {
                  const ok = await confirm({ title: `Decline ${s.title}?`, message: "It won't be added to the room.", confirmLabel: 'Decline', danger: true });
                  if (ok) decline.mutate(s.id);
                }}>
                  Decline
                </Btn>
                <Btn kind="text" height={34} padX={12} fontSize={12.5} weight={700} disabled={approve.isPending} onClick={() => approve.mutate(s.id, { onSuccess: () => ui.notify(`${s.title} added`) })}>
                  Approve
                </Btn>
              </div>
            ))}
          </Group>
        </Field>
      )}

      <Field label={`MEMBERS · ${members.length}`}>
        {members.length > MEMBER_PREVIEW && (
          <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Find a member" aria-label="Find a member" style={st(inputPill, { height: 42, fontSize: 14.5 })} />
        )}
        <Group>
          {shown.map((m) => {
            const editable = canManage && m.user.id !== user?.id && m.role !== 'room_master' && (isMaster || m.role === 'member');
            return (
              <div key={m.user.id} style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 10px 8px 14px;background:var(--surf)')}>
                <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={32} fontSize={13} profileUserId={m.user.id === user?.id ? undefined : m.user.id} onOpenProfile={close} />
                <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{m.user.displayName}</span>
                {m.user.id !== user?.id && !friends.privateInstance && <FriendStatus userId={m.user.id} name={m.user.displayName} friends={friends} notify={ui.notify} onError={setError} />}
                {editable ? (
                  <>
                    <select
                      value={m.role}
                      aria-label={`Role for ${m.user.displayName}`}
                      onChange={(e) => setRole(m.user.id, m.user.displayName, e.target.value as RoomRole)}
                      style={st('height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13px;outline:none')}
                    >
                      <option value="moderator">Moderator</option>
                      <option value="member">Member</option>
                      {isMaster && <option value="room_master">Make Room Master</option>}
                    </select>
                    <button type="button" onClick={() => removeMember(m.user.id, m.user.displayName)} aria-label="Remove member" style={st('width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:var(--muted);font-size:17px;line-height:1')}>
                      ×
                    </button>
                  </>
                ) : (
                  <span style={st('font:500 12.5px var(--font-ui);color:var(--muted)')}>{ROLE_LABEL[m.role]}</span>
                )}
              </div>
            );
          })}
        </Group>
        {!q && filtered.length > MEMBER_PREVIEW && (
          <button type="button" onClick={() => setShowAll(!showAll)} style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 13px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}>
            {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
          </button>
        )}
        {q && filtered.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>No members match.</span>}
        {canInvite && (candidates.data?.users.length ?? 0) > 0 && (
          <>
            <span style={{ ...st(LABEL), marginTop: 8 }}>ADD FRIENDS</span>
            <Group>
              {candidates.data!.users.map((c) => (
                <div key={c.id} style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px 8px 14px;background:var(--surf)')}>
                  <Avatar name={c.displayName} color={c.avatarColor} avatarUrl={c.avatarUrl} size={32} fontSize={13} profileUserId={c.id} onOpenProfile={close} />
                  <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui)')}>{c.displayName}</span>
                  <Btn kind="soft" height={34} padX={14} fontSize={12.5} onClick={() => addMember(c.id, c.displayName)}>
                    Add
                  </Btn>
                </div>
              ))}
            </Group>
          </>
        )}
        <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--faint)')}>Only your friends and this room's members are listed. Anyone else joins with the invite link.</span>
      </Field>

      {isMaster && (
        <Field label="DETAILS">
          <div style={st('display:flex;gap:8px')}>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Room name" style={st(inputField, { flex: 1, minWidth: 0, height: 46, borderRadius: 14, background: 'var(--surf)', border: '1px solid var(--chip)' })} />
            {name.trim() !== room.name && name.trim() && (
              <Btn kind="text" height={46} padX={16} weight={700} onClick={() => patch({ name: name.trim() }, 'Room renamed')}>
                Save
              </Btn>
            )}
          </div>
          <div style={st('display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>Platform</span>
            <select
              value={room.platform ?? 'any'}
              aria-label="Platform"
              onChange={(e) => patch({ platform: e.target.value === 'any' ? null : (e.target.value as RoomPlatform) }, 'Platform updated')}
              style={st('height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13.5px;outline:none')}
            >
              <option value="any">Any platform</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {ROOM_PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <Switch title="Public room" sub="Anyone on this server can find and join it" on={room.isPublic} onChange={(v) => patch({ isPublic: v }, v ? 'Room is public' : 'Room is invite-only')} />
          <Switch
            title="Anyone can add games"
            sub={room.requireGameApproval ? 'Members suggest games and you approve them' : 'Members add games straight to the queue'}
            on={!room.requireGameApproval}
            onChange={(v) => patch({ requireGameApproval: !v }, v ? 'Anyone can add games' : 'New games need approval')}
          />
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:500 14.5px var(--font-ui)')}>Who can invite people</span>
              <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>Share the invite link and add friends to the room.</span>
            </span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              <ChipToggle on={room.invitePermission === 'members'} onClick={() => patch({ invitePermission: 'members' }, 'Any member can invite')}>
                Any member
              </ChipToggle>
              <ChipToggle on={room.invitePermission === 'moderators'} onClick={() => patch({ invitePermission: 'moderators' }, 'Only moderators and above can invite')}>
                Moderators and above
              </ChipToggle>
            </div>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:500 14.5px var(--font-ui)')}>Spin defaults</span>
              <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>The filters Spin starts with in this room. Anyone can change them for a single spin.</span>
            </span>
            <span style={st(DEFAULT_LABEL)}>PRICE · EVERYONE OWNS IT, OR UNDER</span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {[0, 10, 20, 40].map((v) => (
                <ChipToggle key={v} on={spinMax === v} onClick={() => patch({ spinOwnershipMaxPrice: v }, v === 0 ? 'Spin picks games everyone owns' : `Spin picks games everyone owns, or $${v} or less`)}>
                  {v === 0 ? 'Owned only' : `$${v}`}
                </ChipToggle>
              ))}
            </div>
            <span style={st(DEFAULT_LABEL)}>LENGTH</span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {[0, 10, 20, 40].map((h) => (
                <ChipToggle key={h} on={(spinDefaults.maxTtb ?? 0) === h} onClick={() => patch({ spinDefaults: { ...spinDefaults, maxTtb: h || undefined } }, 'Spin defaults saved')}>
                  {h ? `Under ${h}h` : 'Any length'}
                </ChipToggle>
              ))}
            </div>
            <span style={st(DEFAULT_LABEL)}>REVIEW SCORE</span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {[0, 7, 8, 9].map((n) => (
                <ChipToggle key={n} on={(spinDefaults.minScore ?? 0) === n * 10} onClick={() => patch({ spinDefaults: { ...spinDefaults, minScore: n ? n * 10 : undefined } }, 'Spin defaults saved')}>
                  {n ? `★ ${n}+` : 'Any score'}
                </ChipToggle>
              ))}
            </div>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              <ChipToggle on={!!spinDefaults.everyoneOwns} onClick={() => patch({ spinDefaults: { ...spinDefaults, everyoneOwns: !spinDefaults.everyoneOwns || undefined } }, 'Spin defaults saved')}>
                Everyone owns it
              </ChipToggle>
            </div>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:500 14.5px var(--font-ui)')}>Spin type</span>
              <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{SPIN_WHEEL_THEME_HINTS[room.spinWheelTheme]}</span>
            </span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {SPIN_WHEEL_THEMES.map((t) => (
                <ChipToggle key={t} on={room.spinWheelTheme === t} onClick={() => patch({ spinWheelTheme: t }, `Spin type: ${SPIN_WHEEL_THEME_LABELS[t]}`)}>
                  {t === 'random' ? '🎲 Random' : SPIN_WHEEL_THEME_LABELS[t]}
                </ChipToggle>
              ))}
            </div>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>Room colour</span>
            <div style={st('display:flex;gap:10px;flex-wrap:wrap')}>
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label="Room colour"
                  aria-pressed={room.accentColor === c}
                  onClick={() => patch({ accentColor: c }, 'Room colour updated')}
                  style={st(`width:34px;height:34px;border-radius:50%;border:none;background:${c};box-shadow:${room.accentColor === c ? '0 0 0 2px var(--surf), 0 0 0 4px var(--text)' : 'none'}`)}
                />
              ))}
            </div>
            <div style={st('display:flex;align-items:center;gap:10px')}>
              <input
                type="color"
                aria-label="Pick a custom room colour"
                value={/^#[0-9a-fA-F]{6}$/.test(hexDraft ?? '') ? hexDraft! : /^#[0-9a-fA-F]{6}$/.test(room.accentColor) ? room.accentColor : '#8b5cf6'}
                onChange={(e) => setHexDraft(e.target.value)}
                style={st('width:42px;height:34px;padding:0;border:none;border-radius:10px;background:none')}
              />
              <input
                value={hexDraft ?? room.accentColor}
                onChange={(e) => setHexDraft(e.target.value)}
                placeholder="#8b5cf6"
                maxLength={7}
                aria-label="Custom room colour (hex)"
                style={st(inputField, { width: 112, height: 38, borderRadius: 10, fontSize: 13.5, fontFamily: 'var(--font-mono)' })}
              />
              {hexDraft !== null && hexDraft.toLowerCase() !== room.accentColor.toLowerCase() && (
                <Btn
                  kind="text"
                  height={38}
                  padX={12}
                  fontSize={13}
                  weight={700}
                  disabled={!/^#[0-9a-fA-F]{6}$/.test(hexDraft)}
                  onClick={() => {
                    patch({ accentColor: hexDraft.toLowerCase() }, 'Room colour updated');
                    setHexDraft(null);
                  }}
                >
                  Save
                </Btn>
              )}
            </div>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>Discord webhook</span>
            <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>Room activity (games added, votes, spins) is also posted to this Discord channel.</span>
            <div style={st('display:flex;gap:8px')}>
              <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" aria-label="Discord webhook URL" style={st(inputField, { flex: 1, minWidth: 0, height: 42, borderRadius: 12, fontSize: 13.5 })} />
              {hook.trim() !== (room.discordWebhookUrl ?? '') && (
                <Btn kind="text" height={42} padX={14} fontSize={13} weight={700} disabled={!hookValid} onClick={() => patch({ discordWebhookUrl: hook.trim() || null }, hook.trim() ? 'Webhook saved' : 'Webhook removed')}>
                  Save
                </Btn>
              )}
            </div>
            {!hookValid && <span style={st('font:400 12px var(--font-ui);color:var(--danger)')}>That doesn't look like a Discord webhook URL.</span>}
            <div style={st(`display:flex;flex-direction:column;gap:8px;padding-top:6px;opacity:${hasHook ? 1 : 0.5}`)}>
              <span style={st(LABEL)}>POST TO DISCORD WHEN…</span>
              <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
                {DISCORD_EVENT_KEYS.map((k: DiscordEventKey) => {
                  const on = events[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!hasHook}
                      onClick={() => patch({ discordEvents: { [k]: !on } })}
                      style={st(`display:flex;align-items:center;gap:6px;height:34px;padding:0 12px 0 8px;border-radius:999px;border:1px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--accSoft)' : 'transparent'};color:${on ? 'var(--accText)' : 'var(--muted)'};font:600 12.5px var(--font-ui)`)}
                    >
                      <span style={st(`width:18px;height:18px;border-radius:50%;background:${on ? 'var(--acc)' : 'var(--chip)'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 10px var(--font-ui)`)}>{on ? '✓' : ''}</span>
                      {DISCORD_EVENT_LABELS[k]}
                    </button>
                  );
                })}
              </div>
              <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>
                {hasHook ? 'Member activity posts what members start, beat and unlock on their own shelves (hidden games excluded). Changes save straight away.' : 'Add a webhook above to start posting.'}
              </span>
            </div>
          </div>
        </Field>
      )}

      <Field label="EXPORT">
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'squad-room')}>Export CSV</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'squad-room')}>Export JSON</Btn>
        </div>
      </Field>

      <Field label="YEAR IN REVIEW">
        {!showYear ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowYear(true)}>
            Show this room's year
          </Btn>
        ) : (
          <div style={st('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
            {[
              [String(year.completedGames.length), `game${year.completedGames.length === 1 ? '' : 's'} finished`],
              [topGenre, 'top genre'],
              [year.topVoted ? year.topVoted.title : '—', 'most-voted game'],
            ].map(([v, l]) => (
              <div key={l} style={st('display:flex;flex-direction:column;gap:3px;padding:12px;border-radius:16px;background:var(--surf);min-width:0')}>
                <span style={st('font:700 17px/1.15 var(--font-display);overflow:hidden;text-overflow:ellipsis')}>{v}</span>
                <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>{l}</span>
              </div>
            ))}
          </div>
        )}
      </Field>

      <Field label="ACTIVITY">
        {!showAct ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAct(true)}>
            Show room activity
          </Btn>
        ) : (
          <>
            {activity.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Loading…</span>}
            {entries.map((a) => (
              <div key={a.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
                <span>{a.message}</span>
                <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(a.createdAt)}</span>
              </div>
            ))}
            {!activity.isLoading && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>Nothing yet.</span>}
            {activity.hasNextPage && (
              <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
                {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Btn>
            )}
          </>
        )}
      </Field>

      <Group>
        <button
          type="button"
          onClick={() => {
            ui.closeDialog('roomSettings');
            ui.openDialog('journal', { roomId });
          }}
          style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--text);text-align:left;font:600 14.5px var(--font-ui)')}
        >
          Play journal
        </button>
      </Group>

      <Group>
        {!isMaster && (
          <button type="button" onClick={leave} style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}>
            Leave room
          </button>
        )}
        {isMaster && (
          <button type="button" onClick={del} style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}>
            Delete room
          </button>
        )}
      </Group>
    </Dialog>
  );
}
