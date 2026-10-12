import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { moderationApi } from '../api/moderation';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn, Collapsible } from '../ui/primitives';
import { st } from '../ui/st';
import { formatRelativeTime } from '../utils/relativeTime';
import { useT, type MessageKey } from '../i18n';

const ROW = 'display:flex;flex-direction:column;gap:6px;padding:12px 14px;background:var(--surf)';
const LIST = 'display:flex;flex-direction:column;gap:1px;border-radius:16px;overflow:hidden;background:var(--chip)';
const HEADING = 'font:700 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)';

/** Moderation (Administrator page): open reports about people, who is banned, and banned people's
 * requests to be unbanned. A report's person can be banned from right there; resolving a report,
 * banning and unbanning are all recorded in the audit log. */
export function AdminReports(): ReactNode {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: moderationApi.adminReports });
  const bans = useQuery({ queryKey: ['admin', 'bans'], queryFn: moderationApi.adminBans });
  const [banning, setBanning] = useState<{ id: string; name: string } | null>(null);
  const [banReason, setBanReason] = useState('');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'reports'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'bans'] });
  };
  const onError = (e: unknown) => ui.notify(e instanceof Error ? e.message : t('social.ban.admin.failed'));

  const resolve = useMutation({ mutationFn: moderationApi.resolveReport, onSuccess: refresh, onError });
  const unban = useMutation({
    mutationFn: (b: { userId: string; name: string }) => moderationApi.unban(b.userId),
    onSuccess: (_r, b) => {
      refresh();
      ui.notify(t('social.ban.admin.unbanned', { name: b.name }));
    },
    onError,
  });
  const ban = useMutation({
    mutationFn: (b: { id: string; name: string; reason: string }) => moderationApi.ban(b.id, b.reason),
    onSuccess: (_r, b) => {
      refresh();
      setBanning(null);
      setBanReason('');
      ui.notify(t('social.ban.admin.done', { name: b.name }));
    },
    onError,
  });
  const forceName = useMutation({ mutationFn: moderationApi.forceNameChange, onSuccess: () => { refresh(); ui.notify(t('social.report.admin.nameDone')); }, onError });
  const resetAvatar = useMutation({ mutationFn: moderationApi.resetAvatar, onSuccess: () => { refresh(); ui.notify(t('social.report.admin.avatarDone')); }, onError });
  async function askForceName(reportId: string, name: string) {
    const ok = await confirm({ title: t('social.report.admin.nameTitle', { name }), message: t('social.report.admin.nameMessage'), confirmLabel: t('social.report.admin.name'), danger: true });
    if (ok) forceName.mutate(reportId);
  }
  async function askResetAvatar(reportId: string, name: string) {
    const ok = await confirm({ title: t('social.report.admin.avatarTitle', { name }), message: t('social.report.admin.avatarMessage'), confirmLabel: t('social.report.admin.avatar'), danger: true });
    if (ok) resetAvatar.mutate(reportId);
  }
  const removeLink = useMutation({ mutationFn: moderationApi.removeProfileLink, onSuccess: () => { refresh(); ui.notify(t('social.report.admin.linkDone')); }, onError });
  const resetRoom = useMutation({ mutationFn: moderationApi.resetRoomName, onSuccess: () => { refresh(); ui.notify(t('social.report.admin.roomDone')); }, onError });
  const clearNote = useMutation({ mutationFn: moderationApi.clearReviewNote, onSuccess: () => { refresh(); ui.notify(t('social.report.admin.noteDone')); }, onError });
  async function askThen(title: string, message: string, confirmLabel: string, run: () => void) {
    if (await confirm({ title, message, confirmLabel, danger: true })) run();
  }
  const decline = useMutation({ mutationFn: moderationApi.declineUnban, onSuccess: refresh, onError });

  const rows = reports.data?.reports ?? [];
  const banned = bans.data?.bans ?? [];
  const requests = bans.data?.unbanRequests ?? [];
  const open = rows.length + requests.length;

  return (
    <Collapsible title={`${t('social.reports.title')}${open > 0 ? ` (${open})` : ''}`}>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.reports.hint')}</span>

      {requests.length > 0 && (
        <>
          <span style={st(HEADING)}>{t('social.ban.admin.requestsHeading')}</span>
          <div style={st(LIST)}>
            {requests.map((r) => (
              <div key={r.id} style={st(ROW)}>
                <div style={st('display:flex;align-items:center;gap:8px')}>
                  <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>{r.displayName}</span>
                  <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')}>{formatRelativeTime(r.createdAt)}</span>
                </div>
                <span style={st('font:400 13.5px/1.5 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{r.message}</span>
                <div style={st('display:flex;gap:8px')}>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: r.userId, name: r.displayName })}>
                    {t('social.ban.admin.unban')}
                  </Btn>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={decline.isPending} onClick={() => decline.mutate(r.id)}>
                    {t('social.ban.admin.decline')}
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {reports.data && rows.length === 0 && <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>{t('social.reports.empty')}</span>}
      {rows.length > 0 && (
        <div style={st(LIST)}>
          {rows.map((r) => (
            <div key={r.id} style={st(ROW)}>
              <div style={st('display:flex;align-items:center;gap:8px')}>
                <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>
                  {t('social.reports.line', { reporter: r.reporter.displayName, reported: r.reported.displayName })}
                </span>
                <span style={st('flex-shrink:0;font:400 12px var(--font-ui);color:var(--muted)')} title={new Date(r.createdAt).toLocaleString()}>
                  {formatRelativeTime(r.createdAt)}
                </span>
              </div>
              {r.reasons.length > 0 && (
                <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>
                  {r.reasons.map((x) => (
                    <span key={x} style={st('font:600 11.5px var(--font-ui);padding:3px 9px;border-radius:999px;background:var(--chip)')}>{t(`social.report.reason.${x}` as MessageKey)}</span>
                  ))}
                </div>
              )}
              {r.roomName && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('social.report.admin.aboutRoom', { name: r.roomName })}</span>}
              {r.reasons.includes('offensive_profile_link') && r.profileSlug && <span style={st('font:400 13px var(--font-ui);color:var(--muted)')}>{t('social.report.admin.aboutLink', { slug: r.profileSlug })}</span>}
              {r.reviewNote && <span style={st('font:italic 400 13px/1.45 var(--font-ui);color:var(--muted);overflow-wrap:anywhere')}>“{r.reviewNote}”</span>}
              {r.reason && <span style={st('font:400 13.5px/1.5 var(--font-ui);white-space:pre-wrap;overflow-wrap:anywhere')}>{r.reason}</span>}
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:8px')}>
                {r.reasons.includes('offensive_name') && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={forceName.isPending} onClick={() => void askForceName(r.id, r.reported.displayName)}>
                    {t('social.report.admin.name')}
                  </Btn>
                )}
                {r.reasons.includes('offensive_profile_link') && r.profileSlug && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={removeLink.isPending} onClick={() => void askThen(t('social.report.admin.linkTitle', { slug: r.profileSlug! }), t('social.report.admin.linkMessage'), t('social.report.admin.link'), () => removeLink.mutate(r.id))}>
                    {t('social.report.admin.link')}
                  </Btn>
                )}
                {r.reasons.includes('offensive_room_name') && r.roomId && r.roomName && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={resetRoom.isPending} onClick={() => void askThen(t('social.report.admin.roomTitle', { name: r.roomName! }), t('social.report.admin.roomMessage'), t('social.report.admin.room'), () => resetRoom.mutate(r.id))}>
                    {t('social.report.admin.room')}
                  </Btn>
                )}
                {r.reasons.includes('offensive_review_note') && r.reviewNote && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={clearNote.isPending} onClick={() => void askThen(t('social.report.admin.noteTitle', { name: r.reported.displayName }), t('social.report.admin.noteMessage'), t('social.report.admin.note'), () => clearNote.mutate(r.id))}>
                    {t('social.report.admin.note')}
                  </Btn>
                )}
                {r.reasons.includes('offensive_avatar') && (
                  <Btn kind="soft" height={32} padX={12} fontSize={12.5} disabled={resetAvatar.isPending} onClick={() => void askResetAvatar(r.id, r.reported.displayName)}>
                    {t('social.report.admin.avatar')}
                  </Btn>
                )}
                <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={resolve.isPending} onClick={() => resolve.mutate(r.id)}>
                  {t('social.reports.resolve')}
                </Btn>
                {r.reportedBanned ? (
                  <>
                    <span style={st('font:700 10px var(--font-mono);letter-spacing:0.06em;padding:2px 7px;border-radius:999px;background:var(--errBg);color:var(--danger)')}>{t('social.ban.admin.banned')}</span>
                    <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: r.reported.id, name: r.reported.displayName })}>
                      {t('social.ban.admin.unban')}
                    </Btn>
                  </>
                ) : (
                  <Btn kind="danger" height={32} padX={12} fontSize={12.5} onClick={() => setBanning({ id: r.reported.id, name: r.reported.displayName })}>
                    {t('social.ban.admin.action')}
                  </Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {banned.length > 0 && (
        <>
          <span style={st(HEADING)}>{t('social.ban.admin.heading')}</span>
          <div style={st(LIST)}>
            {banned.map((b) => (
              <div key={b.userId} style={st(ROW)}>
                <div style={st('display:flex;align-items:center;gap:8px')}>
                  <span style={st('flex:1;min-width:0;font:600 13.5px var(--font-ui);overflow-wrap:anywhere')}>
                    {t('social.ban.admin.since', { name: b.displayName, when: formatRelativeTime(b.bannedAt) })}
                  </span>
                  <Btn kind="ghost" height={32} padX={12} fontSize={12.5} disabled={unban.isPending} onClick={() => unban.mutate({ userId: b.userId, name: b.displayName })}>
                    {t('social.ban.admin.unban')}
                  </Btn>
                </div>
                {b.reason && <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted);overflow-wrap:anywhere')}>{b.reason}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <BlockedText />

      {banning && (
        <Dialog title={t('social.ban.admin.title', { name: banning.name })} onClose={() => setBanning(null)} width={440}>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.ban.admin.message')}</span>
          <textarea
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('social.ban.admin.reasonPlaceholder')}
            aria-label={t('social.ban.admin.reasonPlaceholder')}
            style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
          />
          <div style={st('display:flex;gap:8px')}>
            <Btn kind="danger" height={40} padX={18} disabled={ban.isPending} onClick={() => ban.mutate({ ...banning, reason: banReason })}>
              {t('social.ban.admin.confirm')}
            </Btn>
            <Btn kind="ghost" height={40} padX={14} disabled={ban.isPending} onClick={() => setBanning(null)}>
              {t('common.cancel')}
            </Btn>
          </div>
        </Dialog>
      )}
    </Collapsible>
  );
}

/** The blacklist (Administrator page): whole names nobody may use (added when a name, profile link or room
 * name is removed from a report), and banned words that no name, profile link, room name or review note
 * may contain. Words are matched ignoring case, spacing and punctuation, so keep them specific. */
function BlockedText(): ReactNode {
  const t = useT();
  const ui = useUi();
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ['admin', 'blocked-text'], queryFn: moderationApi.blockedText });
  const [word, setWord] = useState('');
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'blocked-text'] });
  const onError = (e: unknown) => ui.notify(e instanceof Error ? e.message : t('social.ban.admin.failed'));
  const add = useMutation({ mutationFn: moderationApi.addBannedWord, onSuccess: () => { setWord(''); refresh(); }, onError });
  const removeWord = useMutation({ mutationFn: moderationApi.removeBannedWord, onSuccess: refresh, onError });
  const removeName = useMutation({ mutationFn: moderationApi.removeBlockedName, onSuccess: refresh, onError });
  const words = data.data?.words ?? [];
  const names = data.data?.names ?? [];
  const chip = (key: string, label: string, onRemove: () => void) => (
    <span key={key} style={st('display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:999px;background:var(--chip);font:600 12.5px var(--font-ui)')}>
      {label}
      <button type="button" aria-label={t('social.blocked.admin.remove', { name: label })} onClick={onRemove} style={st('border:none;background:none;padding:0 4px;color:var(--muted);font:600 14px var(--font-ui)')}>
        ×
      </button>
    </span>
  );
  return (
    <>
      <span style={st(HEADING)}>{t('social.blocked.admin.words')}</span>
      <span style={st('font:400 13px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.blocked.admin.hint')}</span>
      <div style={st('display:flex;gap:8px')}>
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          maxLength={40}
          placeholder={t('social.blocked.admin.placeholder')}
          aria-label={t('social.blocked.admin.placeholder')}
          onKeyDown={(e) => e.key === 'Enter' && word.trim() && add.mutate(word)}
          style={st('flex:1;min-width:0;height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14px var(--font-ui)')}
        />
        <Btn kind="ghost" height={36} padX={14} fontSize={13} disabled={!word.trim() || add.isPending} onClick={() => add.mutate(word)}>
          {t('social.blocked.admin.add')}
        </Btn>
      </div>
      {words.length > 0 && <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>{words.map((w) => chip(w.normalized, w.example, () => removeWord.mutate(w.normalized)))}</div>}
      {names.length > 0 && (
        <>
          <span style={st(HEADING)}>{t('social.blocked.admin.names')}</span>
          <div style={st('display:flex;flex-wrap:wrap;gap:6px')}>{names.map((n) => chip(n.normalized, n.example, () => removeName.mutate(n.normalized)))}</div>
        </>
      )}
    </>
  );
}
