# DIAGNOSIS — RLS and Migration Integrity
## August 7, 2026

**Method:** Direct SQL queries via `supabase db query --linked` against both production databases. Read-only `pg_class`, `pg_policies`, and `information_schema` queries only.

---

## TASK 1: LeadLens RLS State (`qkbvwryucaakkkqaqvka`)

**46 tables total in `public` schema.** All 9 requested tables exist (except `leads` — does not exist).

### Table-by-Table Results

#### `prospects`
- **RLS enabled:** ✅ YES
- **Policies (10):**
  - `Admins can view all prospects` — SELECT, `public`, qual: `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')`
  - `Managers can view all prospects` — SELECT, `public`, qual: `EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'manager')`
  - `Users can view own prospects` — SELECT, `authenticated`, qual: `user_id = auth.uid()`
  - `Users can insert own prospects` — INSERT, `authenticated`, with_check: `user_id = auth.uid()`
  - `Users can update own prospects` — UPDATE, `authenticated`, qual+with_check: `user_id = auth.uid()`
  - `Users can delete own prospects` — DELETE, `authenticated`, qual: `user_id = auth.uid()`
  - `Users can manage their own prospects` — ALL, `public`, qual: `auth.uid() = user_id`
  - `LeadLens anon can read prospects` — SELECT, `anon`, qual: `true`
  - `LeadLens anon can insert prospects` — INSERT, `anon`, with_check: `true`
  - `LeadLens anon can update prospects` — UPDATE, `anon`, qual+with_check: `true`
  - `Allow anon delete prospects` — DELETE, `anon`, qual: `true`
- **Sweep verdict:** CONTRADICTED — sweep said "no tracked migration" implying no RLS. RLS is fully configured with 10 policies.
- **Access model note:** The anon policies (`true` qual) allow unauthenticated full CRUD. This is the existing pattern — the app historically used anon key for writes. **Question for Joe:** Should the anon policies be tightened, or is this intentional for the anon-key write pattern?

#### `feature_requests`
- **RLS enabled:** ✅ YES
- **Policies (3):**
  - `Allow all for anon` — ALL, `public`, qual: `true`, with_check: `true`
  - `Allow owner all` — ALL, `public`, qual: `true`, with_check: `true`
  - `Allow rep insert` — INSERT, `public`, with_check: `source = 'rep'`
- **Sweep verdict:** CONTRADICTED — sweep flagged no tracked migration. RLS exists with 3 policies.
- **Access model note:** Both anon and authenticated have full access. The `Allow rep insert` policy requires `source = 'rep'` on insert. **Question for Joe:** Should read access be restricted to admins/managers only, or is open read intentional?

#### `territory_zips`
- **RLS enabled:** ✅ YES
- **Policies (8):**
  - `Users can view own territory zips` — SELECT, `authenticated`, qual: `user_id = auth.uid()`
  - `Users can insert own territory zips` — INSERT, `authenticated`, with_check: `user_id = auth.uid()`
  - `Users can update own territory zips` — UPDATE, `authenticated`, qual+with_check: `user_id = auth.uid()`
  - `Users can delete own territory zips` — DELETE, `authenticated`, qual: `user_id = auth.uid()`
  - `territory_zips_select_own` — SELECT, `authenticated`, qual: `auth.uid() = user_id`
  - `territory_zips_anon_insert_dev_only` — INSERT, `anon`, with_check: `true`
  - `Dev anon can manage territory zips` — ALL, `anon`, qual: `true`, with_check: `true`
  - `Allow anon delete territory zips` — DELETE, `anon`, qual: `true`
  - `Allow anon update territory zips` — UPDATE, `anon`, qual+with_check: `true`
- **Sweep verdict:** CONTRADICTED — sweep inferred no policy from no tracked migration. Policies exist.
- **Access model note:** Anon has full delete/update/insert. Authenticated scoped to own `user_id`. **Question for Joe:** Should anon delete/update be removed?

