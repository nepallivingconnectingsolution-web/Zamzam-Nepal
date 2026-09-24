import { createTestDb } from '../setup/test-db';
import { VehiclesService } from '../../src/modules/vehicles/vehicles.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { users } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

describe('VehiclesService plate rules', () => {
  let db: Database;
  let close: () => Promise<void>;
  let svc: VehiclesService;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    svc = new VehiclesService(db, new NotificationsService(db), {} as never, {} as never);
    for (const [i, idv] of ['u1', 'u2'].entries()) {
      await db.insert(users).values({
        id: idv, name: idv, email: `${idv}@t.l`, mobile: `980000000${i}`, passwordHash: 'x', role: 'driver',
      });
    }
  });
  afterEach(async () => {
    await close();
  });

  const dto = { category: 'bike' as const, makeModel: 'Bajaj Pulsar', plateNumber: 'BA 99 PA 1234' };

  it('keeps the displayed plate and rejects the same plate written in another format', async () => {
    const v = await svc.register('u1', dto);
    expect(v.plateNumber).toBe('BA 99 PA 1234');
    await expect(svc.register('u2', { ...dto, plateNumber: 'ba-99-pa-1234' })).rejects.toMatchObject({ status: 409 });
    await expect(svc.register('u2', { ...dto, plateNumber: 'BA99PA1234' })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects a malformed bike or car plate with a friendly 400', async () => {
    await expect(svc.register('u1', { ...dto, plateNumber: '1234' })).rejects.toMatchObject({ status: 400 });
    await expect(svc.register('u1', { ...dto, category: 'car', plateNumber: 'ABCD' })).rejects.toMatchObject({ status: 400 });
  });

  it('does not apply the bike/car format rule to freight vehicles, but still blocks duplicates', async () => {
    await expect(svc.register('u1', { ...dto, category: 'truck', plateNumber: 'NA 1 KHA 4321 X' })).resolves.toBeDefined();
    await expect(
      svc.register('u2', { ...dto, category: 'truck', plateNumber: 'na1kha4321x' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('frees the plate after the first vehicle is removed', async () => {
    const v = await svc.register('u1', dto);
    await svc.remove('u1', v.id);
    await expect(svc.register('u2', dto)).resolves.toBeDefined();
  });

  it('checks the new plate on update and keeps the same vehicle editable', async () => {
    const a = await svc.register('u1', dto);
    await svc.register('u2', { ...dto, plateNumber: 'BA 1 KHA 1111' });
    await expect(svc.update('u1', a.id, { plateNumber: 'ba1kha1111' })).rejects.toMatchObject({ status: 409 });
    await expect(svc.update('u1', a.id, { plateNumber: 'BA-99-PA-1234', color: 'Red' })).resolves.toBeDefined();
  });
});
