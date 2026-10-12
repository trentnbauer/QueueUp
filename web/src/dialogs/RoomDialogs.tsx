import { ReportDialog } from '../components/ReportDialog';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ACCENT_COLOURS,
  DISCORD_EVENT_KEYS,
  ROOM_PLATFORM_LABELS,
  SPIN_WHEEL_THEMES,
  resolveDiscordEvents,
  type DiscordEventKey,
  type Room,
  type RoomPlatform,
  type RoomRole,
} from '@queueup/shared';
import { roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useFriends } from '../hooks/useFriends';
import { useRooms } from '../hooks/useRooms';
import { Dialog } from '../ui/Dialog';
import { NavRow } from './SettingsParts';
import { usePlayNextTab } from '../home/playNextTab';
import { RoomAiSection } from './RoomAiSection';
import { DeletedRoomsList } from './DeletedRooms';
import { Avatar, Banner, Btn, ChipToggle, Group, Segmented, Toggle, initialsOf, inputField } from '../ui/primitives';
import { st } from '../ui/st';
import { exportGames } from '../utils/exportGames';
import { rich, t as tr, useT, type MessageKey } from '../i18n';
import { discordEventLabel, liveMap, spinThemeHint, spinThemeLabel } from '../i18n/labels';

const PLATFORMS = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];
// The design's six room colours, as hex (room colours also feed Discord and other non-CSS-colour
// consumers, so they're stored as hex rather than the design's oklch strings).
/** Small mono heading for each row of Spin defaults. */
const DEFAULT_LABEL = 'font:600 11px var(--font-mono);letter-spacing:0.06em;color:var(--faint);margin-top:2px';

const ROOM_COLORS: string[] = [...ACCENT_COLOURS];
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
  const queryClient = useQueryClient();
  // #1103: rooms this person deleted (or was Room Master of) in the last 30 days, to restore.
  const deletedRooms = useQuery({ queryKey: ['deleted-rooms'], queryFn: () => roomsApi.deleted(), enabled: step === 'options' });

  async function restore(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { room } = await roomsApi.restore(id);
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      queryClient.invalidateQueries({ queryKey: ['deleted-rooms'] });
      close();
      navigate(`/room/${room.id}`);
      ui.notify(t('room.deleted.restored', { name: room.name }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('room.deleted.restoreError'));
    } finally {
      setBusy(null);
    }
  }
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
      {step === 'options' && <DeletedRoomsList rooms={deletedRooms.data?.rooms ?? []} busy={busy} onRestore={(r) => void restore(r.id)} />}
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
export const ROLE_LABEL = liveMap<RoomRole>((r) => tr(ROLE_KEY[r]));

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

/** The room's Discord hook-up: the webhook, the server invite link and which events get posted. */
function RoomDiscordDialog({ room, patch, onClose }: { room: Room; patch: (body: Parameters<typeof roomsApi.update>[1], toast?: string) => void; onClose: () => void }) {
  const t = useT();
  const [hook, setHook] = useState(room.discordWebhookUrl ?? '');
  const [discordInvite, setDiscordInvite] = useState(room.discordInviteUrl ?? '');
  const events = resolveDiscordEvents(room.discordEvents);
  const hasHook = !!room.discordWebhookUrl;
  const discordInviteValid = !discordInvite.trim() || /^https:\/\/(discord\.gg|(www\.)?discord(app)?\.com\/invite)\/[\w-]+\/?$/.test(discordInvite.trim());
  const hookValid = !hook.trim() || /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(hook.trim());
  return (
    <Dialog onClose={onClose} title={t('room.settings.discordRow')} gap={12}>
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
            <span style={st('font:500 14.5px var(--font-ui);padding-top:6px')}>{t('room.settings.discordInvite')}</span>
            <span style={st('font:400 12px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.discordInviteHint')}</span>
            <div style={st('display:flex;gap:8px')}>
              <input value={discordInvite} onChange={(e) => setDiscordInvite(e.target.value)} placeholder="https://discord.gg/…" aria-label={t('room.settings.discordInviteAria')} style={st(inputField, { flex: 1, minWidth: 0, height: 42, borderRadius: 12, fontSize: 13.5 })} />
              {discordInvite.trim() !== (room.discordInviteUrl ?? '') && (
                <Btn kind="text" height={42} padX={14} fontSize={13} weight={700} disabled={!discordInviteValid} onClick={() => patch({ discordInviteUrl: discordInvite.trim() || null }, discordInvite.trim() ? t('room.settings.inviteLinkSaved') : t('room.settings.inviteLinkRemoved'))}>
                  {t('common.save')}
                </Btn>
              )}
            </div>
            {!discordInviteValid && <span style={st('font:400 12px var(--font-ui);color:var(--danger)')}>{t('room.settings.discordInviteInvalid')}</span>}
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
    </Dialog>
  );
}

/** "Connected · 3 events" for the Discord row. */
function discordSummary(room: Room): string {
  if (!room.discordWebhookUrl) return room.discordInviteUrl ? tr('room.settings.discordInviteOnly') : tr('room.settings.discordOff');
  const n = DISCORD_EVENT_KEYS.filter((k) => resolveDiscordEvents(room.discordEvents)[k]).length;
  return tr(n === 1 ? 'room.settings.discordOn.one' : 'room.settings.discordOn.other', { n });
}

