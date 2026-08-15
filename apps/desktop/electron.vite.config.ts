import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { builtinModules } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'electron-vite';

const external = [
  'electron',
  'better-sqlite3',
  ...builtinModules,
  ...builtinModules.map((module) => `node:${module}`),
];

export default defineConfig({
  main: {
    build: {
      outDir: 'app/out/main',
      rollupOptions: { external },
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  },
  preload: {
    build: {
      outDir: 'app/out/preload',
      rollupOptions: {
        external,
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  },
  renderer: {
    build: { outDir: 'app/out/renderer' },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  },
});
