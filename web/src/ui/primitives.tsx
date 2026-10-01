import type { CSSProperties, ReactNode } from 'react';
import { st } from './st';

// ---------------------------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------------------------

/** "queueup" wordmark: Bricolage 800, "queue" sits lower (top-aligned via padding) and "up" is the
 * raised accent. `size` is the font size in px. */
export function Wordmark({ size = 23, color }: { size?: number; color?: string }) {
  return (
    <span
      style={st(`display:flex;align-items:flex-start;font:800 ${size}px/1 var(--font-display);letter-spacing:-0.045em;color:${color ?? 'var(--text)'}`)}
    >
      <span style={{ paddingTop: Math.round(size * 0.26) }}>queue</span>
      <span style={{ color: 'var(--acc)' }}>up</span>
    </span>
  );
}

/** The "qu" app mark: a dark tile with "q" and a raised accent "u". */
export function AppMark({ size = 46 }: { size?: number }) {
  return (
    <span
      style={st(
        `width:${size}px;height:${size}px;flex-shrink:0;border-radius:${Math.round(size * 0.22)}px;background:#231d19;display:flex;align-items:center;justify-content:center`,
      )}
    >
      <span
        style={st(`display:flex;align-items:flex-start;font:800 ${Math.round(size * 0.46)}px/1 var(--font-display);letter-spacing:-0.05em;color:#f3efe9`)}
      >
        <span style={{ paddingTop: Math.round(size * 0.13) }}>q</span>
        <span style={{ color: 'var(--acc)' }}>u</span>
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Icons (inline SVG line icons, stroke 1.8)
// ---------------------------------------------------------------------------------------------

export function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: 1.8 }} aria-hidden="true">
      <path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  );
}

export function PulseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: 1.8 }} aria-hidden="true">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

export function CollapseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ strokeWidth: 2 }} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
      <path d="M16 10l-2 2 2 2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------
// Avatars and covers
// ---------------------------------------------------------------------------------------------

/** Up to two letters for an avatar or room tile, taken from letters and digits only - symbols and
 * punctuation ("Trent & Grace", "Co-op Night") are skipped rather than shown. Apostrophes are dropped
 * first so "Trent's Room" reads TR, not TS. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/['\u2019]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();
  return (Array.from(words[0])[0] + Array.from(words[1])[0]).toUpperCase();
}

interface AvatarProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: number;
  /** Extra declarations appended to the circle's style (e.g. overlap margin + border). */
  style?: CSSProperties;
  fontSize?: number;
  title?: string;
}

