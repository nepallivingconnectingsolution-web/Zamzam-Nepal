import { Body, Controller, Get, Inject, Injectable, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { desc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { disputes } from '../../database/schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/jwt.strategy';
import { id } from '../../common/id';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateTicketDto, type TicketCategory } from './dto/support.dto';

const CATEGORY_LABEL: Record<TicketCategory, string> = {
  payment: 'Payment',
  trip: 'Trip',
  booking: 'Booking',
  account: 'Account',
  other: 'Other',
};

/**
 * Customer support tickets, backed by the existing `disputes` table so
 * every ticket lands straight in the super admin's Disputes queue —
 * one queue, one resolution flow, no second system to monitor.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  async createTicket(user: AuthenticatedUser, dto: CreateTicketDto) {
    const subject = `[${CATEGORY_LABEL[dto.category]}] ${dto.description.trim()}`;

    const [row] = await this.db
      .insert(disputes)
      .values({
        id: id('dsp'),
        subject,
        status: 'OPEN',
        amount: '0',
        raisedByUserId: user.id,
      })
      .returning();

    // Ping the super-admin bell. notify() swallows its own errors, so a
    // notification hiccup can never fail the ticket itself.
    await this.notifications.notify({
      type: 'dispute_filed',
      title: 'New support ticket',
      message: subject.slice(0, 140),
      entityType: 'dispute',
      entityId: row.id,
    });

    return this.toDto(row);
  }

  async myTickets(userId: string) {
    const rows = await this.db
      .select()
      .from(disputes)
      .where(eq(disputes.raisedByUserId, userId))
      .orderBy(desc(disputes.createdAt))
      .limit(100);
    return rows.map((r) => this.toDto(r));
  }

  private toDto(d: typeof disputes.$inferSelect) {
    return {
      id: d.id,
      subject: d.subject,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
    };
  }
}

@Controller('support')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // Rate-limited: 5 tickets a minute is already generous for a human.
  @Post('tickets')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.support.createTicket(user, dto);
  }

  @Get('tickets')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.support.myTickets(user.id);
  }
}