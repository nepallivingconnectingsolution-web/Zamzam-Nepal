import { Controller, Get, Inject, Injectable, Module, UseGuards } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION, type Database } from '../../database/database.module';
import { disputes, driverStatus, tickets, users } from '../../database/schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Injectable()
export class AdminService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async metrics() {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [{ gmv }] = await this.db
      .select({ gmv: sql<string>`coalesce(sum(${tickets.grandTotal}), 0)` })
      .from(tickets)
      .where(eq(tickets.status, 'CONFIRMED'));

    const [{ activeTrips }] = await this.db
      .select({ activeTrips: sql<number>`count(distinct ${tickets.tripId})::int` })
      .from(tickets)
      .where(eq(tickets.status, 'CONFIRMED'));

    const [{ onlineDrivers }] = await this.db
      .select({ onlineDrivers: sql<number>`count(*)::int` })
      .from(driverStatus)
      .where(eq(driverStatus.online, true));

    const [{ newUsers24h }] = await this.db
      .select({ newUsers24h: sql<number>`count(*)::int` })
      .from(users)
      .where(gte(users.createdAt, since24h));

    return {
      gmv: Number(gmv),
      activeTrips,
      onlineDrivers,
      newUsers24h,
    };
  }

  async revenue() {
    // 7-day platform revenue series, bucketed by booking date. Returns real
    // empty buckets (value: 0) for days with no bookings, so the chart
    // shows true flat zero rather than fabricated growth.
    const rows = await this.db.execute<{ day: string; total: string }>(
      sql`select to_char(booked_at, 'Dy') as day, sum(grand_total) as total
          from tickets
          where status = 'CONFIRMED' and booked_at >= now() - interval '7 days'
          group by 1, date_trunc('day', booked_at)
          order by date_trunc('day', booked_at)`,
    );
    return rows.rows.map((r) => ({ label: r.day.trim(), value: Number(r.total) }));
  }

  async disputes() {
    const rows = await this.db.select().from(disputes).orderBy(disputes.createdAt);
    return rows.map((d) => ({
      id: d.id,
      subject: d.subject,
      status: d.status,
      amount: d.amount,
      createdAt: d.createdAt.toISOString(),
    }));
  }
}

/** Platform-wide oversight for the regular `admin` role (distinct from super admin). */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('revenue')
  revenue() {
    return this.admin.revenue();
  }

  @Get('disputes')
  disputes() {
    return this.admin.disputes();
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
