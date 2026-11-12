#!/usr/bin/env node
// Bumps the app version in every place that must stay in sync:
//   - package.json / package-lock.json (via `npm version`)
//   - android/app/build.gradle (versionName + versionCode)
//
// Usage: npm run release:next
//        npm run release:bump -- <major.minor.patch> [--force]
//
// Release rule: the patch number only ever grows by one, up to 9:
//   1.2.0 -> 1.2.1 -> ... -> 1.2.9 -> 1.3.0 -> 1.3.1 ...
// `release:next` always picks the allowed next version. Passing an explicit
// version is rejected unless it is exactly that version (override with --force).

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PATCH = 9;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function nextVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return patch < MAX_PATCH
    ? `${major}.${minor}.${patch + 1}`
    : `${major}.${minor + 1}.0`;
}

const args = process.argv.slice(2).map((arg) => arg.trim()).filter(Boolean);
const force = args.includes('--force');
const requested = args.find((arg) => !arg.startsWith('--')) ?? '';
const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const allowed = nextVersion(current);
const next = requested === '' || requested === 'next' ? allowed : requested;

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('Usage: npm run release:bump -- <major.minor.patch> [--force]');
  process.exit(1);
}

if (!force && next !== allowed) {
  console.error(`Release rule violation: next version after ${current} must be ${allowed}.`);
  console.error('Use: npm run release:next');
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
