import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Unit-тести: ізольовані класи з моками, без БД і мережі.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  // swc потрібен, бо esbuild не генерує emitDecoratorMetadata (на ньому тримається DI NestJS)
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    globals: true,
    root: './',
    include: ['test/unit/**/*.spec.ts'],
    setupFiles: ['test/unit/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.module.ts'],
    },
  },
});
