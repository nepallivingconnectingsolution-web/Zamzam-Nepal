import { Global, Injectable, Module, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

/**
 * Owns the single shared pg Pool for the whole process and closes it
 * cleanly on shutdown.
 *
 * This directly addresses the "missing shutdown hooks" half of this
 * project's earlier heap-out-of-memory incident: because this class is a
 * real Nest provider (not just a value returned from a factory), Nest's
 * dependency injector itself calls onModuleDestroy() when
 * app.enableShutdownHooks() (set in main.ts) reacts to SIGTERM/SIGINT —
 * which calls pool.end() so every connection is released back to Neon
 * instead of leaking across restarts.
 *
 * The pool is also explicitly capped (see `max` below) — an uncapped pool
 * is the single most common way to exhaust Neon's serverless Postgres
 * connection limit under load and crash the process, which was the other
 * half of that same earlier incident.
 */
@Injectable()
export class DatabasePool implements OnModuleDestroy {
  private readonly logger = new Logger(DatabasePool.name);
  public readonly pool: Pool;
  public readonly db: Database;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get<string>('DATABASE_URL'),
      max: 10,
      idleTimeoutMillis: 30_000,
      // Neon's serverless compute auto-suspends after a few idle minutes.
      // The first query after a suspend has to wait for a cold start,
      // which can take several seconds — 10s wasn't always enough and
      // surfaced as "Connection terminated due to connection timeout"
      // on otherwise-trivial queries. 30s gives cold starts room to
      // finish without making a genuinely broken connection string hang
      // forever.
      connectionTimeoutMillis: 30_000,
    });

    // Surface pool-level errors instead of letting them crash the process
    // silently or pile up as unhandled rejections.
    this.pool.on('error', (err) => {
      this.logger.error('Unexpected pg pool error', err);
    });

    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    this.logger.log('Closing PostgreSQL connection pool...');
    await this.pool.end();
    this.logger.log('PostgreSQL connection pool closed.');
  }
}

@Global()
@Module({
  // See AuthModule for why ConfigModule is imported explicitly rather than
  // relied on purely via isGlobal:true — DatabasePool's constructor needs
  // ConfigService to already be instantiated.
  imports: [ConfigModule],
  providers: [
    DatabasePool,
    {
      provide: DATABASE_CONNECTION,
      inject: [DatabasePool],
      useFactory: (holder: DatabasePool) => holder.db,
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}