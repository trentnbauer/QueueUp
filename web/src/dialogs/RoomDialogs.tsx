import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DISCORD_EVENT_KEYS,
  ROOM_PLATFORM_LABELS,
  SPIN_WHEEL_THEMES,
  resolveDiscordEvents,
  type DiscordEventKey,
  type Room,
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
import { RoomWeeklyRecap } from './RoomWeeklyRecap';
import { YearStoryCard } from '../components/YearStoryCard';
import { roomStoryFacts } from '../lib/yearStoryFacts';
import { AiSettingsDialog } from './AiSettingsDialog';
import { Dialog } from '../ui/Dialog';
import { NavRow } from './MeDialog';
import { RoomAiSection } from './RoomAiSection';
import { Avatar, Banner, Btn, ChipToggle, Cover, Group, Segmented, Toggle, initialsOf, inputField, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { getBasePath } from '../utils/basePath';
import { formatRelativeTime } from '../utils/relativeTime';
import { t as tr, useT, type MessageKey } from '../i18n';
import { discordEventLabel, liveMap, spinThemeHint, spinThemeLabel } from '../i18n/labels';

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

const TITLES = { options: 'room.add.title.options', create: 'room.add.title.create', join: 'room.add.title.join', browse: 'room.add.title.browse' } as const satisfies Record<string, MessageKey>;

/** Create / join (code or link) / browse public rooms. */
export function AddRoomDialog() {
  const ui = useUi();
  const navigate = useNavigate();
  const t = useT();
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
      ui.notify(t('room.add.created', { name: room.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('room.add.createError'));
    } finally {
      setBusy(null);
    }
  }

  async function join() {
    const c = code.trim();
    if (!c) return;
    setBusy('join');
    setError(null);
    try {
      const m = c.match(/\/join\/([^/?#]+)/);
      const { room } = await joinRoom.mutateAsync({ inviteCode: m ? decodeURIComponent(m[1]) : c });
      close();
      navigate(`/room/${room.id}`);
      ui.notify(t('room.add.joined', { name: room.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('room.add.joinCodeError'));
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
      ui.notify(t('room.add.joined', { name: room.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('room.add.joinError'));
    } finally {
      setBusy(null);
    }
  }

  const platOpts: { v: RoomPlatform | null; l: string }[] = [{ v: null, l: t('room.add.anyPlatform') }, ...PLATFORMS.map((p) => ({ v: p, l: ROOM_PLATFORM_LABELS[p] }))];

  return (
    <Dialog onClose={close} title={t(TITLES[step])} onBack={step === 'options' ? undefined : () => { setError(null); setStep('options'); }}>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}
      {step === 'options' && (
        <Group>
          {(
            [
              ['create', t('room.add.option.create'), t('room.add.option.createSub')],
              ['join', t('room.add.option.join'), t('room.add.option.joinSub')],
              ['browse', t('room.add.option.browse'), t('room.add.option.browseSub')],
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
          <Field label={t('room.add.nameLabel')}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('room.add.namePlaceholder')} aria-label={t('room.add.nameAria')} autoFocus style={st(inputField, { height: 48, borderRadius: 14, background: 'var(--surf)', fontSize: 16 })} />
          </Field>
          <Field label={t('room.add.platformLabel')}>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              {platOpts.map((p) => (
                <ChipToggle key={p.l} on={platform === p.v} height={36} onClick={() => setPlatform(p.v)}>
                  {p.l}
                </ChipToggle>
              ))}
            </div>
          </Field>
          <Field label={t('room.add.visibilityLabel')}>
            <Segmented
              columns={2}
              value={isPublic ? 'public' : 'invite'}
              onChange={(v) => setIsPublic(v === 'public')}
              options={[
                { value: 'invite', label: t('room.add.inviteOnly') },
                { value: 'public', label: t('room.add.public') },
              ]}
            />
          </Field>
          <Btn kind="accent" height={50} fontSize={15} weight={700} disabled={!name.trim() || busy === 'create'} onClick={create}>
            {busy === 'create' ? t('room.add.creating') : t('room.add.createButton')}
          </Btn>
        </>
      )}
      {step === 'join' && (
        <>
          <Field label={t('room.add.codeLabel')}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('room.add.codePlaceholder')} aria-label={t('room.add.codeAria')} autoFocus style={st(inputField, { height: 48, borderRadius: 14, background: 'var(--surf)', fontSize: 16 })} />
          </Field>
          <Btn kind="accent" height={50} fontSize={15} weight={700} disabled={!code.trim() || busy === 'join'} onClick={join}>
            {busy === 'join' ? t('room.add.joining') : t('room.add.joinButton')}
          </Btn>
        </>
      )}
      {step === 'browse' && (
        <Group>
          {publicRooms.isLoading && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>{t('room.add.loadingPublic')}</div>}
          {browse.map((r) => (
            <div key={r.id} style={st('display:flex;align-items:center;gap:12px;min-height:64px;padding:10px 12px 10px 14px;background:var(--surf)')}>
              <span style={st(`width:36px;height:36px;flex-shrink:0;border-radius:12px;background:${r.accentColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 11px var(--font-mono)`)}>{initialsOf(r.name)}</span>
              <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 15px var(--font-ui)')}>{r.name}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                  {t(r.memberCount === 1 ? 'room.add.publicRow.one' : 'room.add.publicRow.other', { platform: r.platform ? ROOM_PLATFORM_LABELS[r.platform] : t('room.add.anyPlatform'), n: r.memberCount })}
                </span>
              </div>
              <Btn kind="soft" height={36} padX={16} fontSize={13} disabled={busy === r.id} onClick={() => joinPublic(r.id)}>
                {busy === r.id ? t('room.add.joining') : t('room.add.join')}
              </Btn>
            </div>
          ))}
          {!publicRooms.isLoading && browse.length === 0 && <div style={st('padding:16px;background:var(--surf);color:var(--muted);font-size:14px')}>{t('room.add.noPublic')}</div>}
        </Group>
      )}
    </Dialog>
  );
}

type FriendsApi = ReturnType<typeof useFriends>;

/** Per-member friend state in the member list: already a friend, request sent, request waiting on
 * you, or a button to send one. */
export function FriendStatus({ userId, name, friends, notify, onError }: { userId: string; name: string; friends: FriendsApi; notify: (m: string) => void; onError: (m: string) => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  // Flip to "Request sent" right away instead of waiting for the friends list to refetch.
  const [sent, setSent] = useState(false);
  const chip = 'height:28px;padding:0 10px;border-radius:999px;display:flex;align-items:center;font:600 12px var(--font-ui);white-space:nowrap';
  if (friends.friends.some((f) => f.id === userId)) {
    return <span style={st(`${chip};background:var(--mintSoft);color:var(--mint)`)}>{t('room.friend.isFriend')}</span>;
  }
  if (sent || friends.outgoing.some((r) => r.user.id === userId)) {
    return <span style={st(`${chip};background:var(--chip);color:var(--muted)`)}>{t('room.friend.requestSent')}</span>;
  }
  const incoming = friends.incoming.find((r) => r.user.id === userId);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      notify(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : t('room.error.generic'));
    } finally {
      setBusy(false);
    }
  }
  if (incoming) {
    return (
      <Btn kind="soft" height={28} padX={10} fontSize={12} disabled={busy} onClick={() => run(() => friends.accept(incoming.id), t('room.friend.nowFriends', { name }))}>
        {t('room.friend.acceptRequest')}
      </Btn>
    );
  }
  return (
    <Btn kind="soft" height={28} padX={10} fontSize={12} disabled={busy} onClick={() => run(async () => {
        await friends.sendRequestToUser(userId);
        setSent(true);
      }, t('room.friend.sentTo', { name }))}>
      {t('room.friend.add')}
    </Btn>
  );
}

const ROLE_KEY: Record<RoomRole, MessageKey> = { room_master: 'room.role.roomMaster', moderator: 'room.role.moderator', member: 'room.role.member' };
/** Translated role names, looked up in the current language when read. */
const ROLE_LABEL = liveMap<RoomRole>((r) => tr(ROLE_KEY[r]));
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
/** A room's Spin type and Spin defaults (#801), one row in Room settings that opens this. */
function RoomSpinSettingsDialog({ room, patch, onClose }: { room: Room; patch: (body: Parameters<typeof roomsApi.update>[1], toast?: string) => void; onClose: () => void }) {
  const spinMax = room.spinOwnershipMaxPrice;
  const spinDefaults = room.spinDefaults ?? {};
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('room.spin.title')} gap={12}>
      <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
        <span style={st('display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.spin.defaults')}</span>
          <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.spin.defaultsHint')}</span>
        </span>
        <span style={st(DEFAULT_LABEL)}>{t('room.spin.priceLabel')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {[0, 7, 15, 30, 60, -1].map((v) => (
            // Pressing the chosen price again drops it, back to owned-only (the baseline).
            <ChipToggle key={v} on={spinMax === v} onClick={() => { const next = spinMax === v ? 0 : v; patch({ spinOwnershipMaxPrice: next }, next === 0 ? t('room.spin.toastOwnedOnly') : next < 0 ? t('room.spin.toastNoLimit') : t('room.spin.toastOwnedOrPrice', { price: next })); }}>
              {v === 0 ? t('room.spin.ownedOnly') : v < 0 ? t('room.spin.noLimit') : `$${v}`}
            </ChipToggle>
          ))}
        </div>
        <span style={st(DEFAULT_LABEL)}>{t('room.spin.lengthLabel')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {[0, 10, 20, 40].map((h) => (
            <ChipToggle key={h} on={(spinDefaults.maxTtb ?? 0) === h} onClick={() => patch({ spinDefaults: { maxTtb: (spinDefaults.maxTtb ?? 0) === h ? 0 : h } }, t('room.spin.saved'))}>
              {h ? t('room.spin.under', { h }) : t('room.spin.anyLength')}
            </ChipToggle>
          ))}
        </div>
        <span style={st(DEFAULT_LABEL)}>{t('room.spin.scoreLabel')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {[0, 7, 8, 9].map((n) => (
            <ChipToggle key={n} on={(spinDefaults.minScore ?? 0) === n * 10} onClick={() => patch({ spinDefaults: { minScore: (spinDefaults.minScore ?? 0) === n * 10 ? 0 : n * 10 } }, t('room.spin.saved'))}>
              {n ? `★ ${n}+` : t('room.spin.anyScore')}
            </ChipToggle>
          ))}
        </div>
        {/* "Everyone owns it" duplicated the Owned only price choice, so it is no longer offered; a room that
            already has it switched on keeps a chip to turn it off. */}
        {spinDefaults.everyoneOwns && (
          <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
            <ChipToggle on onClick={() => patch({ spinDefaults: { everyoneOwns: false } }, t('room.spin.saved'))}>
              {t('room.spin.everyoneOwns')}
            </ChipToggle>
          </div>
        )}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
        <span style={st('display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.spin.type')}</span>
          <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{spinThemeHint(room.spinWheelTheme)}</span>
        </span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          {SPIN_WHEEL_THEMES.map((theme) => (
            <ChipToggle key={theme} on={room.spinWheelTheme === theme} onClick={() => patch({ spinWheelTheme: theme }, t('room.spin.typeToast', { type: spinThemeLabel(theme) }))}>
              {theme === 'random' ? t('room.spin.random') : spinThemeLabel(theme)}
            </ChipToggle>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/** "Prize wheel · Under 20h · ★ 8+" for the Spin settings row. */
function spinSummary(room: Room): string {
  const d = room.spinDefaults ?? {};
  return [
    spinThemeLabel(room.spinWheelTheme),
    room.spinOwnershipMaxPrice === 0 ? tr('room.spin.ownedOnly') : room.spinOwnershipMaxPrice < 0 ? tr('room.spin.noLimit') : room.spinOwnershipMaxPrice ? tr('room.spin.ownedOrPrice', { price: room.spinOwnershipMaxPrice }) : null,
    d.maxTtb ? tr('room.spin.under', { h: d.maxTtb }) : null,
    d.minScore ? `★ ${d.minScore / 10}+` : null,
    d.everyoneOwns ? tr('room.spin.everyoneOwns') : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function RoomSettingsDialog() {
  const scope = useScope();
  const ui = useUi();
  const t = useT();
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
  const [spinOpen, setSpinOpen] = useState(false);
  const [masterLeaveOpen, setMasterLeaveOpen] = useState(false);
  const [addFriendsOpen, setAddFriendsOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
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
    onError: (e) => setError(e instanceof Error ? e.message : t('room.settings.approveError')),
  });
  const decline = useMutation({
    mutationFn: (id: string) => gameSuggestionsApi.decline(roomId, id),
    onSuccess: () => refreshSuggestions(),
    onError: (e) => setError(e instanceof Error ? e.message : t('room.settings.declineError')),
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
      setError(e instanceof Error ? e.message : t('room.settings.saveError'));
    }
  }

  const invite = inviteCode ?? room.inviteCode ?? null;
  const inviteUrl = invite ? `${window.location.origin}${getBasePath()}/join/${invite}` : null;

  async function copyInvite() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    ui.notify(t('room.settings.inviteCopied'));
  }

  async function regen() {
    const ok = await confirm({ title: t('room.settings.regenTitle'), message: t('room.settings.regenMessage'), confirmLabel: t('room.settings.regenConfirm') });
    if (!ok) return;
    try {
      const { inviteCode: next } = await roomsApi.regenerateInvite(roomId);
      setInviteCode(next);
      refreshRoom();
      ui.notify(t('room.settings.regenDone'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.regenError'));
    }
  }

  async function setRole(userId: string, displayName: string, role: RoomRole) {
    if (role === 'room_master') {
      const ok = await confirm({
        title: t('room.settings.transferTitle'),
        message: t('room.settings.transferMessage', { name: displayName }),
        confirmLabel: t('room.settings.transferConfirm'),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await roomsApi.setRole(roomId, userId, role);
      refreshRoom();
      ui.notify(role === 'room_master' ? t('room.settings.newMaster', { name: displayName }) : t('room.settings.roleChanged', { name: displayName, role: ROLE_LABEL[role] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.roleError'));
    }
  }

  async function removeMember(userId: string, displayName: string) {
    const ok = await confirm({ title: t('room.settings.removeTitle'), message: t('room.settings.removeMessage', { name: displayName, room: room!.name }), confirmLabel: t('common.remove'), danger: true });
    if (!ok) return;
    try {
      await roomsApi.removeMember(roomId, userId);
      refreshRoom();
      ui.notify(t('room.settings.removed', { name: displayName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.removeError'));
    }
  }

  async function addMember(userId: string, displayName: string) {
    try {
      await roomsApi.addMember(roomId, userId);
      refreshRoom();
      ui.notify(t('room.settings.added', { name: displayName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.addError'));
    }
  }

  async function leave() {
    const ok = await confirm({ title: t('room.settings.leaveTitle'), message: t('room.settings.leaveMessage', { room: room!.name }), confirmLabel: t('room.settings.leaveRoom'), danger: true });
    if (!ok || !user) return;
    try {
      await roomsApi.removeMember(roomId, user.id);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      close();
      navigate('/');
      ui.notify(t('room.settings.left', { room: room!.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.leaveError'));
    }
  }

  // A Room Master can't just leave (the room would have no owner): they pick who takes over, then
  // step down to Moderator (the transfer) and leave, or delete the room instead.
  async function handOverAndLeave(userId: string, displayName: string) {
    if (!user) return;
    try {
      await roomsApi.setRole(roomId, userId, 'room_master');
      await roomsApi.removeMember(roomId, user.id);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      setMasterLeaveOpen(false);
      close();
      navigate('/');
      ui.notify(t('room.settings.leftHandOver', { room: room!.name, name: displayName }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.leaveError'));
      refreshRoom();
    }
  }

  async function del() {
    const ok = await confirm({
      title: t('room.settings.deleteTitle'),
      message: t('room.settings.deleteMessage', { room: room!.name }),
      confirmLabel: t('room.settings.deleteRoom'),
      danger: true,
      typedConfirmation: room!.name,
    });
    if (!ok) return;
    try {
      await roomsApi.delete(roomId);
      queryClient.invalidateQueries({ queryKey: ['rooms'] });
      close();
      navigate('/');
      ui.notify(t('room.settings.deleted'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.deleteError'));
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

  return (
    <>
    <Dialog
      onClose={close}
      height="tall"
      gap={24}
      header={
        <>
          <span style={st(`width:40px;height:40px;flex-shrink:0;border-radius:14px;background:${room.accentColor};color:#fff;display:flex;align-items:center;justify-content:center;font:600 12px var(--font-mono)`)}>{initialsOf(room.name)}</span>
          <div style={st('flex:1;min-width:0;display:flex;flex-direction:column')}>
            <span style={st('font:700 20px var(--font-display);letter-spacing:-0.02em')}>{t('room.settings.title')}</span>
            <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>{t('room.settings.yourRole', { role: ROLE_LABEL[room.myRole] })}</span>
          </div>
        </>
      }
    >
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

      {canInvite && (
      <Field label={t('room.settings.inviteLabel')}>
        <div style={st('display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;border-radius:16px;background:var(--surf)')}>
          <span style={st('flex:1;min-width:0;font:600 17px var(--font-mono);letter-spacing:0.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{invite ?? '—'}</span>
          <Btn kind="soft" height={36} padX={12} fontSize={13} weight={700} onClick={() => setAddFriendsOpen(true)}>
            {t('room.settings.addFriendsButton')}
          </Btn>
          <Btn kind="text" height={36} padX={10} fontSize={13} weight={700} disabled={!inviteUrl} onClick={copyInvite}>
            {t('room.settings.copyLink')}
          </Btn>
        </div>
        {canManage && (
          <button type="button" onClick={regen} style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}>
            {t('room.settings.regen')}
          </button>
        )}
      </Field>
      )}

      {canManage && suggestions.length > 0 && (
        <Field label={t('room.settings.suggestedLabel', { n: suggestions.length })}>
          <Group>
            {suggestions.map((s) => (
              <div key={s.id} style={st('display:flex;align-items:center;gap:10px;min-height:60px;padding:8px 10px 8px 12px;background:var(--surf)')}>
                <Cover title={s.title} url={s.coverImageUrl} width={32} radius={6} />
                <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{s.title}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('room.settings.suggestedBy', { name: s.suggestedBy.displayName })}</span>
                </div>
                <Btn kind="ghost" height={34} padX={10} fontSize={12.5} onClick={async () => {
                  const ok = await confirm({ title: t('room.settings.declineSuggestionTitle', { title: s.title }), message: t('room.settings.declineSuggestionMessage'), confirmLabel: t('room.settings.decline'), danger: true });
                  if (ok) decline.mutate(s.id);
                }}>
                  {t('room.settings.decline')}
                </Btn>
                <Btn kind="text" height={34} padX={12} fontSize={12.5} weight={700} disabled={approve.isPending} onClick={() => approve.mutate(s.id, { onSuccess: () => ui.notify(t('room.settings.added', { name: s.title })) })}>
                  {t('room.settings.approve')}
                </Btn>
              </div>
            ))}
          </Group>
        </Field>
      )}

      <Field label={t('room.settings.membersLabel', { n: members.length })}>
        {members.length > MEMBER_PREVIEW && (
          <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder={t('room.settings.findMember')} aria-label={t('room.settings.findMember')} style={st(inputPill, { height: 42, fontSize: 14.5 })} />
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
                      aria-label={t('room.settings.roleFor', { name: m.user.displayName })}
                      onChange={(e) => setRole(m.user.id, m.user.displayName, e.target.value as RoomRole)}
                      style={st('height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13px;outline:none')}
                    >
                      <option value="moderator">{ROLE_LABEL.moderator}</option>
                      <option value="member">{ROLE_LABEL.member}</option>
                      {isMaster && <option value="room_master">{t('room.settings.makeMaster')}</option>}
                    </select>
                    <button type="button" onClick={() => removeMember(m.user.id, m.user.displayName)} aria-label={t('room.settings.removeMemberAria')} style={st('width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:var(--muted);font-size:17px;line-height:1')}>
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
            {showAll ? t('room.settings.showFewer') : t('room.settings.showAll', { n: filtered.length })}
          </button>
        )}
        {q && filtered.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('room.settings.noMatch')}</span>}
        <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--faint)')}>{t('room.settings.membersHint')}</span>
      </Field>

      {isMaster && (
        <Field label={t('room.settings.detailsLabel')}>
          <div style={st('display:flex;gap:8px')}>
            <input value={name} onChange={(e) => setName(e.target.value)} aria-label={t('room.add.nameAria')} style={st(inputField, { flex: 1, minWidth: 0, height: 46, borderRadius: 14, background: 'var(--surf)', border: '1px solid var(--chip)' })} />
            {name.trim() !== room.name && name.trim() && (
              <Btn kind="text" height={46} padX={16} weight={700} onClick={() => patch({ name: name.trim() }, t('room.settings.renamed'))}>
                {t('common.save')}
              </Btn>
            )}
          </div>
          <div style={st('display:flex;align-items:center;justify-content:space-between;min-height:48px;padding:0 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.settings.platform')}</span>
            <select
              value={room.platform ?? 'any'}
              aria-label={t('room.settings.platform')}
              onChange={(e) => patch({ platform: e.target.value === 'any' ? null : (e.target.value as RoomPlatform) }, t('room.settings.platformUpdated'))}
              style={st('height:34px;padding:0 8px;border-radius:10px;background:var(--surf2);border:none;color:var(--text);font-size:13.5px;outline:none')}
            >
              <option value="any">{t('room.add.anyPlatform')}</option>
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {ROOM_PLATFORM_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <Switch title={t('room.settings.publicTitle')} sub={t('room.settings.publicSub')} on={room.isPublic} onChange={(v) => patch({ isPublic: v }, v ? t('room.settings.nowPublic') : t('room.settings.nowInviteOnly'))} />
          <Switch
            title={t('room.settings.anyoneAdds')}
            sub={room.requireGameApproval ? t('room.settings.approvalOnSub') : t('room.settings.approvalOffSub')}
            on={!room.requireGameApproval}
            onChange={(v) => patch({ requireGameApproval: !v }, v ? t('room.settings.anyoneAdds') : t('room.settings.needApproval'))}
          />
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('display:flex;flex-direction:column;gap:2px')}>
              <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.settings.whoInvites')}</span>
              <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.whoInvitesHint')}</span>
            </span>
            <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
              <ChipToggle on={room.invitePermission === 'members'} onClick={() => patch({ invitePermission: 'members' }, t('room.settings.anyMemberInvites'))}>
                {t('room.settings.anyMember')}
              </ChipToggle>
              <ChipToggle on={room.invitePermission === 'moderators'} onClick={() => patch({ invitePermission: 'moderators' }, t('room.settings.modsInvite'))}>
                {t('room.settings.modsAndAbove')}
              </ChipToggle>
            </div>
          </div>
          <Group>
            <NavRow label={t('room.spin.title')} sub={spinSummary(room)} onClick={() => setSpinOpen(true)} />
          </Group>
          <div style={st('display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.settings.colour')}</span>
            <div style={st('display:flex;gap:10px;flex-wrap:wrap')}>
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('room.settings.colour')}
                  aria-pressed={room.accentColor === c}
                  onClick={() => patch({ accentColor: c }, t('room.settings.colourUpdated'))}
                  style={st(`width:34px;height:34px;border-radius:50%;border:none;background:${c};box-shadow:${room.accentColor === c ? '0 0 0 2px var(--surf), 0 0 0 4px var(--text)' : 'none'}`)}
                />
              ))}
            </div>
            <div style={st('display:flex;align-items:center;gap:10px')}>
              <input
                type="color"
                aria-label={t('room.settings.customColour')}
                value={/^#[0-9a-fA-F]{6}$/.test(hexDraft ?? '') ? hexDraft! : /^#[0-9a-fA-F]{6}$/.test(room.accentColor) ? room.accentColor : '#8b5cf6'}
                onChange={(e) => setHexDraft(e.target.value)}
                style={st('width:42px;height:34px;padding:0;border:none;border-radius:10px;background:none')}
              />
              <input
                value={hexDraft ?? room.accentColor}
                onChange={(e) => setHexDraft(e.target.value)}
                placeholder="#8b5cf6"
                maxLength={7}
                aria-label={t('room.settings.customHex')}
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
                    patch({ accentColor: hexDraft.toLowerCase() }, t('room.settings.colourUpdated'));
                    setHexDraft(null);
                  }}
                >
                  {t('common.save')}
                </Btn>
              )}
            </div>
          </div>
          <div style={st('display:flex;flex-direction:column;gap:8px;padding:14px 16px;border-radius:14px;background:var(--surf)')}>
            <span style={st('font:500 14.5px var(--font-ui)')}>{t('room.settings.discord')}</span>
            <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.discordHint')}</span>
            <div style={st('display:flex;gap:8px')}>
              <input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" aria-label={t('room.settings.discordAria')} style={st(inputField, { flex: 1, minWidth: 0, height: 42, borderRadius: 12, fontSize: 13.5 })} />
              {hook.trim() !== (room.discordWebhookUrl ?? '') && (
                <Btn kind="text" height={42} padX={14} fontSize={13} weight={700} disabled={!hookValid} onClick={() => patch({ discordWebhookUrl: hook.trim() || null }, hook.trim() ? t('room.settings.webhookSaved') : t('room.settings.webhookRemoved'))}>
                  {t('common.save')}
                </Btn>
              )}
            </div>
            {!hookValid && <span style={st('font:400 12px var(--font-ui);color:var(--danger)')}>{t('room.settings.webhookInvalid')}</span>}
            <div style={st(`display:flex;flex-direction:column;gap:8px;padding-top:6px;opacity:${hasHook ? 1 : 0.5}`)}>
              <span style={st(LABEL)}>{t('room.settings.postWhen')}</span>
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
                      {discordEventLabel(k)}
                    </button>
                  );
                })}
              </div>
              <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>
                {hasHook ? t('room.settings.discordOnHint') : t('room.settings.discordOffHint')}
              </span>
            </div>
          </div>
        </Field>
      )}

      <Field label={t('room.settings.aiLabel')}>
        <RoomAiSection roomId={roomId} canManage={canManage} onOpenProfile={close} />
        <div style={st('display:flex;flex-wrap:wrap;gap:8px')}>
          <Btn kind="soft" height={38} padX={14} fontSize={13} onClick={() => { close(); ui.openDialog('aiTonight'); }}>
            {t('room.settings.ai.tonight')}
          </Btn>
          <Btn kind="soft" height={38} padX={14} fontSize={13} onClick={() => setAiSettingsOpen(true)}>
            {t('room.settings.ai.mine')}
          </Btn>
        </div>
      </Field>

      <Field label={t('room.settings.exportLabel')}>
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'squad-room')}>{t('room.settings.exportCsv')}</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'squad-room')}>{t('room.settings.exportJson')}</Btn>
        </div>
      </Field>

      <Field label={t('room.settings.recap.label')}>
        <RoomWeeklyRecap roomId={roomId} />
      </Field>

      <Field label={t('room.settings.yearLabel')}>
        {!showYear ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowYear(true)}>
            {t('room.settings.showYear')}
          </Btn>
        ) : (
          <>
            <div style={st('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px')}>
              {[
                [String(year.completedGames.length), t(year.completedGames.length === 1 ? 'room.settings.gamesFinished.one' : 'room.settings.gamesFinished.other')],
                [topGenre, t('room.settings.topGenre')],
                [year.topVoted ? year.topVoted.title : '—', t('room.settings.mostVoted')],
              ].map(([v, l]) => (
                <div key={l} style={st('display:flex;flex-direction:column;gap:3px;padding:12px;border-radius:16px;background:var(--surf);min-width:0')}>
                  <span style={st('font:700 17px/1.15 var(--font-display);overflow:hidden;text-overflow:ellipsis')}>{v}</span>
                  <span style={st('font:400 11.5px var(--font-ui);color:var(--muted)')}>{l}</span>
                </div>
              ))}
            </div>
            <YearStoryCard roomId={roomId} facts={roomStoryFacts(year, members.length)} />
          </>
        )}
      </Field>

      <Field label={t('room.settings.activityLabel')}>
        {!showAct ? (
          <Btn height={40} fontSize={13} style={{ alignSelf: 'flex-start' }} onClick={() => setShowAct(true)}>
            {t('room.settings.showActivity')}
          </Btn>
        ) : (
          <>
            {activity.isLoading && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
            {entries.map((a) => (
              <div key={a.id} style={st('display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--chip);font:400 13.5px var(--font-ui)')}>
                <span>{a.message}</span>
                <span style={st('flex-shrink:0;color:var(--faint);font-size:12px')}>{formatRelativeTime(a.createdAt)}</span>
              </div>
            ))}
            {!activity.isLoading && entries.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('room.settings.nothingYet')}</span>}
            {activity.hasNextPage && (
              <Btn height={36} fontSize={13} style={{ alignSelf: 'flex-start' }} disabled={activity.isFetchingNextPage} onClick={() => activity.fetchNextPage()}>
                {activity.isFetchingNextPage ? t('common.loading') : t('room.settings.loadMore')}
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
          {t('room.settings.journal')}
        </button>
      </Group>

      <Group>
        {!isMaster && (
          <button type="button" onClick={leave} style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}>
            {t('room.settings.leaveRoom')}
          </button>
        )}
        {isMaster && members.some((m) => m.user.id === user?.id) && (
          <button type="button" onClick={() => setMasterLeaveOpen(true)} style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}>
            {t('room.settings.leaveRoom')}
          </button>
        )}
        {isMaster && (
          <button type="button" onClick={del} style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}>
            {t('room.settings.deleteRoom')}
          </button>
        )}
      </Group>
    </Dialog>
    {addFriendsOpen && (
      <Dialog onClose={() => setAddFriendsOpen(false)} title={t('room.settings.addFriendsTitle')} gap={12}>
        <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('room.settings.addFriendsIntro', { room: room.name })}</span>
        {candidates.isLoading && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
        {!candidates.isLoading && (candidates.data?.users.length ?? 0) === 0 && (
          <span style={st('font:500 14px/1.45 var(--font-ui)')}>{t('room.settings.addFriendsNone')}</span>
        )}
        {(candidates.data?.users.length ?? 0) > 0 && (
          <Group>
            {candidates.data!.users.map((c) => (
              <div key={c.id} style={st('display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 10px 8px 14px;background:var(--surf)')}>
                <Avatar name={c.displayName} color={c.avatarColor} avatarUrl={c.avatarUrl} size={32} fontSize={13} />
                <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{c.displayName}</span>
                <Btn kind="soft" height={34} padX={14} fontSize={12.5} onClick={() => addMember(c.id, c.displayName)}>
                  {t('common.add')}
                </Btn>
              </div>
            ))}
          </Group>
        )}
      </Dialog>
    )}
    {aiSettingsOpen && <AiSettingsDialog onClose={() => setAiSettingsOpen(false)} />}
    {masterLeaveOpen && (
      <Dialog onClose={() => setMasterLeaveOpen(false)} title={t('room.settings.masterLeaveTitle')} gap={14}>
        <p style={st('margin:0;font:400 13.5px/1.5 var(--font-ui);color:var(--muted)')}>
          {members.length > 1 ? t('room.settings.masterLeaveMessage', { room: room.name }) : t('room.settings.masterLeaveAlone', { room: room.name })}
        </p>
        {members.length > 1 && (
          <Group>
            {members.filter((m) => m.user.id !== user?.id).map((m) => (
              <button
                key={m.user.id}
                type="button"
                onClick={() => handOverAndLeave(m.user.id, m.user.displayName)}
                style={st('display:flex;align-items:center;gap:12px;min-height:52px;padding:8px 16px;border:none;background:var(--surf);color:var(--text);text-align:left;font:600 14.5px var(--font-ui)')}
              >
                <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={28} fontSize={12} />
                <span style={st('flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{t('room.settings.masterLeavePick', { name: m.user.displayName })}</span>
              </button>
            ))}
          </Group>
        )}
        <Group>
          <button
            type="button"
            onClick={() => {
              setMasterLeaveOpen(false);
              void del();
            }}
            style={st('min-height:52px;padding:0 16px;border:none;background:var(--surf);color:var(--danger);text-align:left;font:600 14.5px var(--font-ui)')}
          >
            {t('room.settings.deleteRoom')}
          </button>
        </Group>
      </Dialog>
    )}
    {spinOpen && <RoomSpinSettingsDialog room={room} patch={patch} onClose={() => setSpinOpen(false)} />}
    </>
  );
}
