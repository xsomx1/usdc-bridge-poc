import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Frontend source lives in web/, but shares this repo's package.json with
// the CLI POC (bridge:dry / bridge:send) — see ADR-0002 D1.
export default defineConfig({
  root: 'web',
  plugins: [react()],
  // src/config.ts reads process.env (it's shared with the CLI POC — see ADR-0002 D8).
  // The browser has no `process`; shim it to {} so config.ts's `??` fallbacks kick in.
  define: {
    'process.env': {},
  },
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