#### `leadlock_captures`
- **RLS enabled:** ✅ YES
- **Policies (1):**
  - `Manage own captures` — ALL, `authenticated`, qual+with_check: `auth.uid() = user_id`
- **Sweep verdict:** CONTRADICTED — policies exist.
- **Access model note:** Clean per-user scoping. No anon access. ✅ Correct pattern.

#### `lens_signals`
- **RLS enabled:** ✅ YES
- **Policies (2):**
  - `Public signals are viewable by everyone` — SELECT, `public`, qual: `true`
  - `Enable insert for all users` — INSERT, `public`, with_check: `true`
- **Sweep verdict:** CONTRADICTED — policies exist.
- **Access model note:** Open read and insert, no update/delete policies. **Question for Joe:** Should update/delete be restricted to service-role only?

#### `push_subscriptions`
- **RLS enabled:** ✅ YES
- **Policies (1):**
  - `Allow all` — ALL, `public`, qual: `true`, with_check: `true`
- **Sweep verdict:** CONTRADICTED — policy exists.
- **Access model note:** Fully open to anon and authenticated. Table columns: `id`, `email`, `subscription`, `updated_at`. **Question for Joe:** Should this be scoped per-user or is open access intentional?

#### `contact_candidates`
- **RLS enabled:** ✅ YES
- **Policies (1):**
  - `Authenticated can read contact candidates` — SELECT, `authenticated`, qual: `true`
- **Sweep verdict:** CONFIRMED — sweep flagged as INFO (no `user_id`/`rep_id`). Correct: no user-scoping column exists.
- **Access model note:** Read-only for authenticated users, no insert/update/delete policies (service-role only for writes). ✅ Appropriate for reference data.

#### `lenssignal_records`
- **RLS enabled:** ✅ YES
- **Policies (3):**
  - `Authenticated can read lenssignal records` — SELECT, `authenticated`, qual: `true`
  - `Authenticated users can read lenssignal_records` — SELECT, `public`, qual: `auth.role() = 'authenticated'`
  - `Service role can manage lenssignal_records` — ALL, `public`, qual: `auth.role() = 'service_role'`
- **Sweep verdict:** CONFIRMED — sweep flagged as INFO (likely intentional shared reference data). Correct.
- **Access model note:** Read for authenticated, full manage for service-role only. ✅ Correct pattern for shared reference data.

#### `user_push_tokens`
- **RLS enabled:** ✅ YES
- **Policies (6):**
  - `Users can read own push token` — SELECT, `authenticated`, qual: `auth.uid() = user_id`
  - `Users can insert own push token` — INSERT, `authenticated`, with_check: `auth.uid() = user_id`
  - `Users can update own push token` — UPDATE, `authenticated`, qual: `auth.uid() = user_id`
  - `Users can manage their own push tokens` — ALL, `public`, qual: `auth.uid() = user_id`
  - `users manage own token` — ALL, `public`, qual: `auth.uid() = user_id`
  - `admin read all push tokens` — SELECT, `public`, qual: `true`
- **Sweep verdict:** CONTRADICTED — policies exist.
- **Access model note:** Clean per-user scoping with admin read-all. ✅ Correct pattern.

#### `leads` — DOES NOT EXIST
- **Sweep verdict:** CONFIRMED — no `leads` table in either LeadLens or Scarlett. Code references to `leads` table would fail at runtime.

### Reference Pattern: `leadlock_captures`

The cleanest example of the intended access pattern:
```sql
Manage own captures — ALL, authenticated, qual: auth.uid() = user_id, with_check: auth.uid() = user_id
```
Per-user scoping, no anon access, no admin override. This is the pattern to measure others against.

---

## TASK 2: Scarlett RLS State (`dlntgyhfxxbcwwcxaorn`)

**27 tables total in `public` schema.** All 5 requested tables exist.

