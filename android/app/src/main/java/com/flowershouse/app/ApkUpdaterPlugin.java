package com.flowershouse.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

/**
 * Downloads the release APK from GitHub Releases with DownloadManager, verifies
 * its SHA-256 digest and hands it to the system installer through FileProvider.
 *
 * Android never allows a silent APK install: the system "Update this app?"
 * confirmation stays, this plugin only removes the manual download/transfer.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String DOWNLOAD_DIR = Environment.DIRECTORY_DOWNLOADS;
    // The DownloadManager id of the most recent download started by this
    // plugin. Used only as a fallback when the id is lost in the JS bridge.
    private long lastDownloadId = -1L;

    @PluginMethod
    public void getInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            Context context = getContext();
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            result.put("versionName", info.versionName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result.put("versionCode", info.getLongVersionCode());
            } else {
                result.put("versionCode", (long) info.versionCode);
            }
            result.put("canInstall", canInstallPackages());
        } catch (Exception error) {
            call.reject("Could not read the app version: " + error.getMessage());
            return;
        }
        call.resolve(result);
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String fileName = call.getString("fileName");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Only HTTPS download URLs are allowed");
            return;
        }
        String safeName = sanitizeFileName(fileName);
        if (safeName == null) {
            call.reject("Invalid file name");
            return;
        }

        try {
            Context context = getContext();
            File destination = new File(context.getExternalFilesDir(DOWNLOAD_DIR), safeName);
            if (destination.exists() && !destination.delete()) {
                call.reject("Could not replace the previous download");
                return;
            }

            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("Download manager is not available");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle(safeName);
            request.setDescription("Flower's House update");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
            request.setDestinationInExternalFilesDir(context, DOWNLOAD_DIR, safeName);
            long id = manager.enqueue(request);
            if (id <= 0) {
                call.reject("Download manager did not return a download id");
                return;
            }
            lastDownloadId = id;

            JSObject result = new JSObject();
            result.put("id", id);
            result.put("fileName", safeName);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not start the download: " + error.getMessage());
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        // Capacitor's PluginCall.getLong() only accepts a Long, while small
        // JSON numbers arrive as Integer. Reading the raw value keeps the id
        // from being dropped ("Missing download id") on every normal download.
        Long id = readDownloadId(call.getData().opt("id"));
        if (id == null || id <= 0) {
            id = lastDownloadId > 0 ? lastDownloadId : null;
        }
        if (id == null) {
            call.reject("Missing download id");
            return;
        }

        DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("Download manager is not available");
            return;
        }

        JSObject result = new JSObject();
        result.put("state", "pending");
        result.put("bytes", 0L);
        result.put("total", 0L);

        Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id));
        if (cursor == null) {
            result.put("state", "failed");
            call.resolve(result);
            return;
        }

        try {
            if (!cursor.moveToFirst()) {
                result.put("state", "failed");
                call.resolve(result);
                return;
            }
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            long bytes = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            String reason = "";
            int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
            if (reasonIndex >= 0) {
                reason = cursor.getString(reasonIndex);
            }

            switch (status) {
                case DownloadManager.STATUS_SUCCESSFUL:
                    result.put("state", "successful");
                    break;
                case DownloadManager.STATUS_FAILED:
                    result.put("state", "failed");
                    result.put("reason", reason == null ? "" : reason);
                    break;
                case DownloadManager.STATUS_PAUSED:
                    result.put("state", "paused");
                    break;
                case DownloadManager.STATUS_RUNNING:
                    result.put("state", "running");
                    break;
                case DownloadManager.STATUS_PENDING:
                default:
                    result.put("state", "pending");
                    break;
            }
            result.put("bytes", bytes);
            result.put("total", total);
        } finally {
            cursor.close();
        }

        call.resolve(result);
    }

    @PluginMethod
    public void install(PluginCall call) {
        String fileName = sanitizeFileName(call.getString("fileName"));
        String sha256 = call.getString("sha256");
        if (fileName == null) {
            call.reject("Invalid file name");
            return;
        }

        JSObject result = new JSObject();
        result.put("started", false);

        if (!canInstallPackages()) {
            result.put("needPermission", true);
            call.resolve(result);
            return;
        }

        try {
            File apk = new File(getContext().getExternalFilesDir(DOWNLOAD_DIR), fileName);
            if (!apk.exists()) {
                call.reject("The update file was not downloaded yet", "DOWNLOAD_MISSING");
                return;
            }

            if (sha256 != null && !sha256.isEmpty()) {
                String actual = sha256Of(apk);
                if (actual == null || !actual.equalsIgnoreCase(sha256)) {
                    // A corrupted or replaced file must never reach the installer.
                    apk.delete();
                    call.reject("CHECKSUM_MISMATCH", "The downloaded update failed its checksum check");
                    return;
                }
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not open the installer: " + error.getMessage());
        }
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
                // Fall through to the global settings screen.
            }
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception error) {
                call.reject("Could not open the install permission settings: " + error.getMessage());
                return;
            }
        }
        call.reject("This Android version does not need the install permission");
    }

    private boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return getContext().getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    private static Long readDownloadId(Object value) {
        if (value instanceof Number) {
            return ((Number) value).longValue();
        }
        if (value instanceof String) {
            try {
                return Long.parseLong(((String) value).trim());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private static String sanitizeFileName(String fileName) {
        if (fileName == null) return null;
        String name = fileName.trim();
        if (name.isEmpty() || name.length() > 120) return null;
        if (!name.toLowerCase(Locale.ROOT).endsWith(".apk")) return null;
        if (!name.matches("[A-Za-z0-9._-]+")) return null;
        return name;
    }

    private static String sha256Of(File file) {
        try (InputStream input = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[16 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
            StringBuilder hex = new StringBuilder();
            for (byte value : digest.digest()) {
                hex.append(String.format(Locale.ROOT, "%02x", value));
            }
            return hex.toString();
        } catch (Exception error) {
            return null;
        }
    }
}
