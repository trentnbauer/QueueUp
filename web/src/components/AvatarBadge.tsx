import { contrastTextColor } from '../utils/color';

interface AvatarBadgeProps {
  name: string;
  color: string;
  avatarUrl?: string | null;
  size?: number;
  title?: string;
}

export function AvatarBadge({ name, color, avatarUrl, size = 28, title }: AvatarBadgeProps) {
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flex: 'none',
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        title={title ?? name}
        style={{ ...baseStyle, objectFit: 'cover' }}
      />
    );
  }

  return (
    <div
      title={title ?? name}
      style={{
        ...baseStyle,
        background: color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: contrastTextColor(color),
        fontWeight: 700,
        fontSize: size * 0.42,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}
