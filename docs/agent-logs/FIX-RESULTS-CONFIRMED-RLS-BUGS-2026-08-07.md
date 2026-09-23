# FIX RESULTS — Confirmed RLS Bugs
## August 7, 2026

---

## ITEM 1: `user_push_tokens` schema drift — FIXED

**Confidence: high. Fix applied and verified.**

### Problem
`registerPushToken.ts` (line 56-71) upserts 4 columns that didn't exist in the live table:
- `platform` (text)
- `device_name` (text)
- `enabled` (boolean)
- `updated_at` (timestamptz)

The upsert silently failed every time — `console.error` logged the error but no push tokens were saved.

### Migration Applied
```
supabase/migrations/20260807000000_add_user_push_tokens_columns.sql
```

```sql
ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
```

### Verification
| Column | Type | Nullable | Default | Matches upsert? |
|---|---|---|---|---|
| `platform` | text | YES | NULL | ✅ `Platform.OS` → text |
| `device_name` | text | YES | NULL | ✅ `Device.modelName` → text |
| `enabled` | boolean | YES | `true` | ✅ `true` → boolean |
| `updated_at` | timestamptz | YES | `now()` | ✅ ISO string → timestamptz |

The `onConflict: 'user_id, push_token'` target is satisfied — both columns exist and are the correct types.

### Follow-up Flagged (out of scope)
The `.catch(() => {})` silent-failure pattern on the upsert call should be reviewed in a separate storage/silent-failures pass. The error is now caught and logged, but the user has no visibility into whether push registration succeeded.

---

## ITEM 2: `leads` table reference — INVESTIGATION COMPLETE, NO FIX NEEDED

**Confidence: high — this is a naming confusion, not a missing table.**

### Findings

1. **`LEADS_STORAGE_KEY = '@leadlens_leads'`** — This is a **local MMKV/AsyncStorage key**, not a Supabase table. 100+ code references all use it as local device storage (`AsyncStorage.getItem`, `storageBridge.getSync`, etc.).

2. **No `CREATE TABLE leads` exists** in any migration file in `supabase/migrations/` or `supabase/`.

3. **`enrichment_results` migration** (`20260526000000`) references `leads(id)` as a FK:
   ```sql
   lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE
   ```
   But this migration was **never applied** — `enrichment_results` table doesn't exist in the live database.

4. **No code queries `enrichment_results`** from Supabase — grep for `from('enrichment_results')` returns zero matches in `src/`.

### Conclusion
The sweep conflated two separate things:
- **Local leads data** — stored in MMKV under `@leadlens_leads`, used throughout the app
- **`enrichment_results` migration** — dead code that was never applied because it depends on a `leads` table that was never created

The `enrichment_results` migration is orphaned. It references a Supabase `leads` table that was planned but never implemented — the app uses local storage for leads instead.

### Recommended Next Step
No action required. The `enrichment_results` migration can be left as-is (it was never applied, causes no harm). If the enrichment feature is ever built, it would need a redesigned schema that doesn't assume a Supabase `leads` table.

---

## ITEM 3: `beta_testers` policy — INVESTIGATION COMPLETE, NO FIX APPLIED

**Confidence: high — this is a Scarlett-only issue, connected to an incomplete block-tester feature.**

### Findings

1. **The `select blocked` / `update blocked` policies exist on Scarlett only** (`dlntgyhfxxbcwwcxaorn`), not on LeadLens.

2. **Policy definitions on Scarlett:**
   - `select blocked` — SELECT, `qual: false` (non-functional)
   - `update blocked` — UPDATE, `qual: false` (non-functional)

3. **Why they don't work:** Both policies are `PERMISSIVE`. In PostgreSQL, multiple PERMISSIVE policies for the same command are combined with OR. So `select blocked` (qual: `false`) OR `read beta testers` (qual: `true`) = `true`. The `false` policy is silently ignored.

4. **LeadLens has different policies:** LeadLens `beta_testers` has properly scoped email-based policies (`email = auth.email()` and `lower(email) = lower(auth.jwt() ->> 'email')`). No `select blocked`/`update blocked` on LeadLens.

5. **Connection to block-tester feature:** The policy names (`select blocked`, `update blocked`) strongly suggest this was a dashboard-applied attempt at per-user tester blocking — the same feature tracked in `AGENT-BUILD-BLOCK-TESTER.md` (still on backlog). But the implementation is incomplete:
   - No `is_blocked` column exists on the `beta_testers` table
   - The policies use `qual: false` instead of checking an `is_blocked` flag
   - The PERMISSIVE type makes the `false` qualifier non-functional

### Recommended Next Step
Do NOT patch these policies in isolation. The correct fix is to execute `AGENT-BUILD-BLOCK-TESTER.md` properly:
1. Add `is_blocked boolean DEFAULT false` column to `beta_testers`
2. Replace `select blocked` with a RESTRICTIVE policy: `USING (NOT is_blocked)`
3. Replace `update blocked` with a RESTRICTIVE policy: `USING (NOT is_blocked)`
4. Wire the admin UI to toggle `is_blocked`

Patching the policies without the schema/edge-function work would produce a different half-broken state.

---

## SUMMARY

| Item | Status | Action Taken |
|---|---|---|
| `user_push_tokens` schema drift | **FIXED** | Migration applied, 4 columns added, verified |
| `leads` table reference | **NO FIX NEEDED** | Local storage key, not a Supabase table; `enrichment_results` migration is dead code |
| `beta_testers` policy | **DEFERRED** | Connected to incomplete block-tester feature; recommend executing `AGENT-BUILD-BLOCK-TESTER.md` properly |
