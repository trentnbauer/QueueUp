import { useNavigate } from 'react-router';
import { useScope } from '../context/ScopeContext';
import { useUi, type DialogKey } from '../context/UiContext';
import { Kicker, Row, RowGroup } from '../game/card/ui';
import { useAiActivity } from '../hooks/useAiActivity';
import { useLibraryCleanupCount } from '../hooks/usePendingImports';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** The AI button: one menu for everything AI can do for this room or library. Each entry opens the tool it names; the tools say
 * for themselves when an AI provider still needs setting up. */
export function AiMenuDialog() {
  const t = useT();
  const ui = useUi();
  const navigate = useNavigate();
  const { isShelf } = useScope();
  const cleanup = useLibraryCleanupCount();
  const scanningDuplicates = useAiActivity('duplicates');

  /** Close the menu, then open what was picked. */
  const open = (key: DialogKey, payload?: { query?: string }) => () => {
    ui.closeDialog('aiMenu');
    if (key === 'add') ui.openDialog('add', payload ?? {});
    else ui.openDialog(key);
  };
  const count = (n: number) => (n > 0 ? String(n) : undefined);

  return (
    <Dialog onClose={() => ui.closeDialog('aiMenu')} title={t('ai.menu.title')} gap={14}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted);padding:0 4px')}>{isShelf ? t('ai.menu.hintShelf') : t('ai.menu.hintRoom')}</span>

      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <Kicker>{t('ai.menu.decide')}</Kicker>
        <RowGroup radius={16}>
          <Row icon="🎲" label={isShelf ? t('ai.menu.recommendShelf') : t('ai.menu.recommendRoom')} sub={isShelf ? t('ai.menu.recommendShelfSub') : t('ai.menu.recommendRoomSub')} onClick={open('aiTonight')} />
          <Row icon="✨" label={t('ai.menu.discover')} sub={t('ai.menu.discoverSub')} onClick={open('add')} />
        </RowGroup>
      </div>

      {isShelf && (
        <div style={st('display:flex;flex-direction:column;gap:8px')}>
          <Kicker>{t('ai.menu.library')}</Kicker>
          <RowGroup radius={16}>
            <Row
              icon="🧩"
              label={t('ai.menu.duplicates')}
              sub={scanningDuplicates ? t('settings.me.duplicates.scanning') : t('ai.menu.duplicatesSub')}
              value={count(cleanup.duplicates)}
              valueColor="var(--accText)"
              onClick={open('duplicates')}
            />
            <Row icon="🔗" label={t('ai.menu.match')} sub={t('ai.menu.matchSub')} value={count(cleanup.pending)} valueColor="var(--accText)" onClick={open('needsReview')} />
            <Row icon="🙈" label={t('ai.menu.adult')} sub={t('ai.menu.adultSub')} onClick={open('sensitiveGames')} />
          </RowGroup>
        </div>
      )}

      <div style={st('display:flex;flex-direction:column;gap:8px')}>
        <Kicker>{t('ai.menu.setup')}</Kicker>
        <RowGroup radius={16}>
          <Row
            icon="⚙️"
            label={t('ai.menu.settings')}
            sub={t('ai.menu.settingsSub')}
            onClick={() => {
              ui.closeDialog('aiMenu');
              navigate('/settings/ai');
            }}
          />
        </RowGroup>
      </div>
    </Dialog>
  );
}
