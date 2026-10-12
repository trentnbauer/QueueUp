import { useState, type ReactNode } from 'react';
import type { ReportReason } from '@queueup/shared';
import { moderationApi } from '../api/moderation';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const MAX_REASON = 1000;

/** The ready-made reasons that make sense for each thing that can be reported. */
export const REPORT_REASONS_FOR = {
  person: ['offensive_name', 'offensive_avatar', 'offensive_profile_link', 'harassment', 'spam', 'inappropriate_content', 'other'],
  room: ['offensive_room_name', 'spam', 'inappropriate_content', 'other'],
  review: ['offensive_review_note', 'spam', 'inappropriate_content', 'other'],
} as const satisfies Record<string, readonly ReportReason[]>;

export type ReportTarget = { kind: 'person'; userId: string } | { kind: 'room'; roomId: string } | { kind: 'review'; userId: string; reviewGameId: string };

/** Report a person, a room or a review note: tick the reasons that fit and/or write a few words. Only
 * administrators read it. `onSent` gets whether the person also asked to block them. */
export function ReportDialog({ target, title, canBlock = false, onClose, onSent }: { target: ReportTarget; title: string; canBlock?: boolean; onClose: () => void; onSent?: (alsoBlock: boolean) => void }): ReactNode {
  const t = useT();
  const ui = useUi();
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [reason, setReason] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      await moderationApi.report({
        ...(target.kind === 'room' ? { roomId: target.roomId } : { userId: target.userId }),
        ...(target.kind === 'review' && { reviewGameId: target.reviewGameId }),
        reasons,
        reason: reason.trim(),
        alsoBlock: canBlock && alsoBlock,
      });
      ui.notify(t('social.report.sent'));
      onClose();
      onSent?.(canBlock && alsoBlock);
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : t('social.report.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose} width={440}>
      <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.report.hint')}</span>
      <div style={st('display:flex;flex-direction:column;gap:6px')}>
        {REPORT_REASONS_FOR[target.kind].map((r) => (
          <label key={r} style={st('display:flex;align-items:center;gap:8px;font:400 14px var(--font-ui)')}>
            <input type="checkbox" checked={reasons.includes(r)} onChange={() => setReasons((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))} />
            {t(`social.report.reason.${r}` as MessageKey)}
          </label>
        ))}
      </div>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={MAX_REASON}
        rows={4}
        placeholder={t('social.report.placeholder')}
        aria-label={t('social.report.placeholder')}
        style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
      />
      {canBlock && (
        <label style={st('display:flex;align-items:center;gap:8px;font:400 14px var(--font-ui)')}>
          <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
          {t('social.report.alsoBlock')}
        </label>
      )}
      <div style={st('display:flex;gap:8px')}>
        <Btn height={40} padX={18} disabled={busy || (!reason.trim() && reasons.length === 0)} onClick={() => void send()}>
          {t('social.report.submit')}
        </Btn>
        <Btn kind="ghost" height={40} padX={14} disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </Btn>
      </div>
    </Dialog>
  );
}
