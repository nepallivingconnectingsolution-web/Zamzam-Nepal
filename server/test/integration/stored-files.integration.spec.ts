import { createTestDb } from '../setup/test-db';
import { StorageBackend, StorageService } from '../../src/modules/driver-onboarding/files/storage.service';
import { users } from '../../src/database/schema';
import type { Database } from '../../src/database/database.module';

class MemoryBackend extends StorageBackend {
  m = new Map<string, Buffer>();
  async put(k: string, d: Buffer) {
    this.m.set(k, d);
  }
  async read(k: string) {
    return this.m.get(k)!;
  }
  async remove(k: string) {
    this.m.delete(k);
  }
}

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);
const file = (over: Partial<Express.Multer.File> = {}): Express.Multer.File =>
  ({ buffer: jpeg, mimetype: 'image/jpeg', originalname: 'a.jpg', size: jpeg.length, ...over }) as Express.Multer.File;

describe('StorageService', () => {
  let db: Database;
  let close: () => Promise<void>;
  let backend: MemoryBackend;
  let svc: StorageService;

  beforeEach(async () => {
    ({ db, close } = await createTestDb());
    backend = new MemoryBackend();
    svc = new StorageService(db, backend);
    for (const [i, idv] of ['u1', 'u2'].entries()) {
      await db.insert(users).values({
        id: idv, name: idv, email: `${idv}@t.l`, mobile: `980000000${i}`, passwordHash: 'x', role: 'driver',
      });
    }
  });
  afterEach(async () => {
    await close();
  });

  it('lets the owner and admins read, and blocks other users', async () => {
    const saved = await svc.save('u1', file());
    expect((await svc.readForUser(saved.id, { kind: 'user', id: 'u1' })).mimeType).toBe('image/jpeg');
    expect((await svc.readForUser(saved.id, { kind: 'admin', id: 'sa_1' })).buffer.length).toBe(jpeg.length);
    await expect(svc.readForUser(saved.id, { kind: 'user', id: 'u2' })).rejects.toMatchObject({ status: 403 });
  });

  it('never exposes the storage key and stores nothing outside the backend', async () => {
    const saved = await svc.save('u1', file({ originalname: '../../etc/passwd.jpg' }));
    expect(saved).not.toHaveProperty('storageKey');
    expect([...backend.m.keys()].every((k) => !k.includes('..'))).toBe(true);
    expect(saved.originalName).toBe('passwd.jpg');
  });

  it('rejects an invalid file before anything is stored', async () => {
    await expect(svc.save('u1', file({ buffer: Buffer.from('MZ'), size: 2 }))).rejects.toMatchObject({ status: 400 });
    expect(backend.m.size).toBe(0);
  });

  it('returns 404 for an unknown file and removes bytes on delete', async () => {
    await expect(svc.readForUser('nope', { kind: 'admin', id: 'sa_1' })).rejects.toMatchObject({ status: 404 });
    const saved = await svc.save('u1', file());
    await svc.remove(saved.id);
    expect(backend.m.size).toBe(0);
  });

  it('blocks an image flagged by moderation and fails closed if moderation errors', async () => {
    const flagged = new StorageService(db, backend, { checkImage: async () => ({ allowed: false, reasons: ['x'] }) } as any);
    await expect(flagged.save('u1', file())).rejects.toMatchObject({ status: 422 });
    const broken = new StorageService(db, backend, {
      checkImage: async () => {
        throw new Error('aws down');
      },
    } as any);
    await expect(broken.save('u1', file())).rejects.toMatchObject({ status: 422 });
    expect(backend.m.size).toBe(0);
  });
});
