import type { ConfigService } from '@nestjs/config';

/**
 * Minimal ConfigService stand-in for tests that instantiate a service
 * directly (bypassing Nest's DI container). Reads straight from
 * process.env, which test/setup/jest.setup.ts has already populated with
 * fixed test values before any test file runs.
 */
export function fakeConfigService(): ConfigService {
  return { get: (key: string) => process.env[key] } as unknown as ConfigService;
}
