/**
 * One-off smoke test (not part of the permanent test suite) verifying:
 *  1. The full AppModule boots successfully with every module wired.
 *  2. Global ValidationPipe rejects malformed payloads with 400 + the
 *     right messages, before ever reaching a service/database call.
 *  3. Guards correctly reject unauthenticated requests with 401.
 *  4. The exception filter returns the { message, code? } shape.
 *
 * The real database provider is overridden with a stub object whose
 * methods throw if actually called — any test here that reaches the
 * database is a smoke-test design bug, not something this script should
 * silently tolerate, so it intentionally has no real DB behind it.
 */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ValidationPipe, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const DATABASE_CONNECTION = 'DATABASE_CONNECTION';

const NEST_LIFECYCLE_HOOKS = new Set([
  'onModuleInit',
  'onApplicationBootstrap',
  'onModuleDestroy',
  'beforeApplicationShutdown',
  'onApplicationShutdown',
]);

function unreachableDbStub() {
  const fail = (..._args: unknown[]) => {
    const err = new Error('Smoke test reached the database — this should never happen for these cases.');
    console.error(err.stack);
    throw err;
  };
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        // Nest probes every provider in the graph for lifecycle hook
        // methods during init/shutdown regardless of whether the provider
        // actually implements them — those probes are not real "reached
        // the database" events and must not be treated as failures.
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

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATABASE_CONNECTION)
    .useValue(unreachableDbStub())
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();

  let passed = 0;
  let failed = 0;
  const check = (label: string, cond: boolean, extra?: unknown) => {
    if (cond) {
      passed++;
      console.log(`PASS  ${label}`);
    } else {
      failed++;
      console.log(`FAIL  ${label}`, extra ?? '');
    }
  };

  // 1. App boots — implicit if we got here.
  check('AppModule boots with every module wired', true);

  // 2. Register with invalid email -> 400 with our message.
  {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'not-an-email', mobile: '9800000000', password: 'password123', role: 'customer' });
    check(
      'POST /auth/register with bad email -> 400',
      res.status === 400 && typeof res.body.message === 'string' && res.body.message.includes('valid email'),
      res.body,
    );
  }

  // 3. Register with short password -> 400.
  {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: '9800000000', password: 'short', role: 'customer' });
    check('POST /auth/register with short password -> 400', res.status === 400, res.body);
  }

  // 4. Register with invalid role -> 400 (admin is not self-registerable).
  {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: '9800000000', password: 'password123', role: 'admin' });
    check('POST /auth/register with role=admin -> 400 (not self-registerable)', res.status === 400, res.body);
  }

  // 5. Register with invalid mobile -> 400.
  {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Test', email: 'a@b.com', mobile: 'abc', password: 'password123', role: 'customer' });
    check('POST /auth/register with non-numeric mobile -> 400', res.status === 400, res.body);
  }

  // 6. Guarded route without a token -> 401.
  {
    const res = await request(app.getHttpServer()).get('/wallet/balance');
    check('GET /wallet/balance without token -> 401', res.status === 401, res.body);
  }

  // 7. Guarded driver-only route without a token -> 401.
  {
    const res = await request(app.getHttpServer()).post('/driver/status').send({ online: true });
    check('POST /driver/status without token -> 401', res.status === 401, res.body);
  }

  // 8. Super admin login with garbage body -> 400 (validation), not 500.
  {
    const res = await request(app.getHttpServer()).post('/super-admin/auth/login').send({});
    check('POST /super-admin/auth/login with empty body -> 400', res.status === 400, res.body);
  }

  // 9. Customer-only bus booking route without a token -> 401, not 500.
  {
    const res = await request(app.getHttpServer())
      .post('/buses/trip_fake/book')
      .send({ seats: ['A1'], passengers: [], method: 'esewa' });
    check('POST /buses/:id/book without token -> 401', res.status === 401, res.body);
  }

  // 10. Operator-only route without a token -> 401.
  {
    const res = await request(app.getHttpServer()).get('/operator/buses');
    check('GET /operator/buses without token -> 401', res.status === 401, res.body);
  }

  // 11. Unknown route -> 404 with our shape, not a stack trace dump.
  {
    const res = await request(app.getHttpServer()).get('/this-route-does-not-exist');
    check('GET unknown route -> 404 with {message}', res.status === 404 && typeof res.body.message === 'string', res.body);
  }

  await app.close();

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
