import type { CSSProperties, ReactNode } from 'react';
import { st } from '../../ui/st';

/** A scrim colour that works on any art, in either theme: the hero text is always white on this. */
export const SCRIM = 'oklch(0.15 0.01 55)';
/** The frosted dark pill used on top of art (close button, kicker, "Watch trailer"). */
export const FROSTED = `background:${SCRIM.replace(')', ' / 0.62)')};backdrop-filter:blur(8px)`;

/** Small mono section label ("THE JOURNEY", "PRICE SOURCE"). */
export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <span style={st('font:600 10.5px var(--font-mono);letter-spacing:0.06em;color:var(--faint);padding:0 4px', style)}>{children}</span>;
}

/** A rounded group of rows separated by hairlines. `flex-shrink:0` so a scroll column never squashes it. */
export function RowGroup({ children, columns = 1, radius = 18 }: { children: ReactNode; columns?: 1 | 2; radius?: number }) {
  return (
    <div
      style={st(
        `display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:1px;border-radius:${radius}px;overflow:hidden;background:var(--chip);flex-shrink:0`,
      )}
    >
      {children}
    </div>
  );
}

/** One tappable row: icon, label (+ optional accent sub line), a value on the right and a chevron. */
export function Row({
  icon,
  label,
  sub,
  value,
  valueColor = 'var(--muted)',
  onClick,
  dim,
  compact,
  chevron = true,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  value?: string;
  valueColor?: string;
  onClick: () => void;
  dim?: boolean;
  compact?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hv-surf2"
      style={st(
        `display:flex;align-items:center;gap:${compact ? 8 : 12}px;min-height:${compact ? 48 : 52}px;padding:0 ${compact ? 12 : 16}px;border:none;background:var(--surf);color:var(--text);text-align:left;opacity:${dim ? 0.5 : 1}`,
      )}
    >
      {icon !== undefined && <span style={st('width:20px;flex-shrink:0;text-align:center;font-size:15px')}>{icon}</span>}
      {/* The label keeps its width; a long value is what gives way (with an ellipsis). */}
      <span style={st(`flex:0 0 auto;max-width:70%;display:flex;flex-direction:column;gap:1px`)}>
        <span style={st(`font:600 ${compact ? 13.5 : 14}px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{label}</span>
        {sub && <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>{sub}</span>}
      </span>
      <span style={st('flex:1 1 0;min-width:0')} />
      {value && <span style={st(`flex:0 1 auto;min-width:0;font:500 ${compact ? 12.5 : 13}px var(--font-ui);color:${valueColor};text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{value}</span>}
      {chevron && <span aria-hidden style={st('flex-shrink:0;color:var(--faint);font-size:18px')}>›</span>}
    </button>
  );
}

/** The round frosted × (or ‹ Base game) sitting on the hero. */
export function HeroButton({ onClick, label, children, style }: { onClick: () => void; label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={st(`position:absolute;${FROSTED};border:none;color:#fff;`, style)}
    >
      {children}
    </button>
  );
}

/** A frosted pill: "ROOM · STATUS" kicker, "Watch trailer". */
export function FrostedPill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={st(`${FROSTED};display:flex;align-items:center;height:24px;padding:0 10px;border-radius:999px`, style)}>{children}</span>
  );
}

export const SECTION_TITLE = 'font:600 15px var(--font-display)';
