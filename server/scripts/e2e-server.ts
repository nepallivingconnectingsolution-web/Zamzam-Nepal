/**
 * E2E test-server orchestrator: boots a real Postgres-wire-protocol server
 * backed by an in-memory PGlite instance (no Docker, no network, never
 * touches the real Neon database), applies every migration and seeds the
 * bootstrap super-admin against it, then starts the actual NestJS app
 * pointed at that database. Playwright's webServer config runs this one
 * script; from Playwright's point of view it's a normal long-running dev
 * server.
 *
 * Using the PGLite JS API directly (rather than the `pglite-server` CLI's
 * `--run` flag) sidesteps a Windows bug where that flag's subprocess spawn
 * fails with ENOENT because it doesn't go through a shell.
 */
import { spawn } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const PORT = Number(process.env.E2E_DB_PORT ?? 55432);
const DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`;

const E2E_ENV = {
  ...process.env,
  DATABASE_URL,
  NODE_ENV: 'development',
  PORT: process.env.PORT ?? '4000',
  CORS_ORIGINS: process.env.CORS_ORIGINS ?? 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'e2e-jwt-access-secret-not-for-production-use-32c',
  JWT_REFRESH_SECRET: 'e2e-jwt-refresh-secret-not-for-production-use-32c',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '30d',
  SUPER_ADMIN_JWT_SECRET: 'e2e-super-admin-jwt-secret-not-for-production-32c',
  SUPER_ADMIN_JWT_EXPIRES_IN: '12h',
  SUPER_ADMIN_EMAIL: 'superadmin@e2e.local',
  SUPER_ADMIN_PASSWORD: 'e2e-only-password-123',
  SUPER_ADMIN_NAME: 'E2E Super Admin',
  AUTH_RATE_LIMIT_TTL_MS: '60000',
  AUTH_RATE_LIMIT_LIMIT: '1000', // generous — E2E hammers auth routes across many specs
  API_RATE_LIMIT_LIMIT: '5000',
};

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: true, stdio: 'inherit', env: E2E_ENV });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))));
    child.on('error', reject);
  });
}

async function main() {
  const db = await PGlite.create();
  const socketServer = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
  await socketServer.start();
  console.log(`[e2e-server] PGlite Postgres listening on ${DATABASE_URL}`);

  await run('npm', ['run', 'db:migrate']);
  console.log('[e2e-server] migrations applied.');

  await run('npm', ['run', 'db:seed:superadmin']);
  console.log('[e2e-server] super-admin seeded.');

  // `nest start --watch` compiles via webpack/ts-loader, which took 40s+
  // cold in practice — most of a Playwright webServer timeout gone before
  // the app even starts. A plain `tsc` production build (`nest build`) is
  // ~3x faster, and starting the compiled output is then near-instant —
  // also closer to what actually runs in production.
  console.log('[e2e-server] building app...');
  await run('npm', ['run', 'build']);

  console.log('[e2e-server] starting NestJS app...');
  const app = spawn('node', ['dist/main.js'], { stdio: 'inherit', env: E2E_ENV });

  const shutdown = async () => {
    app.kill();
    await socketServer.stop();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  app.on('exit', (code) => {
    console.log(`[e2e-server] app process exited with code ${code}`);
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error('[e2e-server] failed:', err);
  process.exit(1);
});
