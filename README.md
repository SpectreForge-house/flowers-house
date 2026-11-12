# Flower's House

[![CI](https://github.com/SpectreForge-house/flowers-house/actions/workflows/ci.yml/badge.svg)](https://github.com/SpectreForge-house/flowers-house/actions/workflows/ci.yml)

A CRM for a flower shop: orders, deliveries, inventory, bouquets, customers,
statistics, history and backups. It runs as a Windows desktop app (Electron), in
the browser/PWA, and as an Android app (Capacitor). Data is stored locally by
default; Supabase is an optional cloud backend.

## Features

- **Orders** — delivery orders and in-store sales, status workflow from `new`
  through `completed` or `cancelled`, automatic inventory deduction,
  reservations and delivery records.
- **Customers** — contact details, photos, important dates, purchase history and
  automatic New / Regular / VIP status.
- **Inventory** — stock levels, low-stock alerts, receipts, write-offs, waste
  tracking and an inventory value calculator. Photos can be imported from the
  PC, phone camera, clipboard or drag-and-drop and turned into stock rows for
  review before anything is saved.
- **Bouquets** — composition, cost, profit, margin and photos.
- **Deliveries and calendar** — daily delivery schedule and upcoming customer
  dates.
- **Statistics** — revenue, profit, top bouquets and sales charts.
- **Finance (owner only)** — a month calendar cash-book: every day shows its
  revenue and expenses, clicking a day opens that day's entries with editing
  and deletion, and month summaries show gross revenue, expenses, net profit
  and average daily revenue. Entries can be added for any date, and local
  entries missing from the cloud are offered for one-click upload.
- **Mobile reminders** — local Android notifications for upcoming customer
  dates and an evening nudge to enter the day's revenue, both configurable in
  **Settings** with a test-notification button.
- **History** — audit trail for orders, stock, customers and settings.
- **Backups** — JSON export/import plus automatic folder backups (desktop) that
  include photos.
- **Localization** — English, Russian and Bulgarian.
- **Themes** — sixteen built-in themes plus a custom theme editor.
- **Team roles** — owner, manager and staff permissions with one-time invite codes.
- **Offline-capable** — local storage by default; Supabase is opt-in, caches cloud reads per user and blocks cloud writes while offline.

## Tech stack

React 18, TypeScript, Vite 5, Tailwind CSS, React Router, Recharts, `date-fns`,
`lucide-react`, Supabase JS, Electron 33, `vite-plugin-pwa`,
`electron-builder` and Capacitor 8 (Android).

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Windows 10/11 for the desktop installer
- Java 21 and Android SDK 36 (`platform-tools`, `platforms;android-36`,
  `build-tools;36.0.0`) for Android builds
- macOS/Linux can be used for web development; the provided `.bat`/`.vbs`
  launchers are Windows-only

## Quick start

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally <http://localhost:5173>.

On first launch the app seeds sample data and stores CRM records in
`localStorage` under keys prefixed with `flower-shop-`.

### Optional Supabase configuration

Copy `.env.example` to `.env` and fill in the project values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Use the **anon/public** key only. Never put a service-role key in a Vite
environment variable. Without these values the app stays fully local and cloud
features remain hidden. Restart the dev server after changing `.env`.

### Supabase setup

1. Create a project at <https://supabase.com>.
2. Run the migrations in `supabase/migrations/` in order (`001` through `014`)
   in the Supabase SQL Editor. See [Supabase backend](#supabase-backend) for the
   migration list.
3. Put the project URL and anon key into `.env` and restart the dev server.
4. Start the app and sign up with email/password. The first sign-in creates the
   shop and owner profile.
5. After sign-in the app switches to Supabase automatically when a cloud account
   is available. Use **Settings → Cloud Customers** to upload existing local
   records, switch back to local storage, or re-enable automatic switching. The
   app falls back to local storage when Supabase is not configured or the user
   is signed out.

## Desktop app

```bash
npm run electron
```

Electron starts the Vite dev server on `127.0.0.1:5173` if it is not already
running, opens the desktop window, and stops the server when the app exits. A
watchdog process also cleans up the server if Electron exits unexpectedly.

### Windows launchers

| File | Purpose |
| --- | --- |
| `start-flower-shop.bat` | Runs Electron from source in a visible console |
| `launch.vbs` | Starts Electron silently without a console window |
| `create-shortcuts.bat` | Creates Start and Stop shortcuts on the Desktop |
| `stop-flower-shop.bat` | Stops only Electron/Node processes belonging to this folder |

The launchers resolve the project directory from their own location, so the
folder can be moved without editing them. They require `npm install` and run the
app from source; use the installer build for a standalone desktop app.

## Android app

The Capacitor project lives in `android/`. It targets Android 36, supports
Android 7.0+ (`minSdk 24`) and uses the same React build as the web app.

```bash
npm run android:sync # build dist/ and copy it into the native project
npm run android:open # open android/ in Android Studio
npm run android:apk  # build a debug APK on Windows
```

The debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`. The signed release APK is
written to `android/app/build/outputs/apk/release/app-release.apk`:

```bash
npm run android:release
```

Release signing reads `android/keystore.properties` and the keystore referenced
by `storeFile`. Both files are git-ignored. Keep the keystore and passwords in a
safe place: losing them prevents future updates to the same app.

Email confirmation and password-reset links use the
`com.flowershouse.app://` custom scheme and reopen the app. Add these URLs to
Supabase **Authentication → URL Configuration → Redirect URLs**:

- `com.flowershouse.app://auth/confirm`
- `com.flowershouse.app://reset-password`

The mobile layout uses bottom tabs (Dashboard, Orders, Customers, Inventory)
and a **More** sheet for the remaining screens, language and account controls.

## Build and package

```bash
npm run build           # type-check + production web build into dist/
npm run pack            # unpacked Electron app in release/
npm run dist:win        # Windows NSIS installer in release/
npm run android:apk     # debug APK in android/app/build/outputs/apk/debug/
npm run android:release # signed release APK in android/app/build/outputs/apk/release/
npm run release:local   # installer + signed APK, both copied into release/
npm run release:next    # bump to the next allowed version (see below)
```

### Versioning rule

The patch number grows by exactly one per release and never goes above 9:

```text
1.2.0 -> 1.2.1 -> ... -> 1.2.9 -> 1.3.0 -> 1.3.1 -> ... -> 1.3.9 -> 1.4.0
```

`npm run release:next` always computes that next version and updates
`package.json`, the lockfile and the Android `versionName`/`versionCode` in one
step. Passing an explicit version is refused unless it is exactly the next
allowed one; `--force` exists only for emergency fixes.

## CI and releases

GitHub Actions runs lint, type-check, tests and the production build on every
push and pull request. It also builds a debug APK and, on `main`, the Windows
installer.

Pushing a `v*` tag builds a signed release APK and publishes both the APK and
the Windows installer on the repository's **Releases** page:

```bash
npm run release:next            # e.g. 1.2.0 -> 1.2.1
npm run release:local           # optional: same files in the local release/ folder
VER=$(node -p "require('./package.json').version")
git commit -am "chore: release $VER"
git tag "v$VER"
git push origin main --tags
```

Local `release/` output is git-ignored. It only changes when `release:local`
runs; builds published on GitHub are produced by CI from the same version.

The workflow expects these repository secrets:

| Secret | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL injected at build time |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key injected at build time |
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Release key alias |
| `ANDROID_KEY_PASSWORD` | Release key password |

Never add a Supabase `service_role` key: only the anon key belongs in a client
build.

The packaged app serves the built files through a custom `app://bundle/`
protocol instead of a local web server. It uses the normal BrowserRouter, and
the service worker is disabled inside Electron. Photos are stored under
Electron's `userData` directory; automatic backups are written to the folder
chosen in Settings.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build the production web app |
| `npm run preview` | Preview the production web build |
| `npm run lint` | Run oxlint over `src` and `electron` |
| `npm run typecheck` | Run the TypeScript project build |
| `npm test` | Run unit tests once with Vitest |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run electron` | Run the Electron app against the dev server |
| `npm start` | Alias for `npm run electron` |
| `npm run pack` | Build an unpacked Electron app |
| `npm run dist` | Build the configured installer |
| `npm run dist:win` | Build the Windows NSIS installer |
| `npm run android:sync` | Build the web app and sync it into `android/` |
| `npm run android:open` | Open the native project in Android Studio |
| `npm run android:apk` | Build a debug Android APK (Windows) |

## Architecture

### Runtime overview

```text
Browser / PWA                     Electron desktop
      |                                 |
      v                                 v
React renderer (src/)  <---- IPC ---->  electron/main.cjs
      |                                 |
      v                                 +--> app:// serves dist/
Domain services (src/services/)         +--> photos + backups on disk
      |
      +--> localStorage (default)
      +--> Supabase adapters (opt-in)
```

### Renderer

- `src/main.tsx` mounts React and registers the PWA service worker only outside
  Electron. The worker is skipped for the `file:` and `app:` protocols.
- `src/App.tsx` wires the language, auth and theme providers, sets up routing and
  lazy-loads every page. `Layout` provides the application shell and sidebar.
- `src/hooks/useStore.ts` is the central data hook. It exposes domain state and
  CRUD actions, and selects the correct storage adapter at runtime.
- `src/services/` contains business rules, local storage, Supabase adapters,
  photo handling, backups and history.
- `src/types/index.ts` defines the domain models shared by the UI and services.
- `src/i18n/` contains the English, Russian and Bulgarian translations.
- `src/themes/` contains built-in theme tokens and custom theme support.
- `src/data/sampleData.ts` supplies the first-run demo data.

### Data and storage

Local mode is the default:

- `src/services/storage.ts` owns the `flower-shop-*` localStorage schema,
  first-run seeding, storage-version migration and backup export/import.
- Adapter interfaces live in `storageAdapter.ts`, `inventoryStorageAdapter.ts`,
  `bouquetStorageAdapter.ts`, `orderStorageAdapter.ts` and
  `historyStorageAdapter.ts`.
- `useStore` chooses Supabase only when the storage mode is `supabase`, Supabase
  is configured, and a user is signed in. Otherwise it falls back to local
  storage.

Desktop photo handling:

- Electron stores photo files in `<userData>/photos`.
- The browser build falls back to IndexedDB.
- `src/services/photoStorage.ts` migrates browser photos to disk when the app
  first runs in Electron.

Backups:

- JSON export/import works in the browser, desktop app and Android app.
- On Android, creating a backup writes the JSON to the app cache and opens the
  system share sheet, so it can be saved to Files, Drive, Telegram, etc.
- Automatic folder backups are desktop-only. Each backup is written as
  `backup-YYYY-MM-DD-HHmm/data.json` plus a copy of the photos folder, and old
  backups are pruned to the configured keep count.
- Backup settings stay local and are not included in the backup payload.
- Custom themes are part of the backup payload. Old backups without themes
  restore the data and leave the themes already installed on the device.
- In cloud mode a restore first writes the backup into the local copy and
  switches the device to local storage, so the cloud records are never
  replaced silently. After the restart the restored data can be uploaded to
  the cloud from the cloud section in Settings.

### Electron shell

- `electron/main.cjs` creates the window, manages the dev server lifecycle,
  registers the `app://` protocol, and handles photo/backup IPC.
- `electron/preload.cjs` exposes two narrow bridges, `window.flowerPhotos` and
  `window.flowerBackup`. The renderer never gets direct filesystem access.
- `contextIsolation` is enabled and `nodeIntegration` is disabled. Filenames and
  backup paths are re-validated in the main process to prevent path traversal.
- `electron/watchdog.cjs` stops the dev server and removes the PID file if the
  Electron process disappears.
- In development the window loads `http://127.0.0.1:5173`. In production it loads
  `app://bundle/`; the protocol serves `dist/` with an `index.html` fallback for
  client-side routes.

### PWA

`vite-plugin-pwa` is configured with `autoUpdate`. It caches the built assets and
Google Fonts, and uses the manifest in `public/manifest.json`. The service worker
is registered only for browser/PWA sessions. Relative asset URLs (`base: './'`)
keep the same build usable by both the web app and Electron.

### Android shell

`capacitor.config.ts` points Capacitor at `dist/` and uses the app id
`com.flowershouse.app`. `npx cap sync android` copies the built web assets and
native plugins into `android/`. The `MobileNav` component replaces the desktop
sidebar below the `lg` breakpoint with bottom tabs and a **More** sheet.
`initAuthDeepLinks()` listens for `appUrlOpen` events and converts Supabase
recovery/confirmation tokens into a local session before opening the matching
route. Android edge-to-edge layout is handled with `env(safe-area-inset-*)`
padding and `viewport-fit=cover`.

### Supabase backend

`src/lib/supabase.ts` creates the client only when both environment variables
are present. Authentication is email/password with email confirmation and a
password-reset flow (`/reset-password`). Set `VITE_PUBLIC_APP_URL` so
confirmation and reset links return to the deployed web app; native builds use
the `com.flowershouse.app://` scheme instead. The first sign-in creates the shop
and owner profile through `create_initial_shop_and_profile`.

The schema includes:

`shops`, `user_profiles`, `customers`, `inventory_items`, `bouquets`,
`bouquet_items`, `orders`, `order_items`, `deliveries`,
`inventory_transactions`, `inventory_reservations`, `history`, `settings`,
`user_reminders_read`, `user_reminders_dismissed`, `client_purchases`,
`finance_entries`, `photos`, `shop_invites` and `app_meta`.

Apply the migrations in order:

| Migration | Purpose |
| --- | --- |
| `001_initial_schema.sql` | Tables, indexes, RLS policies and RPC functions |
| `002_add_insert_rls_policies.sql` | Additional insert policies |
| `003_bootstrap_shop_profile.sql` | First sign-in shop/profile bootstrap |
| `004_fix_user_profiles_rls_recursion.sql` | Fixes profile RLS recursion |
| `005_confirm_order_atomicity.sql` | Atomic order-confirmation RPC |
| `006_cloud_parity.sql` | Purchases, photos, reminder state, atomic orders, realtime |
| `007_rls_hardening.sql` | Role matrix, safe bootstrap, RLS/RPC hardening |
| `008_team_invites.sql` | One-time team invites, member listing and controlled shop switching |
| `009_order_sequence_sync.sql` | Keeps `order_number_seq` in sync with migrated `ORD-XXX` ids |
| `010_order_integrity.sql` | Atomic order + delivery + reservations, reservation-aware stock deduction and stock RPC |
| `011_nickname_cooldown.sql` | Profile nicknames with a 3-day change cooldown |
| `012_inventory_intake_fields.sql` | Supplier, SKU, pack note and notes on inventory items |
| `013_purchase_delivery_address.sql` | Optional delivery address on manually added client purchases |
| `014_finance_entries.sql` | Owner-only finance cash-book table, RLS and realtime |

Shop data is scoped by `shop_id` and protected by RLS; profile, reminder and
app-meta rows use their own user/owner policies. Owners can invite managers and
staff from **Settings → Team** with a one-time email-bound code; acceptance is
limited to an empty auto-created shop so existing data is never merged silently.
Cloud mode covers customers,
inventory (items, transactions, reservations), bouquets, orders, deliveries,
history, settings, manual purchases, finance entries, photo files and reminder
state. In cloud
mode the cloud is authoritative: successful reads are cached per user, offline
reads fall back to that cache, and cloud writes are blocked until reconnect
(they do not queue for later sync). The local workspace keys are never
overwritten by cloud data, so switching back to local mode preserves them.

### Team roles

The UI follows the same role matrix as RLS. Local mode and signed-out local
usage behave as the owner of local data.

| Capability | Owner | Manager | Staff |
| --- | --- | --- | --- |
| View dashboard, orders, customers, inventory, bouquets, history | yes | yes | yes |
| Create and edit business records | yes | yes | yes |
| Delete business records | yes | yes | no |
| Cancel orders and edit photos | yes | yes | yes |
| View revenue and financial totals | yes | yes | no |
| View the Statistics page | yes | no | no |
| Open the Finance page and manage the cash-book | yes | no | no |
| Open settings and change business settings | yes | yes | no |
| Edit shop information (name, address, phone, email) | yes | no | no |
| Manage team, transfer ownership and invite codes | yes | no | no |
| Cloud migration, backup/restore and reset data | yes | no | no |

Hidden buttons are a UX convenience only; Supabase RLS still rejects
unauthorized writes. A pending invite that cannot be applied is shown in a
banner. Terminal invite errors discard the stored code, while recoverable
errors such as `email_mismatch` keep it for the next sign-in.

## Project structure

```text
android/               Capacitor native Android project
electron/              Electron main process, preload bridges and watchdog
public/                Static assets, icons and PWA manifest
scripts/               PowerShell maintenance scripts
src/
  components/          Layout, UI primitives, forms and dialogs
  contexts/            Auth and theme providers
  data/                Sample data used on first launch
  hooks/               Store, history, photo and form hooks
  i18n/                English / Russian / Bulgarian translations
  lib/                 Supabase client
  pages/               One component per application screen
  services/            Business logic, storage and Supabase adapters
  test/                Vitest setup
  themes/              Theme tokens and custom theme handling
  types/               Domain models
  utils/               Formatters and small helpers
supabase/migrations/   SQL schema, RLS and RPC functions
docs/                  Storage and Supabase design notes
.github/workflows/     CI workflow
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Vitest runs in a Node environment with a `localStorage` mock from
`src/test/setup.ts`. The suites (97 tests) cover formatters, client-status rules,
inventory calculations, finance summaries and editing, notification scheduling,
reminder dismissal, permissions, cloud health and reconciliation.
GitHub Actions runs lint, type-check, tests and the production build on pushes
and pull requests, then uploads `dist/` as an artifact. Every run also builds
and uploads a debug Android APK. Pushes to `main`/`master` and manual dispatches
additionally build and upload the Windows NSIS installer.

## Troubleshooting

- **Port 5173 is busy** — run `stop-flower-shop.bat` or close the process using
  the port. Electron expects the dev server on `127.0.0.1:5173`.
- **Supabase controls are missing** — check `.env`, restart the dev server,
  confirm the migrations ran, then sign in and switch to cloud mode in
  **Settings → Cloud Customers**.
- **Desktop launchers fail** — run `npm install` and verify
  `node_modules\electron` exists, or start with `npm run electron`.
- **Where is my data?** — browser CRM records live in `localStorage` and browser
  photos use IndexedDB; desktop photos live under Electron's `userData`
  directory, while automatic backups go to the folder chosen in Settings. JSON
  backups can be exported and imported from Settings.

## License

Private project. All rights reserved.
