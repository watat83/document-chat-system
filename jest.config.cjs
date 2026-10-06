const nextJest = require('next/jest');
const createConfig = nextJest({ dir: './' })({
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/tests/regression/'],
  setupFiles: ['<rootDir>/tests/test-env.cjs'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
});
module.exports = async () => {
  const config = await createConfig();
  // AI SDK 7 and the Markdown ecosystem ship ESM. Compile their dependencies
  // through the same SWC transformer as application code under Jest's CJS runtime.
  config.transformIgnorePatterns = ['^.+\\.module\\.(css|sass|scss)$'];
  return config;
};
