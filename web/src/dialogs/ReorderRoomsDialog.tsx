import { useRooms } from '../hooks/useRooms';
import { useUi } from '../context/UiContext';
import { Dialog } from '../ui/Dialog';
import { Group } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const ARROW = 'width:36px;height:36px;flex-shrink:0;border-radius:10px;border:none;background:var(--chip);color:var(--text);font:600 15px/1 var(--font-ui);padding:0';

/** Move rooms up and down to set the order they appear in the sidebar and top bar. Saved per person, as you go. */
export function ReorderRoomsDialog() {
  const t = useT();
  const ui = useUi();
  const { rooms, reorderRooms } = useRooms();
  // Rooms an administrator is only managing aren't memberships, so there's nothing to order.
  const own = rooms.filter((r) => !r.adminManagedUntil);

  function move(from: number, to: number) {
    const ids = own.map((r) => r.id);
    ids.splice(to, 0, ...ids.splice(from, 1));
    reorderRooms.mutate(ids, { onError: (err) => ui.notify(err instanceof Error ? err.message : t('shell.reorderRooms.saveFailed'), undefined, undefined, true) });
  }

  return (
    <Dialog onClose={() => ui.closeDialog('reorderRooms')} title={t('shell.sidebar.reorderRooms')} width={460}>
      <span style={st('font:400 12.5px/1.45 var(--font-ui);color:var(--muted)')}>{t('shell.reorderRooms.hint')}</span>
      <Group>
        {own.map((r, i) => (
          <div key={r.id} style={st('display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 10px 8px 16px;background:var(--surf)')}>
            <span aria-hidden style={st(`width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${r.accentColor}`)} />
            <span style={st('flex:1;min-width:0;font:600 14.5px var(--font-ui);overflow-wrap:anywhere')}>{r.name}</span>
            <button type="button" style={st(ARROW, i === 0 ? { opacity: 0.35 } : {})} disabled={i === 0} aria-label={t('shell.reorderRooms.moveUp', { name: r.name })} onClick={() => move(i, i - 1)}>
              ↑
            </button>
            <button type="button" style={st(ARROW, i === own.length - 1 ? { opacity: 0.35 } : {})} disabled={i === own.length - 1} aria-label={t('shell.reorderRooms.moveDown', { name: r.name })} onClick={() => move(i, i + 1)}>
              ↓
            </button>
          </div>
        ))}
      </Group>
    </Dialog>
  );
}
