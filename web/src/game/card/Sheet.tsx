import type { ReactNode } from 'react';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** A sheet over the card: on a phone a bottom sheet with a dimmed, blurred backdrop; on desktop a popover anchored to the
 * bottom of the modal (status on the left, everything else on the right) so it never clips at the top. It lives inside the
 * card, not in its own dialog, so the card behind stays where it is. */
export function Sheet({ title, desktop, side = 'right', onClose, children }: { title: string; desktop: boolean; side?: 'left' | 'right'; onClose: () => void; children: ReactNode }) {
  const t = useT();
  const header = (
    <div style={st('display:flex;align-items:center;gap:10px;padding:0 4px')}>
      <span style={st('flex:1;min-width:0;font:700 20px var(--font-display);letter-spacing:-0.02em')}>{title}</span>
      <button type="button" onClick={onClose} aria-label={t('common.close')} style={st('width:34px;height:34px;flex-shrink:0;border-radius:50%;border:none;background:var(--chip);color:var(--text);font-size:18px;line-height:1')}>
        ×
      </button>
    </div>
  );
  const body = <div style={st('display:flex;flex-direction:column;gap:12px;padding:16px 14px 18px;background:var(--sheet)')}>{header}{children}</div>;

  if (desktop) {
    return (
      <>
        <div role="presentation" onClick={onClose} style={st('position:absolute;inset:0;z-index:4')} />
        <div
          role="dialog"
          aria-label={title}
          style={st(
            `position:absolute;z-index:5;bottom:20px;${side}:28px;width:${side === 'left' ? 380 : 400}px;max-height:calc(100% - 40px);overflow-y:auto;border-radius:20px;border:1px solid var(--line);box-shadow:0 24px 60px oklch(0 0 0 / 0.6);background:var(--sheet)`,
          )}
        >
          {body}
        </div>
      </>
    );
  }
  return (
    <div style={st('position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:oklch(0 0 0 / 0.5);backdrop-filter:blur(3px)')}>
      <div role="presentation" onClick={onClose} style={st('flex:1;min-height:40px')} />
      <div role="dialog" aria-label={title} style={st('border-radius:24px 24px 0 0;overflow:hidden;max-height:calc(100% - 40px);overflow-y:auto;background:var(--sheet)')}>
        {body}
      </div>
    </div>
  );
}

/** Every sheet the card can open over itself. `status` is the Status picker; the rest are menus. */
export type SheetKind = 'status' | 'price' | 'alert' | 'after' | 'dlc' | 'ttb' | 'specs' | 'more' | 'journal' | 'tags' | 'achievements' | 'series' | 'fix' | 'related' | 'history';
