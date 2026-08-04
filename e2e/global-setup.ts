/**
 * Runs once, after Playwright's webServer(s) report ready (so the schema
 * has already been migrated by server/scripts/e2e-server.ts) and before
 * any test file executes. Seeds one bus + schedule + trip directly via SQL
 * so bus-booking.spec.ts has something real to search for and book,
 * without needing to drive the full operator-onboarding UI (registration
 * -> super-admin KYC approval -> publish schedule) just to get test data.
 *
 * Connects to the same ephemeral, in-memory PGlite-backed Postgres the
 * app itself is using (see server/scripts/e2e-server.ts) — this never
 * touches the real Neon database.
 */
import { Client } from 'pg';

const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';

export const SEEDED_TRIP = {
  operatorId: 'e2e_op1',
  busId: 'e2e_bus1',
  scheduleId: 'e2e_sch1',
  tripId: 'e2e_trip1',
  fromCity: 'Kathmandu',
  toCity: 'Pokhara',
  price: 1200,
};

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function globalSetup() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    const { operatorId, busId, scheduleId, tripId, fromCity, toCity, price } = SEEDED_TRIP;
    const date = tomorrowIso();

    // Idempotent: globalSetup can run more than once against a long-lived
    // dev DB (e.g. `--ui` mode re-running), so upsert-by-id rather than
    // assuming a clean slate.
    await client.query(
      `INSERT INTO users (id, name, mobile, email, password_hash, role, kyc_status, profile_complete)
       VALUES ($1, 'E2E Bus Operator', '9800000099', 'e2e-operator@zamzam.test', 'not-a-real-hash', 'bus_operator', 'APPROVED', true)
       ON CONFLICT (id) DO NOTHING`,
      [operatorId],
    );

    await client.query(
      `INSERT INTO buses (id, operator_id, bus_name, bus_number, registration_no, type, fuel_type, total_seats, total_rows)
       VALUES ($1, $2, 'Zamzam Express', 'ZE-1', 'BA-1-PA-9999', 'AC', 'diesel', 32, 8)
       ON CONFLICT (id) DO NOTHING`,
      [busId, operatorId],
    );

    await client.query(
      `INSERT INTO schedules (id, operator_id, bus_id, from_city, to_city, departure, arrival, duration, price, frequency, valid_from, bus_name, bus_type, total_seats)
       VALUES ($1, $2, $3, $4, $5, '07:00 AM', '01:30 PM', '6h 30m', $6, 'daily', $7, 'Zamzam Express', 'AC', 32)
       ON CONFLICT (id) DO NOTHING`,
      [scheduleId, operatorId, busId, fromCity, toCity, price, date],
    );

    await client.query(
      `INSERT INTO trips (id, schedule_id, operator_id, bus_id, from_city, to_city, date, departure, arrival, duration, price, total_seats, total_rows, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '07:00 AM', '01:30 PM', '6h 30m', $8, 32, 8, 'AC')
       ON CONFLICT (id) DO UPDATE SET date = EXCLUDED.date, booked_seats = '[]'::jsonb, status = 'scheduled'`,
      [tripId, scheduleId, operatorId, busId, fromCity, toCity, date, price],
    );
  } finally {
    await client.end();
  }
}