/** Who provides the room's AI (its section has the way into your own AI settings too). */
function RoomAiDialog({ roomId, canManage, onClose, onOpenProfile }: { roomId: string; canManage: boolean; onClose: () => void; onOpenProfile: () => void }) {
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('room.settings.aiRow')} gap={12}>
      <RoomAiSection roomId={roomId} canManage={canManage} onOpenProfile={onOpenProfile} />
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
  const { room, members, games, canManage } = scope;

  const [name, setName] = useState(room?.name ?? '');
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const [spinOpen, setSpinOpen] = useState(false);
  const [masterLeaveOpen, setMasterLeaveOpen] = useState(false);
  const [discordOpen, setDiscordOpen] = useState(false);
  const [roomAiOpen, setRoomAiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roomId = room?.id ?? '';
  const [playNextIn, setPlayNextIn] = usePlayNextTab(roomId || null);
  const isMaster = room?.myRole === 'room_master';
  const [reportingRoom, setReportingRoom] = useState(false);

  if (!room) return null;
  const close = () => ui.closeDialog('roomSettings');

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
      queryClient.invalidateQueries({ queryKey: ['deleted-rooms'] });
      close();
      navigate('/');
      ui.notify(t('room.settings.deleted'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('room.settings.deleteError'));
    }
  }

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

      {/* Members, the invite code and games waiting for approval live on the room's People tab. */}
      <div style={st('display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px dashed var(--line);border-radius:16px')}>
        <span style={st('flex:1;min-width:0;font:400 13.5px/1.45 var(--font-ui);color:var(--text2)')}>
          {rich(t('room.settings.peopleMoved'), { tab: <b style={st('color:var(--text)')}>{t('home.section.people')}</b> })}
        </span>
        <button
          type="button"
          onClick={() => {
            close();
            navigate(`/room/${roomId}/people`);
          }}
          style={st('flex-shrink:0;border:none;background:none;padding:0;color:var(--accText);font:600 13.5px var(--font-ui)')}
        >
          {t('room.settings.open')}
        </button>
      </div>

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
        </Field>
      )}

      {isMaster && (
        <Field label={t('room.settings.accessLabel')}>
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
        </Field>
      )}

      <Field label={t('room.settings.playLabel')}>
        <Group>
          {isMaster && <NavRow label={t('room.spin.title')} sub={spinSummary(room)} onClick={() => setSpinOpen(true)} />}
          {isMaster && <NavRow label={t('room.settings.discordRow')} sub={discordSummary(room)} onClick={() => setDiscordOpen(true)} />}
          <NavRow label={t('room.settings.aiRow')} sub={t('room.settings.aiRowSub')} onClick={() => setRoomAiOpen(true)} />
        </Group>
        <span style={st('font:500 14.5px var(--font-ui);padding-top:4px')}>{t('room.settings.playNextInTitle')}</span>
        <span style={st('font:400 13px/1.45 var(--font-ui);color:var(--muted)')}>{t('room.settings.playNextInHint')}</span>
        <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
          <ChipToggle on={playNextIn === 'playing'} height={36} onClick={() => setPlayNextIn('playing')}>{t('home.tab.playing')}</ChipToggle>
          <ChipToggle on={playNextIn === 'backlog'} height={36} onClick={() => setPlayNextIn('backlog')}>{t('home.tab.queue')}</ChipToggle>
        </div>
      </Field>

      <Field label={t('room.settings.exportLabel')}>
        <div style={st('display:flex;gap:8px')}>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'csv', 'squad-room')}>{t('room.settings.exportCsv')}</Btn>
          <Btn height={40} fontSize={13} onClick={() => exportGames(games, 'json', 'squad-room')}>{t('room.settings.exportJson')}</Btn>
        </div>
      </Field>

      <div style={st('display:flex;align-items:center;flex-wrap:wrap;gap:18px;padding-top:16px;border-top:1px solid var(--line)')}>
        {!isMaster && (
          <button type="button" onClick={() => setReportingRoom(true)} style={st('border:none;background:none;padding:0;font:600 13.5px var(--font-ui);color:var(--muted)')}>
            {t('social.report.room')}
          </button>
        )}
        {!isMaster && (
          <button type="button" onClick={leave} style={st('border:none;background:none;padding:0;font:600 13.5px var(--font-ui);color:var(--danger)')}>
            {t('room.settings.leaveRoom')}
          </button>
        )}
        {isMaster && members.some((m) => m.user.id === user?.id) && (
          <button type="button" onClick={() => setMasterLeaveOpen(true)} style={st('border:none;background:none;padding:0;font:600 13.5px var(--font-ui);color:var(--danger)')}>
            {t('room.settings.leaveRoom')}
          </button>
        )}
        {isMaster && (
          <button type="button" onClick={del} style={st('border:none;background:none;padding:0;font:600 13.5px var(--font-ui);color:var(--danger)')}>
            {t('room.settings.deleteRoom')}
          </button>
        )}
      </div>
    </Dialog>
    {reportingRoom && room && <ReportDialog target={{ kind: 'room', roomId }} title={t('social.report.roomTitle', { name: room.name })} onClose={() => setReportingRoom(false)} />}
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
    {discordOpen && <RoomDiscordDialog room={room} patch={patch} onClose={() => setDiscordOpen(false)} />}
    {roomAiOpen && (
      <RoomAiDialog
        roomId={roomId}
        canManage={canManage}
        onClose={() => setRoomAiOpen(false)}
        onOpenProfile={() => {
          setRoomAiOpen(false);
          close();
        }}
      />
    )}
    </>
  );
}
