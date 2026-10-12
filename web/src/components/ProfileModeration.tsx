import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { moderationApi } from '../api/moderation';
import { useConfirm } from '../context/ConfirmContext';
import { useUi } from '../context/UiContext';
import { Btn } from '../ui/primitives';
import { useT } from '../i18n';
import { ReportDialog } from './ReportDialog';

/** Report and Block for someone else's profile page. Blocking asks first, then sends the person
 * home (their profile is no longer reachable); a report asks for the reasons, which only
 * administrators can read. */
export function ProfileModeration({ userId, name }: { userId: string; name: string }): ReactNode {
  const t = useT();
  const ui = useUi();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reporting, setReporting] = useState(false);

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

  return (
    <>
      <Btn kind="ghost" height={40} padX={14} fontSize={13.5} onClick={() => setReporting(true)}>
        {t('social.report.action')}
      </Btn>
      <Btn kind="ghost" height={40} padX={14} fontSize={13.5} onClick={() => void block()}>
        {t('social.block.action')}
      </Btn>
      {reporting && (
        <ReportDialog target={{ kind: 'person', userId }} title={t('social.report.title', { name })} canBlock onClose={() => setReporting(false)} onSent={(alsoBlock) => alsoBlock && afterBlock()} />
      )}
    </>
  );
}
