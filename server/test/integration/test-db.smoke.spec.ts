import { createTestDb } from '../setup/test-db';
import { users } from '../../src/database/schema';

describe('test DB bootstrap (pglite + replayed migrations)', () => {
  it('applies every migration and accepts a write/read round-trip', async () => {
    const { db, close } = await createTestDb();
    try {
      const [row] = await db
        .insert(users)
        .values({
          id: 'usr_smoketest',
          name: 'Smoke Test',
          mobile: '9800000000',
          email: 'smoke@test.local',
          passwordHash: 'hash',
          role: 'customer',
        })
        .returning();

      expect(row.id).toBe('usr_smoketest');

      const found = await db.select().from(users);
      expect(found).toHaveLength(1);
    } finally {
      await close();
    }
  });
});
