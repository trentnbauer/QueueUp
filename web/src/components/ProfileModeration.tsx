import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { REPORT_REASONS, type ReportReason } from '@queueup/shared';
import { moderationApi } from '../api/moderation';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Btn } from '../ui/primitives';
import { st } from '../ui/st';
import { useT, type MessageKey } from '../i18n';

const MAX_REASON = 1000;

/** Report and Block for someone else's profile page. Blocking asks first, then sends the person
 * home (their profile is no longer reachable); a report asks for the reason, which only
 * administrators can read. */
export function ProfileModeration({ userId, name }: { userId: string; name: string }): ReactNode {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasons, setReasons] = useState<ReportReason[]>([]);
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  function afterBlock() {
    void queryClient.invalidateQueries({ queryKey: ['friends'] });
    void queryClient.invalidateQueries({ queryKey: ['blocks'] });
    ui.notify(t('social.block.done', { name }));
    navigate('/');
  }

  async function block() {
    const ok = await confirm({ title: t('social.block.title', { name }), message: t('social.block.message'), confirmLabel: t('social.block.action'), danger: true });
    if (!ok) return;
    try {
      await moderationApi.block(userId);
      afterBlock();
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : t('social.block.failed'));
    }
  }

  async function sendReport() {
    setBusy(true);
    try {
      await moderationApi.report({ userId, reasons, reason: reason.trim(), alsoBlock });
      ui.notify(t('social.report.sent'));
      setReporting(false);
      if (alsoBlock) afterBlock();
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : t('social.report.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Btn kind="ghost" height={40} padX={14} fontSize={13.5} onClick={() => setReporting(true)}>
        {t('social.report.action')}
      </Btn>
      <Btn kind="ghost" height={40} padX={14} fontSize={13.5} onClick={() => void block()}>
        {t('social.block.action')}
      </Btn>
      {reporting && (
        <Dialog title={t('social.report.title', { name })} onClose={() => setReporting(false)} width={440}>
          <span style={st('font:400 13.5px/1.5 var(--font-ui);color:var(--muted)')}>{t('social.report.hint')}</span>
          <div style={st('display:flex;flex-direction:column;gap:6px')}>
            {REPORT_REASONS.map((r) => (
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
            rows={5}
            placeholder={t('social.report.placeholder')}
            aria-label={t('social.report.placeholder')}
            style={st('width:100%;box-sizing:border-box;resize:vertical;padding:12px;border-radius:14px;border:1px solid var(--line);background:var(--surf);color:var(--text);font:400 14.5px/1.55 var(--font-ui)')}
          />
          <label style={st('display:flex;align-items:center;gap:8px;font:400 14px var(--font-ui)')}>
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} />
            {t('social.report.alsoBlock')}
          </label>
          <div style={st('display:flex;gap:8px')}>
            <Btn height={40} padX={18} disabled={busy || (!reason.trim() && reasons.length === 0)} onClick={() => void sendReport()}>
              {t('social.report.submit')}
            </Btn>
            <Btn kind="ghost" height={40} padX={14} disabled={busy} onClick={() => setReporting(false)}>
              {t('common.cancel')}
            </Btn>
          </div>
        </Dialog>
      )}
    </>
  );
}