### Table-by-Table Results

#### `feedback_reports`
- **RLS enabled:** ✅ YES
- **Policies (2):**
  - `insert feedback` — INSERT, `public`, with_check: `true`
  - `read feedback` — SELECT, `public`, qual: `true`
- **Access model note:** Open insert and read for anon+authenticated. No update/delete policies (service-role only). **Question for Joe:** Should read be restricted to admin/manager only?

#### `beta_events`
- **RLS enabled:** ✅ YES
- **Policies (9):**
  - `Allow anon beta event inserts` — INSERT, `anon`, with_check: `true`
  - `Allow anon insert` — INSERT, `public`, with_check: `true`
  - `Allow anon insert beta events` — INSERT, `anon`, with_check: `true`
  - `Allow anon select` — SELECT, `public`, qual: `true`
  - `Allow authenticated insert beta events` — INSERT, `authenticated`, with_check: `true`
  - `Allow authenticated read beta events` — SELECT, `authenticated`, qual: `true`
  - `Allow authenticated users to insert beta events` — INSERT, `authenticated`, with_check: `(auth.uid() = user_id) OR (user_id IS NULL)`
  - `Allow authenticated users to read own beta events` — SELECT, `authenticated`, qual: `auth.uid() = user_id`
  - `admin can read all beta_events` — SELECT, `public`, qual: `true`
- **Access model note:** Multiple overlapping policies (6 INSERT policies!). Functional but messy. Open read for anon+authenticated. **Question for Joe:** Should anon read be removed? Should duplicate policies be cleaned up?

#### `beta_testers`
- **RLS enabled:** ✅ YES
- **Policies (8):**
  - `Allow authenticated read access to beta_testers` — SELECT, `authenticated`, qual: `true`
  - `allow delete beta_testers` — DELETE, `public`, qual: `true`
  - `insert beta testers` — INSERT, `anon,authenticated`, with_check: `true`
  - `insert only` — INSERT, `public`, with_check: `true`
  - `read beta testers` — SELECT, `anon,authenticated`, qual: `true`
  - `select blocked` — SELECT, `public`, qual: `false` ⚠️
  - `update beta testers` — UPDATE, `anon,authenticated`, qual+with_check: `true`
  - `update blocked` — UPDATE, `public`, qual: `false` ⚠️
- **Access model note:** Conflicting policies — `select blocked` (qual: `false`) vs `read beta testers` (qual: `true`). The `PERMISSIVE` combined with OR semantics means the `false` policy doesn't actually block. Open read/insert/update for anon. **Question for Joe:** Should tester data be restricted? The `select blocked`/`update blocked` policies are non-functional due to PERMISSIVE OR semantics.

#### `app_config`
- **RLS enabled:** ✅ YES
- **Policies (2):**
  - `read config` — SELECT, `public`, qual: `true`
  - `update config` — UPDATE, `public`, qual: `true`
- **Access model note:** Open read and update for everyone. No insert/delete (service-role only). **Question for Joe:** Should update be restricted to service-role only?

#### `beta_releases`
- **RLS enabled:** ✅ YES
- **Policies (2):**
  - `read releases` — SELECT, `public`, qual: `true`
  - `admin all` — ALL, `public`, qual: `true`
- **Access model note:** `admin all` with qual `true` means everyone has full access (the policy name is misleading). **Question for Joe:** Should this be restricted to admin role?

---

## TASK 3: Migration File / Schema Drift Inventory

### Untracked Migration: `lens_signal_migration_v1.sql`

**Status: APPLIED.** All 7 tables from this migration exist in the live database:
- `lenssignal_sources` ✅
- `lenssignal_records` ✅
- `prospect_lenssignal` ✅
- `user_push_tokens` ✅
- `user_location_status` ✅
- `lenssignal_user_preferences` ✅
- `lenssignal_notifications` ✅

Additionally, `lens_signals` exists (NOT in this migration — created separately).