export function Avatar({ name, color, avatarUrl, size = 36, style, fontSize, title }: AvatarProps) {
  const base = st(
    `width:${size}px;height:${size}px;flex-shrink:0;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:600 ${fontSize ?? Math.round(size * 0.39)}px var(--font-ui);overflow:hidden`,
    style,
  );
  if (avatarUrl) {
    return (
      <span title={title ?? name} style={base}>
        <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }
  return (
    <span title={title ?? name} style={base}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

function hueOf(title: string): number {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** Deterministic gradient fallback for a cover, generated from a hash of the title. */
export function coverGradient(title: string): string {
  const h = hueOf(title);
  return `radial-gradient(120% 80% at 20% 10%, oklch(0.6 0.12 ${h} / 0.55), transparent 60%), linear-gradient(160deg, oklch(0.42 0.09 ${h}), oklch(0.22 0.05 ${(h + 50) % 360}))`;
}

/** CSS `background` value for a cover: the real image if there is one, laid over the gradient. */
/** IGDB serves each cover at several fixed sizes, picked by the `t_*` segment of the URL. */
export type CoverSize = 'small' | 'big' | 'big_2x';

const IGDB_SIZE_SEGMENT = /\/t_[a-z0-9_]+\//;

/** Rewrites an IGDB cover URL to the given size, so a 40px list thumbnail doesn't download the
 * same 264px image as a grid tile. Non-IGDB URLs pass through unchanged. */
export function sizedCoverUrl(url: string, size: CoverSize): string {
  if (!url.includes('images.igdb.com/')) return url;
  return url.replace(IGDB_SIZE_SEGMENT, `/t_cover_${size}/`);
}

/** Smallest IGDB size that stays sharp at `width` CSS px on a 2x screen (small 90px, big 264px). */
export function coverSizeFor(width: number | string | undefined): CoverSize {
  if (typeof width !== 'number') return 'big';
  if (width * 2 <= 90) return 'small';
  if (width * 2 <= 264) return 'big';
  return 'big_2x';
}

export function coverBg(title: string, url?: string | null, size: CoverSize = 'big'): string {
  const grad = coverGradient(title);
  return url ? `url("${sizedCoverUrl(url, size)}") center/cover no-repeat, ${grad}` : grad;
}

/** 2:3 cover tile. `width` is in px; the aspect ratio does the rest. */
export function Cover({
  title,
  url,
  width,
  radius = 9,
  style,
  children,
}: {
  title: string;
  url?: string | null;
  width?: number | string;
  radius?: number;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <span
      style={{
        width,
        aspectRatio: '2/3',
        flexShrink: 0,
        borderRadius: radius,
        background: coverBg(title, url, coverSizeFor(width)),
        display: 'block',
        position: 'relative',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Small building blocks used across screens
// ---------------------------------------------------------------------------------------------

/** Mono, uppercase section label ("ROOMS · 3"). */
export function Kicker({ children, size = 12, spacing = '0.06em', color = 'var(--muted)', weight = 600, style }: {
  children: ReactNode;
  size?: number;
  spacing?: string;
  color?: string;
  weight?: number;
  style?: CSSProperties;
}) {
  return (
    <span style={{ font: `${weight} ${size}px var(--font-mono)`, letterSpacing: spacing, color, ...style }}>{children}</span>
  );
}

type BtnKind = 'text' | 'accent' | 'outline' | 'ghost' | 'danger' | 'soft';

const BTN: Record<BtnKind, string> = {
  text: 'border:none;background:var(--text);color:var(--onText)',
  accent: 'border:none;background:var(--acc);color:var(--ink)',
  outline: 'border:1px solid var(--line);background:transparent;color:var(--text)',
  ghost: 'border:none;background:none;color:var(--muted)',
  danger: 'border:none;background:var(--dangerBtn);color:#fff',
  soft: 'border:none;background:var(--accSoft2);color:var(--accText)',
};

interface BtnProps {
  kind?: BtnKind;
  height?: number;
  padX?: number;
  fontSize?: number;
  weight?: number;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  style?: CSSProperties;
  children: ReactNode;
  ariaLabel?: string;
  hover?: boolean;
}

/** Pill button in the design's five flavours. */
export function Btn({ kind = 'outline', height = 40, padX = 18, fontSize = 13.5, weight = 600, onClick, disabled, type = 'button', style, children, ariaLabel, hover }: BtnProps) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={hover && kind === 'outline' ? 'hv-surf' : undefined}
      style={st(
        `flex-shrink:0;height:${height}px;padding:0 ${padX}px;border-radius:999px;font:${weight} ${fontSize}px var(--font-ui);${BTN[kind]};${disabled ? 'opacity:0.4;cursor:default' : ''}`,
        style,
      )}
    >
      {children}
    </button>
  );
}

/** Segmented control (pill track, filled selected segment). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  height = 38,
  fontSize = 13,
  columns,
  style,
}: {
  options: { value: T; label: ReactNode; badge?: number }[];
  value: T;
  onChange: (v: T) => void;
  height?: number;
  fontSize?: number;
  columns?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      role="tablist"
      style={st(
        `display:${columns ? 'grid' : 'flex'};${columns ? `grid-template-columns:repeat(${columns},1fr);` : ''}gap:2px;padding:4px;border-radius:999px;background:var(--surf)`,
        style,
      )}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            style={st(
              `flex:1 1 0;height:${height}px;border:none;border-radius:999px;background:${on ? 'var(--text)' : 'transparent'};color:${on ? 'var(--onText)' : 'var(--muted)'};font:600 ${fontSize}px var(--font-ui);display:flex;align-items:center;justify-content:center;gap:5px;white-space:nowrap;padding:0 10px`,
            )}
          >
            {o.label}
            {!!o.badge && (
              <span style={st('min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--acc);color:var(--ink);font:700 10.5px var(--font-ui);display:flex;align-items:center;justify-content:center')}>
                {o.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pill chips (single-select or multi-select), selected = filled with --text. */
export function ChipToggle({ on, onClick, children, height = 34, fontSize = 13, padX = 14, style }: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  height?: number;
  fontSize?: number;
  padX?: number;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={st(
        `flex-shrink:0;height:${height}px;padding:0 ${padX}px;border-radius:999px;border:none;background:${on ? 'var(--text)' : 'var(--chip)'};color:${on ? 'var(--onText)' : 'var(--muted)'};font:600 ${fontSize}px var(--font-ui)`,
        style,
      )}
    >
      {children}
    </button>
  );
}

/** On/off toggle switch (track + knob). */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      style={st(
        `flex-shrink:0;width:48px;height:28px;border-radius:999px;border:none;padding:3px;background:${on ? 'var(--acc)' : 'var(--surf2)'};display:flex;justify-content:${on ? 'flex-end' : 'flex-start'};${disabled ? 'opacity:0.5' : ''}`,
      )}
    >
      <span style={st(`width:22px;height:22px;border-radius:50%;background:${on ? '#fff' : 'var(--muted)'}`)} />
    </button>
  );
}

/** Error / warning / info banner with a round badge. */
export function Banner({ kind = 'error', children, onDismiss }: { kind?: 'error' | 'warn'; children: ReactNode; onDismiss?: () => void }) {
  const err = kind === 'error';
  return (
    <div
      role={err ? 'alert' : 'status'}
      style={st(
        `display:flex;align-items:flex-start;gap:10px;padding:12px ${onDismiss ? 8 : 14}px 12px 14px;border-radius:16px;background:${err ? 'var(--errBg)' : 'var(--warnBg)'};border:1px solid ${err ? 'var(--errLine)' : 'var(--warnLine)'};color:var(--text)`,
      )}
    >
      <span
        style={st(
          `flex-shrink:0;width:20px;height:20px;border-radius:50%;background:${err ? 'var(--errBadge)' : 'var(--warnBadge)'};color:${err ? '#fff' : 'oklch(0.25 0.05 85)'};display:flex;align-items:center;justify-content:center;font:700 12px var(--font-ui);margin-top:1px`,
        )}
      >
        !
      </span>
      <span style={st('flex:1;min-width:0;font:500 13.5px/1.45 var(--font-ui);text-wrap:pretty')}>{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          style={st('width:30px;height:30px;flex-shrink:0;border-radius:50%;border:none;background:transparent;color:var(--muted);font-size:17px;line-height:1;margin-top:-5px')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Rounded list group: rows separated by 1px chip-coloured gaps. */
export function Group({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={st('display:flex;flex-direction:column;gap:1px;flex-shrink:0;border-radius:18px;overflow:hidden;background:var(--chip)', style)}>
      {children}
    </div>
  );
}

/** Text input in the design's pill style. */
export const inputPill = 'height:44px;padding:0 16px;border-radius:999px;background:var(--surf);border:1px solid var(--chip);color:var(--text);font-size:15px;outline:none';
export const inputField = 'height:44px;padding:0 14px;border-radius:999px;background:var(--bg);border:1px solid var(--line);color:var(--text);font-size:15px;outline:none';
