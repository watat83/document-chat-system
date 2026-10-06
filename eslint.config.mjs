import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
export default [
  ...nextVitals, ...nextTypescript,
  { ignores: ['.next/**', 'node_modules/**', 'dist/**', 'build/**', 'public/pdf-worker/**'] },
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { rules: { '@typescript-eslint/no-unused-vars': 'warn', '@typescript-eslint/no-explicit-any': 'warn', 'prefer-const': 'warn' } },
];
