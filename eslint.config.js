import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'src-tauri/**', 'node_modules/**', 'docs/**', 'public/sw.js', 'dist-ext/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, __APP_VERSION__: 'readonly', __APP_COMMIT__: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // provider JSON is genuinely untyped
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-control-regex': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
);
