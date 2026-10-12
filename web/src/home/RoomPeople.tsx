import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomRole } from '@queueup/shared';
import { gameSuggestionsApi, roomsApi } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { FriendStatus, ROLE_LABEL } from '../dialogs/RoomDialogs';
import { useFriends } from '../hooks/useFriends';
import { Dialog } from '../ui/Dialog';
import { Avatar, Banner, Btn, Cover, Group, Kicker, inputPill } from '../ui/primitives';
import { st } from '../ui/st';
import { getBasePath } from '../utils/basePath';
import { useT } from '../i18n';

const MEMBER_PREVIEW = 6;

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
  );
}

/** A room's People tab: the invite code, games suggested for approval (managers), and the members,
 * with role changes and removal for managers. */
export function RoomPeople() {
  const scope = useScope();
  const ui = useUi();
  const t = useT();
  const { user } = useAuth();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const friends = useFriends();
  const { room, members, canManage, suggestions } = scope;
  const canInvite = canManage || room?.invitePermission === 'members';
  const roomId = room?.id ?? '';
  const isMaster = room?.myRole === 'room_master';

  const [addFriendsOpen, setAddFriendsOpen] = useState(false);
  const [memberQ, setMemberQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const candidates = useQuery({ queryKey: ['room-invite-candidates', roomId], queryFn: () => roomsApi.inviteCandidates(roomId), enabled: !!room && canInvite && addFriendsOpen });
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

  const q = memberQ.trim().toLowerCase();
  const filtered = members.filter((m) => !q || m.user.displayName.toLowerCase().includes(q));
  const shown = q || showAll ? filtered : filtered.slice(0, MEMBER_PREVIEW);

  return (
    <>
      {error && <Banner onDismiss={() => setError(null)}>{error}</Banner>}

      {canInvite && (
        <Section label={t('room.settings.inviteLabel')}>
          <div style={st('max-width:560px;display:flex;align-items:center;gap:8px;padding:10px 10px 10px 16px;border-radius:16px;background:var(--surf)')}>
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
        </Section>
      )}

      {canManage && suggestions.length > 0 && (
        <Section label={t('room.settings.suggestedLabel', { n: suggestions.length })}>
          <Group>
            {suggestions.map((s) => (
              <div key={s.id} style={st('display:flex;align-items:center;gap:10px;min-height:60px;padding:8px 10px 8px 12px;background:var(--surf)')}>
                <Cover title={s.title} url={s.coverImageUrl} width={32} radius={6} />
                <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px')}>
                  <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{s.title}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--muted)')}>{t('room.settings.suggestedBy', { name: s.suggestedBy.displayName })}</span>
                </div>
                <Btn
                  kind="ghost"
                  height={34}
                  padX={10}
                  fontSize={12.5}
                  onClick={async () => {
                    const ok = await confirm({ title: t('room.settings.declineSuggestionTitle', { title: s.title }), message: t('room.settings.declineSuggestionMessage'), confirmLabel: t('room.settings.decline'), danger: true });
                    if (ok) decline.mutate(s.id);
                  }}
                >
                  {t('room.settings.decline')}
                </Btn>
                <Btn kind="text" height={34} padX={12} fontSize={12.5} weight={700} disabled={approve.isPending} onClick={() => approve.mutate(s.id, { onSuccess: () => ui.notify(t('room.settings.added', { name: s.title })) })}>
                  {t('room.settings.approve')}
                </Btn>
              </div>
            ))}
          </Group>
        </Section>
      )}

      <Section label={t('room.settings.membersLabel', { n: members.length })}>
        {members.length > MEMBER_PREVIEW && (
          <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder={t('room.settings.findMember')} aria-label={t('room.settings.findMember')} style={st(inputPill, { height: 42, fontSize: 14.5, maxWidth: 560 })} />
        )}
        <Group>
          {shown.map((m) => {
            const editable = canManage && m.user.id !== user?.id && m.role !== 'room_master' && (isMaster || m.role === 'member');
            return (
              <div key={m.user.id} style={st('display:flex;align-items:center;gap:12px;min-height:58px;padding:8px 10px 8px 14px;background:var(--surf)')}>
                <Avatar name={m.user.displayName} color={m.user.avatarColor} avatarUrl={m.user.avatarUrl} size={32} fontSize={13} profileUserId={m.user.id === user?.id ? undefined : m.user.id} />
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
      </Section>

      {addFriendsOpen && (
        <Dialog onClose={() => setAddFriendsOpen(false)} title={t('room.settings.addFriendsTitle')} gap={12}>
          <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>{t('room.settings.addFriendsIntro', { room: room.name })}</span>
          {candidates.isLoading && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>}
          {!candidates.isLoading && (candidates.data?.users.length ?? 0) === 0 && <span style={st('font:500 14px/1.45 var(--font-ui)')}>{t('room.settings.addFriendsNone')}</span>}
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
    </>
  );
}
