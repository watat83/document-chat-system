const nextJest = require('next/jest');
module.exports = nextJest({ dir: './' })({
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/?(*.)+(spec|test).ts?(x)'],
  testPathIgnorePatterns: ['/node_modules/', '/.next/', '/tests/regression/'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
});
