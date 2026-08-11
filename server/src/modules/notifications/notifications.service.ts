import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { superAdminNotifications, userNotifications } from '../../database/schema';
import { id } from '../../common/id';
import { apiError } from '../../common/exceptions';

export type NotificationType = (typeof superAdminNotifications.$inferInsert)['type'];
export type UserNotificationType = (typeof userNotifications.$inferInsert)['type'];

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface NotifyUserInput {
  type: UserNotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Fires and stores the events that populate the super-admin notification
 * bell. This is a @Global() module (see notifications.module.ts) so any
 * feature service — auth, restaurant, grocery, hotel, buses — can inject
 * it directly without importing the module.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  /**
   * Writes a notification row. Deliberately swallows its own errors —
   * a notification failing to write must never break the real business
   * action (a registration, a new restaurant, etc.) that triggered it.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.db.insert(superAdminNotifications).values({
        id: id('ntf'),
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      });
    } catch (err) {
      this.logger.error('Failed to write super-admin notification', err as Error);
    }
  }

  async list(limit = 20, offset = 0) {
    // Sequential, not Promise.all: three queries fired at once each grab their
    // own connection from the pool simultaneously, which is where this broke
    // — see the comment on listForUser below for the full story. One at a
    // time reuses a single connection and costs a few extra milliseconds,
    // which is nothing for a notification-bell fetch.
    const rows = await this.db
      .select()
      .from(superAdminNotifications)
      .orderBy(desc(superAdminNotifications.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(superAdminNotifications);
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*) filter (where ${superAdminNotifications.isRead} = false)::int` })
      .from(superAdminNotifications);

    return {
      items: rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      total,
      unread,
      limit,
      offset,
    };
  }

  async unreadCount() {
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*) filter (where ${superAdminNotifications.isRead} = false)::int` })
      .from(superAdminNotifications);
    return { unread };
  }

  async markRead(notificationId: string) {
    const [updated] = await this.db
      .update(superAdminNotifications)
      .set({ isRead: true })
      .where(eq(superAdminNotifications.id, notificationId))
      .returning({ id: superAdminNotifications.id });

    if (!updated) apiError(404, 'Notification not found.');
    return { ok: true as const };
  }

  async markAllRead() {
    await this.db
      .update(superAdminNotifications)
      .set({ isRead: true })
      .where(eq(superAdminNotifications.isRead, false));
    return { ok: true as const };
  }
/* ───────────────────── Per-user notifications (customer/driver/partner) ─────────────────── */

  async notifyUser(userId: string, input: NotifyUserInput): Promise<void> {
    try {
      await this.db.insert(userNotifications).values({
        id: id('unf'),
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      });
    } catch (err) {
      this.logger.error(`Failed to write notification for user ${userId}`, err as Error);
    }
  }

  async listForUser(userId: string, limit = 20, offset = 0) {
    // Sequential, not Promise.all — this is the notification-bell poll that
    // every signed-in screen fires every 20s (see client's NotificationBell),
    // so it's the single most-hit endpoint in the app, and it was firing
    // three genuinely simultaneous queries per call. Each one grabs its own
    // connection from the pool at the same instant; against a serverless
    // Postgres that has just cold-started after auto-suspend (see
    // database.module.ts's own comments on this), or under any real
    // contention, one of the three loses the race and the connection resets
    // out from under it — which surfaces here as a flat 500 with no useful
    // detail on the client. Three sequential awaits reuse a single
    // connection one query at a time; the added latency (a few ms) is
    // nothing next to "the bell silently 500s."
    const rows = await this.db
      .select()
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId))
      .orderBy(desc(userNotifications.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId));
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*) filter (where ${userNotifications.isRead} = false)::int` })
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId));

    return {
      items: rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
      total,
      unread,
      limit,
      offset,
    };
  }

  async unreadCountForUser(userId: string) {
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*) filter (where ${userNotifications.isRead} = false)::int` })
      .from(userNotifications)
      .where(eq(userNotifications.userId, userId));
    return { unread };
  }

  async markReadForUser(userId: string, notificationId: string) {
    const [updated] = await this.db
      .update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.id, notificationId), eq(userNotifications.userId, userId)))
      .returning({ id: userNotifications.id });

    if (!updated) apiError(404, 'Notification not found.');
    return { ok: true as const };
  }

  async markAllReadForUser(userId: string) {
    await this.db
      .update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
    return { ok: true as const };
  }

}