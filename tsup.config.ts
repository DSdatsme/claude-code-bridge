import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'core/index': 'src/core/index.ts',
    'next/index': 'src/next/index.ts',
  },
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  sourcemap: true,
  clean: true,
});
