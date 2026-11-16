import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: true,
  platform: 'android',
  appVersion: '1.2.1',
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    getPlatform: () => mocks.platform,
  },
}));

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: async () => ({ version: mocks.appVersion, build: '19' }),
  },
}));

vi.mock('./apkUpdater', () => ({
  ApkUpdater: {
    getInfo: vi.fn(),
    download: vi.fn(),
    status: vi.fn(),
    install: vi.fn(),
    openInstallSettings: vi.fn(),
  },
}));

import { checkForUpdate, getUpdatePlatform, isNewerVersion, shouldAutoCheck } from './updateService';

const APK_DIGEST = 'sha256:' + 'a'.repeat(64);

function release(version: string, assets: Array<Record<string, unknown>> = []) {
  return {
    tag_name: `v${version}`,
    body: 'Release notes',
    draft: false,
    prerelease: false,
    assets,
  };
}

const apkAsset = {
  name: `FlowersHouse-1.2.2.apk`,
  size: 4_600_000,
  browser_download_url: 'https://github.com/SpectreForge-house/flowers-house/releases/download/v1.2.2/FlowersHouse-1.2.2.apk',
  digest: APK_DIGEST,
};

beforeEach(() => {
  mocks.native = true;
  mocks.platform = 'android';
  mocks.appVersion = '1.2.1';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => release('1.2.2', [apkAsset]) })));
});

describe('isNewerVersion', () => {
  it('compares numeric parts, not strings', () => {
    expect(isNewerVersion('1.2.10', '1.2.9')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.9.9')).toBe(true);
    expect(isNewerVersion('1.2.1', '1.2.1')).toBe(false);
    expect(isNewerVersion('1.2.0', '1.2.1')).toBe(false);
  });

  it('ignores the leading v', () => {
    expect(isNewerVersion('v1.3.0', '1.2.9')).toBe(true);
  });
});

describe('checkForUpdate on Android', () => {
  it('returns the newer APK with its checksum', async () => {
    const result = await checkForUpdate();

    expect(result.status).toBe('available');
    if (result.status !== 'available') return;
    expect(result.info.version).toBe('1.2.2');
    expect(result.info.fileName).toBe('FlowersHouse-1.2.2.apk');
    expect(result.info.sha256).toBe('a'.repeat(64));
    expect(result.info.sizeBytes).toBe(4_600_000);
  });

  it('reports the latest version when nothing is newer', async () => {
    mocks.appVersion = '1.2.2';
    const result = await checkForUpdate();

    expect(result).toEqual({ status: 'latest', version: '1.2.2' });
  });

  it('ignores prereleases', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ...release('1.2.3', [apkAsset]), prerelease: true }),
    })));

    const result = await checkForUpdate();
    expect(result.status).toBe('latest');
  });

  it('fails cleanly when the release has no APK', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => release('1.2.2', []) })));

    const result = await checkForUpdate();
    expect(result).toEqual({ status: 'error', message: 'The release has no APK asset' });
  });

  it('fails cleanly when GitHub is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));

    const result = await checkForUpdate();
    expect(result).toEqual({ status: 'error', message: 'network down' });
  });
});

describe('platform detection', () => {
  it('does not check for updates in a browser', async () => {
    mocks.native = false;
    mocks.platform = 'web';

    expect(getUpdatePlatform()).toBe('web');
    expect(shouldAutoCheck()).toBe(false);
    expect(await checkForUpdate()).toEqual({ status: 'unsupported' });
  });
});
