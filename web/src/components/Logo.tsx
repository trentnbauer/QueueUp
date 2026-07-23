interface LogoProps {
  size?: number;
  className?: string;
}

/** The app's mark: a bold "QU" monogram on a squared accent-color tile. Kept as inline SVG
 * (rather than an <img>) so it always renders in the current accent color and never needs a
 * network round trip - the same shape is exported standalone as web/public/favicon.svg for the
 * browser tab/bookmarks, where an actual file is required. Keep the two in sync by hand if this
 * mark ever changes; there's no build step tying them together. Arial/Helvetica rather than the
 * app's own Space Grotesk header font - a favicon file viewed outside the app (browser tab,
 * bookmarks, OS file browser) has no access to that webfont, so both places use the same
 * universally-available fallback rather than looking different depending on context. */
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
      <text
        x="32"
        y="43.5"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="900"
        fontSize="30"
        textAnchor="middle"
        fill="var(--qu-accent-text)"
      >
        QU
      </text>
    </svg>
  );
}
