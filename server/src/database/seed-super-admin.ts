/**
 * Seeds (or updates) the single bootstrap super-admin account from
 * SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME in `.env`.
 *
 * Run with: `npm run db:seed:superadmin`
 *
 * Safe to re-run: if a super admin with that email already exists, this
 * updates its password hash to match the current .env value instead of
 * creating a duplicate. This is intentionally the ONLY way to create or
 * rotate the super-admin password — there is no public registration route
 * for this account, by design.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { superAdmins } from './schema';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!connectionString) throw new Error('DATABASE_URL is not set.');
  if (!email) throw new Error('SUPER_ADMIN_EMAIL is not set.');
  if (!password) throw new Error('SUPER_ADMIN_PASSWORD is not set.');
  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD should be at least 12 characters for a production deployment.');
  }

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool);

  const passwordHash = await bcrypt.hash(password, 12);
  const normalisedEmail = email.toLowerCase();

  const existing = await db
    .select({ id: superAdmins.id })
    .from(superAdmins)
    .where(eq(superAdmins.email, normalisedEmail))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(superAdmins)
      .set({ passwordHash, name, updatedAt: new Date() })
      .where(eq(superAdmins.id, existing[0].id));
    console.log(`[seed-super-admin] updated existing super admin "${normalisedEmail}".`);
  } else {
    await db.insert(superAdmins).values({
      id: `sa_${nanoid(20)}`,
      name,
      email: normalisedEmail,
      passwordHash,
    });
    console.log(`[seed-super-admin] created super admin "${normalisedEmail}".`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-super-admin] failed:', err);
  process.exit(1);
});
