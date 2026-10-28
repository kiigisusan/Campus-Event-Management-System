import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', 'prisma/migrations/', 'uploads/'] },

  js.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // Unused params prefixed with _ are intentional (e.g. Express `_req`).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'no-console': 'off',
    },
  },

  {
    files: ['tests/**/*.js'],
    languageOptions: { globals: { ...globals.jest } },
  },

  // Must be last: turns off style rules that Prettier already handles.
  prettier,
];
