interface LogoProps {
  size?: number;
  className?: string;
}

/** The app's mark: a bar-plus-triangle "skip to next" glyph on a squared accent-color tile -
 * literally "what's up next in the queue," which is the app's whole premise. Kept as inline SVG
 * (rather than an <img>) so it always renders in the current accent color and never needs a
 * network round trip - the same shape is exported standalone as web/public/favicon.svg for the
 * browser tab/bookmarks, where an actual file is required. Keep the two in sync by hand if this
 * mark ever changes; there's no build step tying them together. */
export function Logo({ size = 40, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="QueueUp"
    >
      <rect x="4" y="4" width="56" height="56" rx="12" fill="var(--qu-accent)" />
      <rect x="17" y="18" width="6" height="28" rx="3" fill="var(--qu-accent-text)" />
      <path d="M29 18 L29 46 L47 32 Z" fill="var(--qu-accent-text)" />
    </svg>
  );
}
