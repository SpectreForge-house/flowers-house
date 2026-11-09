# Supabase Setup Guide — Flower's House CRM

## Overview

This document explains how to set up the Supabase backend for the Flower's House CRM. Supabase is now a first-class storage mode (Settings -> Cloud), while localStorage remains available for offline/local use. The cloud mode includes data migration, photos in Supabase Storage, realtime refresh, cloud backups and an offline read-only banner. When cloud mode is active it is authoritative: successful reads are cached per user in a separate local namespace, offline reads fall back to that cache, and cloud writes are blocked until the connection returns.

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Choose a project name (e.g., `flower-house-crm`)
4. Set a strong database password (save it somewhere safe)
5. Choose a region close to your users
6. Click "Create new project"
7. Wait for the project to be ready (1-2 minutes)

## 2. Apply Database Migration

1. In the Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Apply every migration in order: `001_initial_schema.sql`, `002_add_insert_rls_policies.sql`, `003_bootstrap_shop_profile.sql`, `004_fix_user_profiles_rls_recursion.sql`, `005_confirm_order_atomicity.sql`, `006_cloud_parity.sql`, `007_rls_hardening.sql`, `008_team_invites.sql`, `009_order_sequence_sync.sql`, `010_order_integrity.sql`, `011_nickname_cooldown.sql`, `012_inventory_intake_fields.sql`, `013_purchase_delivery_address.sql`, then `014_finance_entries.sql`
4. Copy the entire SQL content of each file into the query editor and click "Run" (Ctrl+Enter)
5. Verify: you should see "Success. No rows returned" at the bottom

Migration `006_cloud_parity.sql` adds:
- `photos` metadata table + Storage RLS policies
- `shops` update policy (needed to save shop profile fields)
- `create_order_atomic` (order + items + delivery in one transaction)
- realtime publication entries for customers, orders, inventory, deliveries and purchases
- the private `shop-photos` bucket and its access policies

Migration `007_rls_hardening.sql` adds:
- `current_shop_id()` / `current_user_role()` helpers with a pinned `search_path`
- an idempotent, `auth.uid()`-only shop/profile bootstrap
- the owner/manager/staff role matrix for deletes and settings
- owner-only staff management and last-owner protection
- cross-shop checks in order/inventory RPCs and inventory-flag protection
- a cancellation RPC for deleting a delivery without giving staff broad delete rights

Migration `008_team_invites.sql` adds:
- the `shop_invites` table with owner-only reads and no direct client writes
- one-time, email-bound invite codes with a 7-day expiry
- `create_shop_invite`, `revoke_shop_invite`, `accept_shop_invite` and `list_shop_members` RPCs
- controlled transfer of an invited user from their empty auto-created shop into the inviting shop
- an 8th schema-health check in **Settings → Cloud**

Migration `009_order_sequence_sync.sql` adds:
- a trigger that advances `order_number_seq` whenever an explicit `ORD-XXX` order id is inserted
- a one-time backfill of the sequence from orders that were migrated before this migration
- protection against new orders reusing ids such as `ORD-001` after a local-to-cloud migration

Migration `010_order_integrity.sql` adds:
- atomic creation of the order, its items, delivery and inventory reservations in one transaction
- reservation-aware stock checks, including `deduct_inventory_for_order`, so two orders cannot overbook the same stock
- automatic completion of an order's active reservations when its inventory is deducted
- the `adjust_inventory_stock` RPC for add/remove/waste, replacing read-modify-write updates
- a `schema_version` value in `app_meta` used by the in-app health check

Migration `011_nickname_cooldown.sql` adds:
- a `display_name_updated_at` column on `user_profiles`
- `update_my_profile` nickname validation (trimmed, 1–40 characters) and a 3-day change cooldown
- schema version `11` for the in-app health check

Migration `012_inventory_intake_fields.sql` adds:
- optional `supplier`, `supplier_sku`, `pack_note` and `notes` columns on `inventory_items`
- a supplier index for catalog lookups

Migration `013_purchase_delivery_address.sql` adds:
- an optional `delivery_address` column on `client_purchases`, so every manually added bouquet can store its own delivery address.
- schema version `13` for the in-app health check

Migration `014_finance_entries.sql` adds:
- the owner-only `finance_entries` table for the daily cash-book (revenue and expenses)
- row-level security that rejects reads and writes from managers and staff
- realtime publication so a second owner device updates immediately
- schema version `14` for the in-app health check

### What the migration creates:

