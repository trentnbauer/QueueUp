import type { NotificationType } from '@prisma/client';
import { prisma } from '../db/client.js';

/** The notification types only administrators receive. */
export type AdminNotificationType = Extract<NotificationType, 'admin_report' | 'admin_unban_request' | 'admin_backup_failed'>;

/** Tells every administrator about something that needs them (a report, an unban request, a failed
 * backup). Each gets an ordinary direct notification, so it shows in their bell like any other.
 * Best effort: whatever raised it has already happened, so a failure here is only logged. */
export async function notifyAdmins(type: AdminNotificationType, message: string): Promise<void> {
  try {
    const admins = await prisma.user.findMany({ where: { isAdmin: true, bannedAt: null }, select: { id: true } });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((a) => ({ recipientId: a.id, roomName: 'Administration', type, message })),
    });
  } catch (err) {
    console.error('[adminNotifications] failed to notify administrators', err);
  }
}
