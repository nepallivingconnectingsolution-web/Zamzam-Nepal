import type { Config } from 'jest';

/**
 * E2E tests: boot the real Nest app (real guards, pipes, filters,
 * middleware) with only the DB swapped for an in-process pglite instance,
 * and hit it with supertest. Separate from jest.config.ts because these
 * are slower and shouldn't run on every `npm test`.
 */
const config: Config = {
  rootDir: '..',
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup/jest.setup.ts'],
  testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30_000,
};

export default config;
