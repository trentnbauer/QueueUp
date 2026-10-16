import { useState, type ReactNode } from 'react';
import type { LobbyGameView } from '../../lobbyGames';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { keycapOf } from './keycaps';

/** Holding a game control is not a text selection or a long press: the prefixed forms are what iOS Safari reads. */
export const NO_SELECT: React.CSSProperties = { WebkitUserSelect: 'none', WebkitTouchCallout: 'none', WebkitTapHighlightColor: 'transparent' };

interface ButtonSpec {
  key: string;
  label: ReactNode;
  keycap: string;
  primary: boolean;
  /** A big arrow glyph rather than a word. */
  glyph?: boolean;
  props: Record<string, unknown>;
}

/** One control: a big pill with a keyboard hint, pressed in while a finger or key is on it. */
function ControlButton({ spec, phone }: { spec: ButtonSpec; phone: boolean }) {
  const [pressed, setPressed] = useState(false);
  const { onPointerDown, onPointerUp, onPointerCancel, ...rest } = spec.props as {
    onPointerDown?: (e: React.PointerEvent<HTMLButtonElement>) => void;
    onPointerUp?: () => void;
    onPointerCancel?: () => void;
  };
  const height = phone ? 64 : 56;
  const radius = phone ? 20 : 16;
  const size = spec.glyph ? (phone ? 22 : 20) : phone ? 19 : 16;
  const base = `height:${height}px;border-radius:${radius}px;display:flex;align-items:center;justify-content:center;gap:10px;touch-action:none;user-select:none;transition:transform .08s;transform:scale(${pressed ? 0.97 : 1})`;
  const look = spec.primary
    ? `border:none;background:var(--acc);color:var(--ink);font:800 ${size}px var(--font-display);box-shadow:0 8px 24px var(--accA35)`
    : `border:1px solid var(--chip);background:var(--surf2);color:var(--text);font:700 ${size}px var(--font-ui)`;
  const keycap = `font:600 10.5px var(--font-mono);padding:3px 6px;border-radius:6px;background:${spec.primary ? 'oklch(0 0 0 / 0.14)' : 'oklch(0 0 0 / 0.25)'};color:${spec.primary ? 'var(--ink)' : 'var(--muted)'}`;
  return (
    <button
      type="button"
      {...rest}
      onPointerDown={(e) => {
        setPressed(true);
        onPointerDown?.(e);
      }}
      onPointerUp={() => {
        setPressed(false);
        onPointerUp?.();
      }}
      onPointerCancel={() => {
        setPressed(false);
        onPointerCancel?.();
      }}
      // Holding a button must not start a text selection, the iOS callout or the long-press menu.
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      style={st(`${base};${look}`, NO_SELECT)}
    >
      {/* The label is not a target of its own: Chrome on Android starts a text selection from a long press on text. */}
      <span style={st('pointer-events:none;user-select:none', NO_SELECT)}>{spec.label}</span>
      {spec.keycap && !phone && <span style={st(keycap, { pointerEvents: 'none', userSelect: 'none', ...NO_SELECT })}>{spec.keycap}</span>}
    </button>
  );
}

/** The game's controls, built from what its view declares: a row of big buttons directly under the
 * arena (so both are in view at once on a phone). Secondary buttons are narrower than the primary one. */
export function Controls({
  view,
  phone,
  holdProps,
  onAction,
}: {
  view: LobbyGameView;
  phone: boolean;
  holdProps: (dx: number, dy: number) => Record<string, unknown>;
  onAction: (name: string) => void;
}) {
  const t = useT();
  // A game whose play space is the controller has nothing underneath the arena.
  if (view.taps) return null;
  const buttons: ButtonSpec[] = [];
  const left: ButtonSpec = { key: 'left', label: '◀', keycap: 'A', primary: false, glyph: true, props: holdProps(-1, 0) };
  const right: ButtonSpec = { key: 'right', label: '▶', keycap: 'D', primary: false, glyph: true, props: holdProps(1, 0) };
  const leftRight = view.pad === 'leftRight';
  for (const h of view.holds ?? []) {
    const cap = keycapOf(h.keys);
    buttons.push({ key: h.labelKey, label: !h.primary && phone ? t('spin.lobby.holdTo', { action: t(h.labelKey).toLowerCase() }) : t(h.labelKey), keycap: h.primary ? cap : t('spin.lobby.keycap.hold', { key: cap }), primary: !!h.primary, props: holdProps(h.dx, h.dy) });
  }
  for (const a of view.actions) {
    const cap = keycapOf(a.keys);
    buttons.push({
      key: a.name,
      label: t(a.labelKey),
      keycap: view.tapAction === a.name ? t('spin.lobby.keycap.orTap', { key: cap }) : cap,
      primary: true,
      props: { onPointerDown: () => onAction(a.name) },
    });
  }

  // With a left/right pad the arrows go either side of the other buttons, so a game's main button (Shove) sits
  // in the middle: < Shove >, with a thumb on each arrow and the button between.
  if (leftRight) {
    buttons.unshift(left);
    buttons.push(right);
  }

  return <div style={st(`display:grid;grid-template-columns:${buttons.map((b) => (b.primary ? '1.35fr' : '1fr')).join(' ') || '1fr'};gap:${phone ? 10 : 8}px`)}>{buttons.map((b) => <ControlButton key={b.key} spec={b} phone={phone} />)}</div>;
}
