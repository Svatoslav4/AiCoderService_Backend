import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Інтеграційні тести: справжній Nest-застосунок + справжня тестова БД Postgres.
// Зовнішні сервіси (GitHub API, Gemini) замокані.
//
// УВАГА: тести очищають таблиці (TRUNCATE). Тому БД задається НЕ через `dotenv/config`,
// а через setup/env.ts, який перемикає DATABASE_URL на базу `<name>_test`
// і відмовляється працювати з базою без суфікса `_test`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['test/integration/**/*.integration.spec.ts'],
    globalSetup: ['test/integration/setup/global-setup.ts'],
    setupFiles: ['test/integration/setup/env.ts'],
    // одна БД на всі файли: запускаємо послідовно, щоб тести не чистили дані один одному
    fileParallelism: false,
    restoreMocks: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
