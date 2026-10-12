import type { User } from '@queueup/shared';

/** Only the columns toUserDto reads. The User row is wide (settings, encrypted keys, sync tokens), so a
 * relation that is only shown as a person loads these instead of the whole row. */
export const userDtoSelect = { id: true, displayName: true, avatarColor: true, avatarUrl: true, isAdmin: true } as const;

export function toUserDto(user: {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}): User {
  return {
    id: user.id,
    displayName: user.displayName,
    avatarColor: user.avatarColor,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
  };
}
