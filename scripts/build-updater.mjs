#!/usr/bin/env node
// Bundles electron-updater (and its runtime dependencies) into one CommonJS
// file that lives inside electron/. electron-builder's `files` list does not
// ship nested node_modules, and this keeps the installer free of a full
// node_modules tree while still giving the main process a working updater.
//
// The output is generated, ignored by git and rebuilt by `npm run build`.

import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [join(root, 'node_modules', 'electron-updater', 'out', 'main.js')],
  outfile: join(root, 'electron', 'updater.bundle.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  // Electron is provided by the runtime, never bundled.
  external: ['electron'],
  legalComments: 'none',
  logLevel: 'warning',
});

console.log('electron/updater.bundle.cjs written');
