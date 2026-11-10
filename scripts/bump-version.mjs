#!/usr/bin/env node
// Bumps the app version in every place that must stay in sync:
//   - package.json / package-lock.json (via `npm version`)
//   - android/app/build.gradle (versionName + versionCode)
//
// Usage: npm run release:bump -- 1.1.4

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const next = (process.argv[2] ?? '').trim();

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: npm run release:bump -- <major.minor.patch>');
  process.exit(1);
}

const gradlePath = join(root, 'android', 'app', 'build.gradle');
const gradle = readFileSync(gradlePath, 'utf8');

const versionCode = gradle.match(/versionCode\s+(\d+)/);
const versionName = gradle.match(/versionName\s+"([^"]+)"/);

if (!versionCode || !versionName) {
  console.error('Could not find versionCode/versionName in android/app/build.gradle');
  process.exit(1);
}

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (current === next) {
  console.error(`Version is already ${next}`);
  process.exit(1);
}

const nextCode = Number(versionCode[1]) + 1;
const updated = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${nextCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${next}"`);

writeFileSync(gradlePath, updated);

try {
  // `next` is validated as digits and dots, so it is safe to interpolate.
  execSync(`npm version ${next} --no-git-tag-version`, {
    cwd: root,
    stdio: 'inherit',
  });
} catch (error) {
  // Restore the Gradle file if npm refused the bump.
  writeFileSync(gradlePath, gradle);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`\nVersion ${current} -> ${next}`);
console.log(`Android versionCode ${versionCode[1]} -> ${nextCode}`);
