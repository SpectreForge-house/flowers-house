#!/usr/bin/env node
// Copies the locally built APK into release/ using the same file name that
// GitHub Actions publishes, so both places always show the same version.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const releaseDir = join(root, 'release');

const apkSource = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const apkTarget = join(releaseDir, `FlowersHouse-${version}.apk`);
const installer = join(releaseDir, `FlowersHouse-${version}-x64.exe`);

if (!existsSync(apkSource)) {
  console.error(`Release APK not found: ${apkSource}`);
  console.error('Run: npm run android:release');
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });
copyFileSync(apkSource, apkTarget);

if (!existsSync(installer)) {
  console.warn(`Windows installer for ${version} not found. Run: npm run dist:win`);
}

const files = readdirSync(releaseDir)
  .map(name => ({ name, size: statSync(join(releaseDir, name)).size }))
  .filter(file => file.name.includes(version))
  .sort((a, b) => a.name.localeCompare(b.name));

console.log(`\nLocal release files for ${version}:`);
for (const file of files) {
  console.log(`  ${file.name}  ${(file.size / 1024 / 1024).toFixed(2)} MB`);
}
