# Supabase Phase 1 — Authentication + Cloud Customers

## Overview

Phase 1 implements Supabase authentication and cloud-backed customer management. The existing localStorage system continues to work as a fallback. All other entities (orders, inventory, bouquets, etc.) remain on localStorage.

## Architecture

```
UI (CustomersPage)
    ↓
useCustomers() hook (useStore.ts)
    ↓
StorageAdapter (storageAdapter.ts)
    ├── LocalStorageAdapter (default, current behavior)
    └── SupabaseCustomerAdapter (when mode=supabase + user authenticated)
    ↓
localStorage / Supabase
```

## Files Created

| File | Purpose |
|------|---------|
| `src/services/authService.ts` | Supabase auth: sign up, sign in, sign out, session management |
| `src/services/storageAdapter.ts` | `CustomerStorageAdapter` interface + storage mode config |
| `src/services/supabaseStorage.ts` | `SupabaseCustomerAdapter` — CRUD customers via Supabase |
| `src/contexts/AuthContext.tsx` | React context for auth state (user, loading, signOut) |
| `src/components/auth/LoginModal.tsx` | Login/signup modal with translated errors |
| `src/components/cloud/CustomerMigrationPanel.tsx` | UI to switch storage mode + migrate local customers to cloud |
| `docs/supabase-phase1.md` | This file |

## Files Modified

| File | Change |
|------|--------|
| `src/App.tsx` | Wrapped with `AuthProvider` |
| `src/hooks/useStore.ts` | `useCustomers()` now supports async adapters |
| `src/components/layout/Sidebar.tsx` | Added auth UI (sign in button / user email + sign out) |
| `src/pages/CustomersPage.tsx` | Uses adapter-based `useCustomers()`, shows migration panel |
| `src/i18n/en.ts` | Added `auth.*` and `cloudCustomers.*` keys |
| `src/i18n/ru.ts` | Added `auth.*` and `cloudCustomers.*` keys |
| `src/i18n/bg.ts` | Added `auth.*` and `cloudCustomers.*` keys |
| `src/vite-env.d.ts` | Added `ImportMetaEnv` type declarations (from previous phase) |

## Authentication Flow

1. **No Supabase configured** (no `.env`): No login UI shown. Everything works on localStorage exactly as before.
2. **Supabase configured, not signed in**: Sidebar shows "Sign In" button. LoginModal opens.
3. **Signed in**: Sidebar shows user email + "Sign Out" button. Customers page shows cloud migration panel.

### Auth Operations

- **Sign Up**: Creates Supabase auth account (email + password, min 6 chars)
- **Sign In**: Email/password via `supabase.auth.signInWithPassword`
- **Sign Out**: `supabase.auth.signOut()`
- **Session persistence**: Supabase client handles token refresh automatically
- **Auth state changes**: Listened via `onAuthStateChange`, propagated through React context

### Error Handling

All auth errors are translated via i18n keys (`auth.invalidCredentials`, `auth.userExists`, etc.). Raw Supabase errors are never shown to users.

## Storage Adapter

### Interface (`CustomerStorageAdapter`)

```ts
interface CustomerStorageAdapter {
  getCustomers(): Customer[] | Promise<Customer[]>;
  addCustomer(customer: Customer): void | Promise<void>;
  updateCustomer(customer: Customer): void | Promise<void>;
  deleteCustomer(id: string): void | Promise<void>;
  deleteAllCustomers(): void | Promise<void>;
}
```

### Adapter Selection

`getCustomerAdapter()` in `useStore.ts` checks:
1. Is `storageMode === 'supabase'`? (stored in localStorage `flower-shop-storage-mode`)
2. Is Supabase configured and user authenticated?
3. If both yes → use `SupabaseCustomerAdapter`
4. Otherwise → use localStorage adapter (identical to current behavior)

### Storage Mode

Stored in `localStorage` key `flower-shop-storage-mode`:
- `"local"` (default) — all customers on localStorage
- `"supabase"` — customers CRUD goes to Supabase

Mode can be switched via the migration panel on the Customers page.

## Customer Migration

### Manual Migration (Explicit User Action)

The `CustomerMigrationPanel` on the Customers page provides:

1. **Storage mode toggle** — switch between Local and Cloud
2. **Count display** — shows local and cloud customer counts
3. **Migrate button** — uploads local customers to Supabase

### Migration Process

1. User clicks "Upload to Cloud"
2. Confirmation dialog shows count
3. For each local customer:
   - Check if ID already exists in Supabase (skip if yes)
   - Insert into `customers` table with `shop_id`
4. Report success/failure count
5. localStorage data is NOT deleted

### ID Preservation

All customer IDs (uuid v4) are preserved exactly. No regeneration. This prevents duplicates and allows re-migration.

### Duplicate Prevention

Before inserting, the adapter queries existing cloud customers and skips any with matching IDs.

## RLS Behavior

- All customer queries go through Supabase RLS
- Authenticated users can only see customers belonging to their `shop_id`
- `shop_id` is taken from `user.user_metadata.shop_id`
- The owner must set `shop_id` on the user profile after signup (future phase)

### Current Limitation

After sign up, the user has no `shop_id` in their profile yet. The `SupabaseCustomerAdapter.getShopId()` currently looks at `user.user_metadata.shop_id`. In a future phase, the login flow will create a `user_profiles` row with the correct `shop_id`.

**For now**: If `shop_id` is null, Supabase customer operations will fail gracefully (returning empty arrays or logging errors). The localStorage fallback always works.

## What Is NOT Migrated (Phase 1)

- Orders
- Inventory
- Bouquets
- Deliveries
- Reservations
- History
- Statistics
- Settings
- Reminders
- Language preference (still localStorage)
- Backup/restore (still localStorage)

These continue using the existing localStorage system without any changes.

## Environment Variables

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

If these are not set, the app works entirely on localStorage with no login UI.

## How to Test

1. **Without Supabase** (no `.env`):
   - App loads normally
   - No login UI in sidebar
   - Customers page works exactly as before
   - All CRUD on localStorage

2. **With Supabase** (`.env` configured):
   - Sidebar shows "Sign In" button
   - Sign up with email/password
   - Sign in
   - Customers page shows migration panel
   - Create/edit/delete customers → goes to Supabase
   - Sign out → customers still in Supabase
   - Sign in again → customers still visible
   - Switch to "Local Storage" mode → customers load from localStorage

3. **Cross-device**:
   - Sign in on PC → create customer → sign out
   - Sign in on phone → same customer visible
   - (Requires `shop_id` to be set on the user profile — future phase)

4. **Mobile (360-430px)**:
   - Login modal is full-width with proper padding
   - Migration panel stacks vertically
   - Customer cards display correctly

5. **Languages (EN/RU/BG)**:
   - Login modal text translates
   - Migration panel text translates
   - Error messages translate

## Known Limitations

1. **No `shop_id` on signup**: New users don't have a `shop_id` in their profile yet. Cloud customer operations will not work until this is set. localStorage fallback always works.

2. **No automatic data upload**: Local customers are NOT automatically synced to cloud. User must explicitly click "Upload to Cloud".

3. **No realtime**: Changes on one device are not reflected on another in real-time. User must refresh.

4. **No offline sync**: If Supabase is unreachable, the app falls back to localStorage silently.

5. **No profile management UI**: Users cannot change their password, email, or display name yet.

## Next Phase (Phase 2)

- Add `shop_id` management (create shop on first signup, assign user to shop)
- Migrate Orders to Supabase
- Migrate Inventory to Supabase
- Add realtime subscriptions for orders and inventory
