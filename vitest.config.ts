import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test'), __APP_COMMIT__: JSON.stringify('test') },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'happy-dom',
    restoreMocks: true,
    coverage: { include: ['src/lib/**', 'src/llm.ts', 'src/storage.ts', 'src/providers.ts', 'src/prompts.ts'] },
  },
});
