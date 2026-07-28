import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../setup/test-db';
import { fakeConfigService } from '../setup/fakes';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { SuperAdminService } from '../../src/modules/super-admin/super-admin.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { users, wallets, transactions, superAdmins, auditLogs } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';
import { id } from '../../src/common/id';

/**
 * Regression coverage for the Critical finding fixed in this session
 * (PHASE1_AUDIT.md): POST /wallet/topup used to credit the wallet
 * instantly with zero payment verification. This exercises the real
 * fix end-to-end against a real (in-memory) Postgres — WalletService and
 * SuperAdminService talking to the same DB, not mocks — so a future change
 * that accidentally reintroduces instant crediting fails here.
 */
describe('Wallet top-up: PENDING until super-admin resolution', () => {
  let db: Database;
  let close: () => Promise<void>;
  let wallet: WalletService;
  let superAdmin: SuperAdminService;
  let userId: string;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    wallet = new WalletService(db);
    const notifications = new NotificationsService(db);
    superAdmin = new SuperAdminService(db, new JwtService(), fakeConfigService(), notifications);

    userId = id('u');
    await db.insert(users).values({
      id: userId,
      name: 'Test Customer',
      mobile: '9800000001',
      email: 'customer@test.local',
      passwordHash: 'hash',
      role: 'customer',
      kycStatus: 'APPROVED',
    });
  });

  afterEach(async () => {
    await close();
  });

  it('does NOT credit the wallet when a top-up is requested', async () => {
    const result = await wallet.topup(userId, 5000, 'esewa');
    expect(result.status).toBe('PENDING');

    const balance = await wallet.balance(userId);
    expect(balance.available).toBe(0);

    const [txn] = await db.select().from(transactions).where(eq(transactions.userId, userId));
    expect(txn.type).toBe('TOPUP');
    expect(txn.status).toBe('PENDING');
    expect(Number(txn.amount)).toBe(5000);
  });

  it('credits the wallet exactly once a super-admin resolves the top-up as SUCCESS', async () => {
    await wallet.topup(userId, 2500, 'khalti');
    const [pending] = await db.select().from(transactions).where(eq(transactions.userId, userId));

    const adminId = id('sa');
    await db.insert(superAdmins).values({ id: adminId, name: 'Ops', email: 'ops@test.local', passwordHash: 'hash' });

    await superAdmin.resolveTransaction(adminId, pending.id, 'SUCCESS');

    const balance = await wallet.balance(userId);
    expect(balance.available).toBe(2500);

    const [resolved] = await db.select().from(transactions).where(eq(transactions.id, pending.id));
    expect(resolved.status).toBe('SUCCESS');

    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.targetId, pending.id));
    expect(log.action).toBe('super_admin.topup.resolve');
  });

  it('does NOT credit the wallet when a super-admin rejects the top-up as FAILED', async () => {
    await wallet.topup(userId, 2500, 'card');
    const [pending] = await db.select().from(transactions).where(eq(transactions.userId, userId));

    const adminId = id('sa');
    await db.insert(superAdmins).values({ id: adminId, name: 'Ops', email: 'ops2@test.local', passwordHash: 'hash' });
    await superAdmin.resolveTransaction(adminId, pending.id, 'FAILED');

    const balance = await wallet.balance(userId);
    expect(balance.available).toBe(0);

    const [resolved] = await db.select().from(transactions).where(eq(transactions.id, pending.id));
    expect(resolved.status).toBe('FAILED');
  });

  it('cannot resolve the same top-up twice (second call finds nothing PENDING and 404s)', async () => {
    await wallet.topup(userId, 1000, 'card');
    const [pending] = await db.select().from(transactions).where(eq(transactions.userId, userId));

    const adminId = id('sa');
    await db.insert(superAdmins).values({ id: adminId, name: 'Ops', email: 'ops3@test.local', passwordHash: 'hash' });

    await superAdmin.resolveTransaction(adminId, pending.id, 'SUCCESS');

    await expect(superAdmin.resolveTransaction(adminId, pending.id, 'SUCCESS')).rejects.toMatchObject({});
    // Balance must still reflect exactly one credit, not two.
    const balance = await wallet.balance(userId);
    expect(balance.available).toBe(1000);
  });

  it('rejects resolving a transaction that does not exist', async () => {
    const adminId = id('sa');
    await db.insert(superAdmins).values({ id: adminId, name: 'Ops', email: 'ops4@test.local', passwordHash: 'hash' });
    await expect(superAdmin.resolveTransaction(adminId, 'txn_does_not_exist', 'SUCCESS')).rejects.toBeTruthy();
  });
});
