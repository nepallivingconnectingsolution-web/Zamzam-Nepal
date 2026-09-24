/**
 * Boots the real AppModule (real guards, pipes, filters, throttler) with the DB
 * stubbed and ApplicationService faked. Proves the wiring: who may call what,
 * that bad input is rejected before reaching a service, and that a driver token
 * can never reach an admin route.
 */
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { DATABASE_CONNECTION } from '../../src/database/database.module';
import { ApplicationService } from '../../src/modules/driver-onboarding/application.service';
import { AdminApplicationsService } from '../../src/modules/driver-onboarding/admin-applications.service';

const LIFECYCLE = new Set(['onModuleInit', 'onApplicationBootstrap', 'onModuleDestroy', 'beforeApplicationShutdown', 'onApplicationShutdown']);
const dbStub = () =>
  new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then' || typeof prop === 'symbol' || (typeof prop === 'string' && LIFECYCLE.has(prop))) return undefined;
        return () => {
          throw new Error('reached the database');
        };
      },
    },
  );

describe('Driver onboarding routes (guards + validation)', () => {
  let app: INestApplication;
  const jwt = new JwtService();
  const userToken = (role: string, sub = 'u1') =>
    jwt.sign({ sub, role, type: 'access' }, { secret: process.env.JWT_ACCESS_SECRET, expiresIn: '5m' });
  const adminToken = () =>
    jwt.sign({ sub: 'sa_1', type: 'super_admin_access' }, { secret: process.env.SUPER_ADMIN_JWT_SECRET, expiresIn: '5m' });

  const fake = {
    getOrCreate: jest.fn(async (id: string) => ({ ok: true, id })),
    saveProfile: jest.fn(),
    saveVehicle: jest.fn(),
    uploadFile: jest.fn(async () => ({ ok: true })),
    deleteFile: jest.fn(),
    submit: jest.fn(),
    reopen: jest.fn(),
  };

  const fakeAdmin = {
    list: jest.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
    stats: jest.fn(async () => ({ pending: 0 })),
    detail: jest.fn(async (id: string) => ({ id })),
    startReview: jest.fn(async () => ({ status: 'UNDER_REVIEW' })),
    reviewDocument: jest.fn(async () => ({ ok: true })),
    approve: jest.fn(async () => ({ ok: true })),
    reject: jest.fn(async () => ({ ok: true })),
    requestResubmission: jest.fn(async () => ({ ok: true })),
    suspend: jest.fn(async () => ({ ok: true })),
    reactivate: jest.fn(async () => ({ ok: true })),
    addNote: jest.fn(async () => ({ ok: true })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(dbStub())
      .overrideProvider(ApplicationService)
      .useValue(fake)
      .overrideProvider(AdminApplicationsService)
      .useValue(fakeAdmin)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it('requires a token for the application (401)', async () => {
    expect((await request(app.getHttpServer()).get('/driver/application')).status).toBe(401);
  });

  it('blocks non-drivers with ROLE_MISMATCH (403)', async () => {
    const res = await request(app.getHttpServer())
      .get('/driver/application')
      .set('Authorization', `Bearer ${userToken('customer')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ROLE_MISMATCH');
    expect(fake.getOrCreate).not.toHaveBeenCalled();
  });

  it('scopes the application to the calling driver', async () => {
    const res = await request(app.getHttpServer())
      .get('/driver/application')
      .set('Authorization', `Bearer ${userToken('driver', 'u42')}`);
    expect(res.status).toBe(200);
    expect(fake.getOrCreate).toHaveBeenCalledWith('u42');
  });

  it('rejects an invalid licence date before it reaches the service (400)', async () => {
    const res = await request(app.getHttpServer())
      .put('/driver/application/profile')
      .set('Authorization', `Bearer ${userToken('driver')}`)
      .send({ licenceExpiryDate: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('valid licence expiry date'));
    expect(fake.saveProfile).not.toHaveBeenCalled();
  });

  it('rejects an unsupported vehicle category (400)', async () => {
    const res = await request(app.getHttpServer())
      .put('/driver/application/vehicle')
      .set('Authorization', `Bearer ${userToken('driver')}`)
      .send({ category: 'truck', make: 'Tata', model: 'X', plateNumber: 'BA 1 KHA 1234', manufactureYear: 2020, color: 'Red' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('Choose Bike or Car'));
    expect(fake.saveVehicle).not.toHaveBeenCalled();
  });

  it('asks for a file when none is attached (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/driver/application/files')
      .set('Authorization', `Bearer ${userToken('driver')}`)
      .field('docType', 'bluebook');
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('Attach a JPG'));
  });

  it('passes an uploaded file and its docType to the service for the calling driver', async () => {
    const res = await request(app.getHttpServer())
      .post('/driver/application/files')
      .set('Authorization', `Bearer ${userToken('driver', 'u7')}`)
      .field('docType', 'insurance')
      .field('expiryDate', '2040-01-01')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), { filename: 'a.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(201);
    expect(fake.uploadFile).toHaveBeenCalledWith(
      'u7',
      expect.objectContaining({ docType: 'insurance', expiryDate: '2040-01-01', file: expect.objectContaining({ originalname: 'a.jpg' }) }),
    );
  });

  it('rejects an unknown vehicleType on the requirements lookup (400)', async () => {
    const res = await request(app.getHttpServer())
      .get('/driver/requirements?vehicleType=truck')
      .set('Authorization', `Bearer ${userToken('driver')}`);
    expect(res.status).toBe(400);
  });

  it('validates the OTP code format before doing anything (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/driver/otp/verify')
      .set('Authorization', `Bearer ${userToken('driver')}`)
      .send({ code: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('6-digit'));
  });

  it('never serves files without the right identity', async () => {
    expect((await request(app.getHttpServer()).get('/driver/files/file_x')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/super-admin/files/file_x')).status).toBe(401);
    // A driver token is not a super-admin token, and vice versa.
    const asDriver = await request(app.getHttpServer())
      .get('/super-admin/files/file_x')
      .set('Authorization', `Bearer ${userToken('driver')}`);
    expect(asDriver.status).toBe(401);
    const adminOnDriverRoute = await request(app.getHttpServer())
      .get('/driver/files/file_x')
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(adminOnDriverRoute.status).toBe(401);
  });
  describe('super-admin routes', () => {
    const AS = () => `Bearer ${adminToken()}`;

    it('are closed to everyone without an admin token, including drivers and customers (401)', async () => {
      const path = '/super-admin/driver-applications';
      expect((await request(app.getHttpServer()).get(path)).status).toBe(401);
      expect((await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${userToken('driver')}`)).status).toBe(401);
      expect((await request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${userToken('customer')}`)).status).toBe(401);
      expect((await request(app.getHttpServer()).post(`${path}/app_1/approve`).set('Authorization', `Bearer ${userToken('driver')}`)).status).toBe(401);
      expect((await request(app.getHttpServer()).patch(`${path}/documents/adoc_1/approve`).set('Authorization', `Bearer ${userToken('driver')}`)).status).toBe(401);
      expect(fakeAdmin.list).not.toHaveBeenCalled();
      expect(fakeAdmin.approve).not.toHaveBeenCalled();
    });

    it('lists with the parsed filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/super-admin/driver-applications?status=PENDING&q=ram&sort=oldest&page=2&limit=10')
        .set('Authorization', AS());
      expect(res.status).toBe(200);
      expect(fakeAdmin.list).toHaveBeenCalledWith({ status: 'PENDING', q: 'ram', sort: 'oldest', page: 2, limit: 10 });
    });

    it('does not let /stats or /requirements be swallowed by /:id', async () => {
      await request(app.getHttpServer()).get('/super-admin/driver-applications/stats').set('Authorization', AS());
      expect(fakeAdmin.stats).toHaveBeenCalled();
      expect(fakeAdmin.detail).not.toHaveBeenCalled();
      await request(app.getHttpServer()).get('/super-admin/driver-applications/app_9').set('Authorization', AS());
      expect(fakeAdmin.detail).toHaveBeenCalledWith('app_9');
    });

    it('rejects an unknown sort (400)', async () => {
      const res = await request(app.getHttpServer()).get('/super-admin/driver-applications?sort=sideways').set('Authorization', AS());
      expect(res.status).toBe(400);
    });

    it('will not reject a document without a reason (400) and passes the admin id when it has one', async () => {
      const path = '/super-admin/driver-applications/documents/adoc_1/reject';
      const bad = await request(app.getHttpServer()).patch(path).set('Authorization', AS()).send({});
      expect(bad.status).toBe(400);
      expect(bad.body.message).toEqual(expect.stringContaining('Give a reason so the driver knows what to fix.'));
      const short = await request(app.getHttpServer()).patch(path).set('Authorization', AS()).send({ reason: 'no' });
      expect(short.status).toBe(400);
      expect(fakeAdmin.reviewDocument).not.toHaveBeenCalled();

      const ok = await request(app.getHttpServer()).patch(path).set('Authorization', AS()).send({ reason: 'Image is unclear.' });
      expect(ok.status).toBe(200);
      expect(fakeAdmin.reviewDocument).toHaveBeenCalledWith('sa_1', 'adoc_1', { action: 'reject', reason: 'Image is unclear.', kind: undefined });
    });

    it('approves with the expected version, and rejects a suspension with no reason or a bad scope (400)', async () => {
      const ok = await request(app.getHttpServer())
        .post('/super-admin/driver-applications/app_1/approve')
        .set('Authorization', AS())
        .send({ expectedVersion: 3 });
      expect(ok.status).toBe(200);
      expect(fakeAdmin.approve).toHaveBeenCalledWith('sa_1', 'app_1', 3);

      const noReason = await request(app.getHttpServer())
        .post('/super-admin/driver-applications/app_1/suspend')
        .set('Authorization', AS())
        .send({ scope: 'BOTH' });
      expect(noReason.status).toBe(400);
      const badScope = await request(app.getHttpServer())
        .post('/super-admin/driver-applications/app_1/suspend')
        .set('Authorization', AS())
        .send({ scope: 'EVERYONE', reason: 'because' });
      expect(badScope.status).toBe(400);
      expect(fakeAdmin.suspend).not.toHaveBeenCalled();

      const good = await request(app.getHttpServer())
        .post('/super-admin/driver-applications/app_1/suspend')
        .set('Authorization', AS())
        .send({ scope: 'BOTH', reason: 'Safety report' });
      expect(good.status).toBe(200);
      expect(fakeAdmin.suspend).toHaveBeenCalledWith('sa_1', 'app_1', { scope: 'BOTH', reason: 'Safety report' });
    });
  });
  describe('dispatch routes', () => {
    it.each([
      ['get', '/driver/offers/pending'],
      ['post', '/driver/offers/of_1/accept'],
      ['post', '/driver/offers/of_1/decline'],
      ['get', '/driver/stream'],
      ['post', '/driver/go-online'],
      ['post', '/driver/go-offline'],
      ['get', '/driver/eligibility'],
    ] as const)('%s %s needs a token (401) and a driver role (403)', async (method, path) => {
      const noToken = await (request(app.getHttpServer()) as any)[method](path);
      expect(noToken.status).toBe(401);
      const customer = await (request(app.getHttpServer()) as any)[method](path).set('Authorization', `Bearer ${userToken('customer')}`);
      expect(customer.status).toBe(403);
      expect(customer.body.code).toBe('ROLE_MISMATCH');
    });

    it('go-online refuses a missing or nonsense location before doing anything (400)', async () => {
      const auth = { Authorization: `Bearer ${userToken('driver')}` };
      const none = await request(app.getHttpServer()).post('/driver/go-online').set(auth).send({});
      expect(none.status).toBe(400);
      const bad = await request(app.getHttpServer()).post('/driver/go-online').set(auth).send({ lat: 200, lng: 85 });
      expect(bad.status).toBe(400);
    });

    it('the location ping validates its numbers (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/driver/location')
        .set('Authorization', `Bearer ${userToken('driver')}`)
        .send({ lat: 27.7, lng: 85.3, heading: 400 });
      expect(res.status).toBe(400);
    });
  });
});
