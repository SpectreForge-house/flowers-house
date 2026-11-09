import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export type BackupExportMethod = 'download' | 'share';

/**
 * Saves the backup JSON. In the desktop/browser build this triggers a normal
 * file download; in the Android app it writes the file to the cache and opens
 * the system share sheet, so the user can save it to Files, Drive, Telegram,
 * etc. (WebView does not handle <a download> for blob URLs reliably.)
 */
export async function exportBackupFile(filename: string, json: string): Promise<BackupExportMethod> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: filename,
      files: [uri],
      dialogTitle: filename,
    });
    return 'share';
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return 'download';
}