**20 tables:**
| Table | Purpose |
|-------|---------|
| `shops` | Multi-shop support (one row for Flower's House) |
| `customers` | Customer records |
| `inventory_items` | Inventory products (flowers, vases, ribbons, etc.) |
| `bouquets` | Bouquet definitions |
| `bouquet_items` | Junction: bouquet ingredients ↔ inventory items |
| `orders` | Customer orders |
| `order_items` | Junction: order items ↔ bouquets |
| `deliveries` | Delivery records (auto-created per order) |
| `inventory_transactions` | Stock change audit trail (add/remove/waste) |
| `inventory_reservations` | Reserved stock for pending orders |
| `history` | Full audit log |
| `settings` | Business settings (singleton per shop) |
| `user_profiles` | Auth user profiles with roles |
| `shop_invites` | One-time team invite codes |
| `user_reminders_read` | Per-user read reminder state |
| `user_reminders_dismissed` | Per-user dismissed reminder state |
| `client_purchases` | Manually added client purchase history |
| `photos` | Photo metadata for the storage bucket |
| `finance_entries` | Owner-only daily revenue and expenses |
| `app_meta` | Storage versioning metadata |

**Base RPC functions (001):**
| Function | Purpose |
|----------|---------|
| `generate_order_id()` | Returns next `ORD-XXX` ID using a server-side sequence |
| `deduct_inventory_for_order(order_id, items)` | Atomic inventory deduction with row-level locking |
| `set_order_number(n)` | Sets the order sequence (for post-migration initialization) |

**Indexes** for efficient queries.

**CHECK constraint:** `inventory_items.quantity >= 0` — prevents negative stock at the database level.

**Row Level Security (RLS)** enabled on all tables — see section 5 below.

## 3. Create Initial Shop

After applying the migration, insert your shop:

```sql
INSERT INTO shops (name, address, phone, email)
VALUES ('Flower''s House', 'Your Address Here', '+1234567890', 'info@flowershouse.com');
```

Copy the generated UUID — you'll need it for the `settings` table and future data migration.

## 4. Insert Default Settings

```sql
INSERT INTO settings (shop_id, shop_name, currency, currency_symbol)
VALUES ('<your-shop-uuid>', 'Flower''s House', 'EUR', '€');
```

## 4b. Photo Storage Bucket

`006_cloud_parity.sql` creates the private `shop-photos` bucket and its access policies automatically. Verify it under **Storage** after running the migration; no manual bucket creation is needed.

Photos are stored under `<shop_id>/<owner_kind>/<owner_id>/<filename>` and their metadata is kept in the `photos` table. Cloud backups embed these files, and the app falls back to the local cache when offline.

## 5. Row Level Security (RLS)

RLS is enabled on every table. The security model:

- **Authenticated users** can only see data belonging to their `shop_id`
- **Staff** can read all shop data and create/edit records, but cannot delete business records or edit settings
- **Managers** can additionally delete business records and edit settings
- **Owners** can additionally manage users and are protected from removing the last owner

**No anonymous access.** The Supabase anon key alone cannot read any data — users must be authenticated.

### RLS Policies Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| shops | own shop | bootstrap RPC | managers+ | — |
| customers | own shop | own shop | own shop | managers+ |
| inventory_items | own shop | own shop | own shop | managers+ |
| bouquets | own shop | own shop | own shop | managers+ |
| bouquet_items | via bouquet | via bouquet | via bouquet | via bouquet |
| orders | own shop | own shop | own shop | managers+ |
| order_items | via order | via order | via order | via order |
| deliveries | own shop | own shop | own shop | managers+ (staff cancellation uses RPC) |
| inventory_transactions | own shop | own shop | — | managers+ (waste) |
| inventory_reservations | own shop | own shop | own shop | managers+ |
| history | own shop | own shop | — | managers+ |
| settings | own shop | managers+ | managers+ | — |
| user_profiles | own shop | bootstrap RPC | owners only | owners only |
| shop_invites | owners only | RPC only | RPC only | RPC only |
| client_purchases | own shop | own shop | own shop | managers+ |
| photos | own shop | own shop | own shop | own shop (photo editing) |
| user_reminders_read | own | own | — | own |
| user_reminders_dismissed | own | own | — | own |
| app_meta | authenticated | — | owners | — |

Staff cannot delete customers, inventory items, bouquets, orders, inventory
transactions, reservations, history or manual purchases. Owners can manage
profiles; managers cannot. A shop always keeps at least one owner.

The app mirrors this matrix in the UI: staff do not see delete actions,
statistics, revenue charts, financial cards, settings, team, cloud migration,
backup/restore or reset controls. Managers can delete records and open
settings, but owner-only sections stay hidden. Hiding controls is only a UX
convenience; RLS remains the enforcement layer.

## 6. Environment Variables

Create a `.env` file in the project root (never commit this file):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_PUBLIC_APP_URL=http://localhost:5173
```

Get the Supabase values from **Supabase Dashboard → Settings → API**.
`VITE_PUBLIC_APP_URL` is optional; it sets the base URL used in sign-up
confirmation and password-reset emails. When omitted, the web app uses the
current browser origin. For desktop builds set it to the hosted web URL. Native
Android builds ignore it and use the `com.flowershouse.app://` scheme.

The `.env.example` file shows the required variables without real values.

## 7. Authentication and Team Management

- Sign-up and sign-in use Supabase Auth email/password.
- Email confirmation is supported: after sign-up the app asks the user to confirm their email and offers to resend the confirmation message.
- Password reset is supported from the sign-in dialog. The reset link opens `/reset-password`, where the user chooses a new password. Expired or already-used links show a clear message with a "request a new link" action.
- Add the web app URL (and `/reset-password`) to **Authentication → URL Configuration → Redirect URLs** so browser confirmation and reset links return to the app. Set `VITE_PUBLIC_APP_URL` for desktop builds.
- For the Android app also allow `com.flowershouse.app://auth/confirm` and `com.flowershouse.app://reset-password`. The app listens for `appUrlOpen`, converts the tokens into a Supabase session and opens the matching route.
- The first sign-in creates a shop and owner profile via `create_initial_shop_and_profile`.
- Owners invite managers and staff from **Settings → Team**. The invite is a one-time code, bound to the invited email and valid for 7 days.
- An invited user must register or sign in with the same email. The app stores the code locally and applies it after authentication.
- If the code cannot be applied, the app shows an invite banner. Terminal errors (`not_found`, `expired`, `revoked`, `used`) remove the stored code; recoverable errors such as `email_mismatch` keep it so the next sign-in can retry.
- Joining is allowed only from an empty auto-created shop. Shops containing customers, stock, orders, settings, photos or other data are rejected to prevent silent data loss.
- Removing a member deletes only their `user_profiles` row; the auth account remains and may create a new empty shop on its next sign-in.

## 8. Current Limitations

- Cloud writes do not queue while offline; offline cloud mode is read-only and reads come from the per-user cache of the last successful sync.
- The Android app uses the same cloud-first cache and blocks writes while offline.
- Android release builds require a signing keystore; the CI artifact is a debug APK.
- Automatic backups are desktop-only.

## 9. Schema Health Check

After signing in, open **Settings → Cloud** and click **Check schema**. The app expects **9/9** checks through migration `010`. If a check is missing, apply the migration shown next to it in the Supabase SQL Editor. Migration `009` is a data-integrity trigger and is checked indirectly by `010`; apply it before `010`. The `schemaVersion` check reads `app_meta.schema_version` and expects `10` or newer.

### Data reconciliation

After a migration, click **Compare data** in **Settings → Cloud**. The app compares local and cloud ids for customers, inventory, bouquets, orders, deliveries, transactions, reservations, purchases, history, photos, settings and reminders. Rows marked **Missing in cloud** were not uploaded; **Extra in cloud** rows exist only in Supabase (for example, records created on another device). The report is read-only and does not change either side.

## 10. Troubleshooting

### "relation already exists" error
The migration was already applied. Check `app_meta` table: `SELECT * FROM app_meta;` — if `storage_version` is `1`, the schema is ready.

### "permission denied for table" error
RLS is blocking access. Make sure the user is authenticated and has a `user_profiles` row with the correct `shop_id`.

### Invite code is rejected
- `email_mismatch`: sign in with the exact email the owner invited.
- `expired` / `revoked` / `used`: ask the owner for a new code.
- `shop_not_empty`: the invited account already has a shop with data. Remove or move that data, or sign in with a fresh account.
- `already_member_other_shop`: an account can belong to only one shop.

### Sign-up says the email rate limit was reached
Supabase's built-in email service is limited to a few messages per hour **per project**, and the limit is shared by the phone, the PC and every other device. Retrying immediately does not bypass it. Pick one of these fixes in the Supabase dashboard:

- **No email verification needed (simplest):** open **Authentication → Providers → Email** and turn off **Confirm email**. New accounts can sign in immediately and no confirmation email is sent.
- **Keep verification:** configure **Authentication → SMTP Settings** with your own mail provider and raise the auth email rate limits under **Authentication → Rate Limits**.

Before retrying, check the inbox and spam folder: the confirmation message may already have arrived. Password-reset emails use the same quota.

### Order ID collision after migration
Migration `009_order_sequence_sync.sql` backfills the sequence and keeps it in sync with explicit `ORD-XXX` inserts. Apply it before running the local-to-cloud migration.

If the sequence is still wrong (for example because `009` was skipped or the sequence was changed manually), set it from the highest existing order id:
```sql
SELECT set_order_number(
  (SELECT COALESCE(MAX((substring(id FROM 5))::INTEGER), 0) + 1
   FROM orders
   WHERE id ~ '^ORD-[0-9]+$')
);
```
