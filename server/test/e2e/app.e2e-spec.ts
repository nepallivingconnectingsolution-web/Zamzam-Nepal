/**
 * Boots the real AppModule (every module wired, real guards/pipes/filters)
 * against a DB stub that throws if actually queried — these checks all
 * happen before any service reaches the database (validation, auth guards,
 * routing), so reaching the DB at all would itself be a test design bug.
 * Ported from the old test/smoke.ts (never wired into a runnable script)
 * into the real e2e suite.
 */
import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { DATABASE_CONNECTION } from '../../src/database/database.module';

const NEST_LIFECYCLE_HOOKS = new Set([
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

function unreachableDbStub() {
  const fail = (..._args: unknown[]) => {
    throw new Error('e2e smoke test reached the database — this should never happen for these cases.');
  };
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'then' || prop === Symbol.toPrimitive || typeof prop === 'symbol') {
          return undefined;
        }
        if (typeof prop === 'string' && NEST_LIFECYCLE_HOOKS.has(prop)) {
          return undefined;
        }
        return fail;
      },
    },
  );
}

describe('App smoke (validation + auth guards, no DB reached)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue(unreachableDbStub())
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects registration with an invalid email (400, before touching the DB)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'not-an-email', mobile: '9800000000', password: 'password123', role: 'customer' });
    expect(res.status).toBe(400);
    expect(res.body.message).toEqual(expect.stringContaining('valid email'));
  });

  it('rejects registration with a short password (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: '9800000000', password: 'short', role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('rejects registration with role=admin — not self-registerable (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: '9800000000', password: 'password123', role: 'admin' });
    expect(res.status).toBe(400);
  });

  it('rejects registration with a non-numeric mobile (400)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: 'abc', password: 'password123', role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated wallet balance request (401)', async () => {
    const res = await request(app.getHttpServer()).get('/wallet/balance');
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated driver-status update (401)', async () => {
    const res = await request(app.getHttpServer()).post('/driver/status').send({ online: true });
    expect(res.status).toBe(401);
  });

  it('rejects a super-admin login with an empty body (400, not 500)', async () => {
    const res = await request(app.getHttpServer()).post('/super-admin/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated bus booking (401, not 500)', async () => {
    const res = await request(app.getHttpServer())
      .post('/buses/trip_fake/book')
      .send({ seats: ['1A'], passengers: [], method: 'esewa' });
    expect(res.status).toBe(401);
  });

  it('rejects an unauthenticated operator-only route (401)', async () => {
    const res = await request(app.getHttpServer()).get('/operator/buses');
    expect(res.status).toBe(401);
  });

  it('returns a clean 404 body (not a stack trace) for an unknown route', async () => {
    const res = await request(app.getHttpServer()).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(typeof res.body.message).toBe('string');
  });
});