### Untracked Migration: `create_comptroller_business_records.sql`

**Status: APPLIED.** `comptroller_business_records` table exists with expected columns.

### Schema Drift: `user_push_tokens` columns

**CONFIRMED DRIFT.** The live table has 5 columns:
| Column | Type | Nullable |
|---|---|---|
| `id` | uuid | NO |
| `user_id` | uuid | YES |
| `push_token` | text | NO |
| `device_info` | jsonb | YES |
| `created_at` | timestamptz | YES |

`registerPushToken.ts` (line 56-71) upserts with these columns that **DO NOT EXIST**:
- `platform` — not in live table
- `device_name` — not in live table
- `enabled` — not in live table
- `updated_at` — not in live table

**Impact:** The Supabase upsert will fail with a column-not-found error at runtime. The error is caught and logged (`console.error`) but the push token is never saved. This means **push notifications may not be registering for any users**.

### FK Type: `prospects.id`

**`text` type (confirmed).** The FK from `outreach_messages.prospect_id` → `prospects.id` exists and is valid because both columns are `text`. The migration succeeded — no type mismatch.

### `leads` Table

**Does not exist** in either LeadLens or Scarlett. Code references to a `leads` table would fail at runtime.

---

## TASK 4: Cross-Project Service Key Fallback

**`release.js:771`:** `const leadlensKey = process.env.LEADLENS_SERVICE_ROLE_KEY || process.env.SCARLETT_SERVICE_ROLE_KEY;`

This fallback reads `user_push_tokens` from LeadLens using whichever key is available. The concern: if `LEADLENS_SERVICE_ROLE_KEY` is unset, the Scarlett service key (which has full access to a different project) would be used against LeadLens tables.

**Determinable from available data:**
- Both keys are present in `.env` (verified this session via `dotenv`)
- `release.js` is run locally, not in CI — the `.env` file is the source of truth
- Whether `LEADLENS_SERVICE_ROLE_KEY` was ever unset in an environment where `release.js` ran is **undeterminable** from repo alone — would require checking EAS build logs or release history

**Risk assessment:** Low in practice (both keys always present in `.env`), but the fallback pattern is architecturally wrong — it would silently use a cross-project key if one env var were missing.

---

## QUESTIONS FOR JOE

### LeadLens Tables

1. **`prospects`** — Anon policies allow full CRUD without auth. Is this intentional for the anon-key write pattern, or should anon write be scoped?

2. **`feature_requests`** — Fully open read/write for anon+authenticated. Should read be admin-only?

3. **`territory_zips`** — Anon has full delete/update/insert. Should anon write be removed?

4. **`lens_signals`** — Open read and insert, no update/delete policies. Should update/delete be service-role only?

5. **`push_subscriptions`** — Fully open to all. Should this be scoped per-user?

6. **`leads`** — Table doesn't exist. Is this expected, or was a migration missed?

### Scarlett Tables

7. **`feedback_reports`** — Open insert+read for everyone. Should read be admin-only?

8. **`beta_events`** — 6 overlapping INSERT policies. Should anon read be removed? Should duplicates be cleaned up?

9. **`beta_testers`** — Conflicting `select blocked`/`update blocked` policies are non-functional (PERMISSIVE OR). Should tester data be restricted to authenticated users only?

10. **`app_config`** — Open update for everyone. Should update be service-role only?

11. **`beta_releases`** — `admin all` policy with `qual: true` gives everyone full access. Should this be admin-role only?

### Schema Drift

12. **`user_push_tokens`** — 4 columns missing (`platform`, `device_name`, `enabled`, `updated_at`). Push token registration is silently failing. Should a migration be written to add these columns?

### Service Key Fallback

13. **`release.js:771`** — Should the `SCARLETT_SERVICE_ROLE_KEY` fallback be removed? Both keys are always present in `.env`, but the pattern is architecturally wrong.
