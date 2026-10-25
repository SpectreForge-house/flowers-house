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
3. Apply every migration in order: `001_initial_schema.sql`, `002_add_insert_rls_policies.sql`, `003_bootstrap_shop_profile.sql`, `004_fix_user_profiles_rls_recursion.sql`, `005_confirm_order_atomicity.sql`, `006_cloud_parity.sql`, `007_rls_hardening.sql`, then `008_team_invites.sql`
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

### What the migration creates:

**16 tables:**
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
| `user_reminders_read` | Per-user dismissed reminders |
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
```

Get these values from: **Supabase Dashboard → Settings → API**

The `.env.example` file shows the required variables without real values.

## 7. Authentication and Team Management

- Sign-up and sign-in use Supabase Auth email/password.
- The first sign-in creates a shop and owner profile via `create_initial_shop_and_profile`.
- Owners invite managers and staff from **Settings → Team**. The invite is a one-time code, bound to the invited email and valid for 7 days.
- An invited user must register or sign in with the same email. The app stores the code locally and applies it after authentication.
- If the code cannot be applied, the app shows an invite banner. Terminal errors (`not_found`, `expired`, `revoked`, `used`) remove the stored code; recoverable errors such as `email_mismatch` keep it so the next sign-in can retry.
- Joining is allowed only from an empty auto-created shop. Shops containing customers, stock, orders, settings, photos or other data are rejected to prevent silent data loss.
- Removing a member deletes only their `user_profiles` row; the auth account remains and may create a new empty shop on its next sign-in.

## 8. Current Limitations

- Cloud writes do not queue while offline; offline cloud mode is read-only and reads come from the per-user cache of the last successful sync.
- Mobile/PWA layout work is deferred.
- Automatic backups are desktop-only.

## 9. Schema Health Check

After signing in, open **Settings → Cloud** and click **Check schema**. The app expects **8/8** checks through migration `008`. If a check is missing, apply the migration shown next to it in the Supabase SQL Editor.

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

### Order ID collision after migration
After migrating existing data, set the sequence to the correct value:
```sql
SELECT set_order_number(<max_existing_order_number + 1>);
```
