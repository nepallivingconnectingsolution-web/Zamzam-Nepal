// class-validator's decorators (and Nest's own DI) read design-time type
// metadata off Reflect — only present once this polyfill is loaded. main.ts
// loads it implicitly via Nest's bootstrap; tests import DTOs/services
// directly, so it has to be loaded here instead.
import 'reflect-metadata';

/**
 * Runs before the test framework is installed (jest `setupFiles`), so these
 * env vars exist before ConfigModule / any module-level code reads them.
 * Deliberately not sourced from a .env file: .env is gitignored (won't
 * exist in CI) and .env.test would still need real-looking secrets sitting
 * in the repo. Fixed, obviously-fake values keep tests deterministic on
 * every machine without adding another file that looks like a credential.
 */
process.env.NODE_ENV ??= 'test';
process.env.PORT ??= '4000';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-do-not-use-in-prod-32chars';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret-do-not-use-in-prod-32chars';
process.env.JWT_ACCESS_EXPIRES_IN ??= '15m';
process.env.JWT_REFRESH_EXPIRES_IN ??= '30d';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-do-not-use-32chars';
process.env.SUPER_ADMIN_JWT_EXPIRES_IN ??= '12h';
process.env.SUPER_ADMIN_EMAIL ??= 'superadmin@test.local';
process.env.SUPER_ADMIN_PASSWORD ??= 'test-only-password';
process.env.SUPER_ADMIN_NAME ??= 'Test Super Admin';
process.env.AUTH_RATE_LIMIT_TTL_MS ??= '60000';
process.env.AUTH_RATE_LIMIT_LIMIT ??= '10';
