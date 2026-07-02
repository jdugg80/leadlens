# DIAGNOSIS-SUPABASE-LOCAL-CONFLICT.md

## Executive Summary

The leading hypothesis — that `loadLeads()` pulls from Supabase and overwrites freshly-saved local data — is **incorrect**. `loadLeads()` reads exclusively from local `storageBridge` (MMKV). There is no Supabase pull sync on screen focus.

The root cause is a **MMKV persistence failure on app restart** combined with a **dual-write inconsistency** between `storageBridge` (MMKV) and raw `AsyncStorage` across different screens.

---

## 1. `loadLeads()` — Local-Only, No Supabase

**File**: `ProspectQueueScreen.js:133-148`

```js
const loadLeads = useCallback(async () => {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    // AsyncStorage here = storageBridge (imported at line 22)
    ...
}, []);
```

**Confirmed**: `loadLeads()` calls `storageBridge.getItem()`, which:
1. Reads from MMKV first (`storage.getSync(key)`)
2. Falls back to raw `@react-native-async-storage/async-storage` only if MMKV returns null

**It never touches Supabase.** The `syncProspectsFromSupabase()` function exists in `backendSync.js:238` but is only called from `LoginScreen.js:382`, and only when the local queue is empty (guarded at line 380: `if (!localLeads.length)`).

**Conclusion**: Supabase is NOT the source of the overwrite on screen focus.

---

## 2. `upsertProspect()` — Properly Awaited, Error-Handled

**File**: `ProspectQueueScreen.js:247-253`

```js
const syncResult = await upsertProspect(updatedLead, user, settings);
if (!syncResult?.ok) {
    showThemedAlert('Saved Locally', `Data saved on device, but cloud sync issue: ...`);
}
closeEdit(); // line 255
```

**Confirmed**: `upsertProspect()` is `await`ed before `closeEdit()`. If the Supabase upsert fails, the user sees a "Saved Locally" alert. The local write (line 227) and read-back verification (lines 229-242) have already completed before `upsertProspect` is called.

**There is no race condition between the Supabase upsert and navigation back**, because `closeEdit()` only runs after the upsert completes (or fails).

---

## 3. The Actual Root Cause: MMKV Persistence Failure + Dual-Write Inconsistency

### 3a. MMKV write path in `handleSave`

**File**: `ProspectQueueScreen.js:227`

```js
await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(currentLeads));
```

This calls `storageBridge.setItem()` → `storage.setSync()` → MMKV `s.set(key, value)` (synchronous).

**File**: `storage.js:79-95`

```js
setSync: (key, value) => {
    try {
        const s = getStorage();
        if (s) { s.set(key, String(value)); return; }
    } catch (err) {
        _fallback = true; _storage = null;
    }
    // AsyncStorage fallback — fire-and-forget async write
    AsyncStorage.setItem(key, String(value)).catch(...);
},
```

If MMKV is available, the write is synchronous and persists to the MMKV mmap'd file. **If MMKV throws**, `_fallback` is set to `true`, the MMKV instance is destroyed, and the write falls back to raw AsyncStorage — **but as a fire-and-forget async write**.

### 3b. MMKV read path in `loadLeads`

**File**: `storage.js:174-183`

```js
getItem: async (key) => {
    const mmkvVal = storage.getSync(key);
    if (mmkvVal !== null && mmkvVal !== undefined) return mmkvVal;
    // Fall back to AsyncStorage
    return await AsyncStorage.getItem(key);
},
```

On app restart, `getStorage()` re-initializes MMKV (`new MMKV({ id: 'leadlens-storage' })`). **If MMKV was corrupted or the file was lost during the force-close**, the new instance returns null/undefined for all keys. The fallback reads from raw AsyncStorage.

### 3c. The dual-write inconsistency

**Critical finding**: Multiple screens write to `LEADS_STORAGE_KEY` via **different paths**:

| Screen | Write method | Target |
|--------|-------------|--------|
| `ProspectQueueScreen.handleSave` | `storageBridge.setItem()` | **MMKV** (+ AsyncStorage fallback if MMKV fails) |
| `ReviewScreen` line 516 | `RawStorageSave.setItem()` (raw AsyncStorage) | **AsyncStorage only** |
| `BatchReviewScreen` line 434 | `AsyncStorage.setJSONSync()` | **MMKV** |
| `BatchReviewScreen` line 437 | `RawStorage.setItem()` (raw AsyncStorage) | **AsyncStorage only** |
| `DashboardScreen` line 746 | `storageBridge.setItem()` | **MMKV** |
| `leadLockUpdates.js` line 58 | `storageBridge.setSync()` | **MMKV** |

**`ReviewScreen` and `BatchReviewScreen` write to raw AsyncStorage, bypassing MMKV.** This means:
1. After a review/batch-save, the **raw AsyncStorage** has the current data
2. **MMKV may still have stale data** (or no data if it was cleared)
3. `loadLeads()` reads from MMKV first → gets stale data

### 3d. The scenario that reproduces the bug

1. User captures/imports leads → saved to **both** MMKV and AsyncStorage (BatchReviewScreen dual-writes)
2. User edits a lead in ProspectQueueScreen → `handleSave` writes to **MMKV only** (via storageBridge)
3. Read-back verification passes (MMKV read matches MMKV write) ✓
4. User force-closes the app
5. **During force-close, MMKV's mmap'd file may not flush to disk** (MMKV uses mmap; a hard kill can lose unflushed writes)
6. User reopens the app → MMKV re-initializes from disk → **edited lead is missing from MMKV**
7. `loadLeads()` reads from MMKV → gets stale data (without the edit)
8. `loadLeads()` does NOT fall back to AsyncStorage because MMKV returned a value (the stale one, not null)

**The key insight**: MMKV returns the stale value (not null), so the AsyncStorage fallback in `getItem` is never triggered. The stale MMKV data is treated as truth.

---

## 4. Why the read-back verification doesn't catch this

The read-back verification in `handleSave` (lines 229-242) confirms the write succeeded **within the same session**. It reads from MMKV immediately after writing to MMKV — this works because the mmap is still in memory.

The problem occurs **across app restarts**: the mmap'd file may not have been flushed to disk when the app was force-killed, so the restart reads stale data from disk.

---

## 5. Confirmed Facts

| Question | Answer |
|----------|--------|
| Does `loadLeads()` read from Supabase? | **No** — local storageBridge only |
| Is `upsertProspect()` awaited? | **Yes** — `closeEdit()` runs after it completes |
| Is there a Supabase pull on screen focus? | **No** — only on login when local queue is empty |
| Does `handleSave()` write to storage? | **Yes** — via storageBridge (MMKV) |
| Does the read-back verification work? | **Yes** — within the same session |
| Is there a dual-write inconsistency? | **Yes** — ReviewScreen/BatchReviewScreen bypass MMKV |
| Can MMKV lose data on force-close? | **Yes** — mmap may not flush before hard kill |

---

## 6. Recommended Fix Direction (do not apply yet)

The fix should ensure `loadLeads()` always reads the most current data, regardless of which screen last wrote it:

**Option A — Normalize all writes to go through storageBridge**:
- Change `ReviewScreen` line 516 and `BatchReviewScreen` line 437 to use `storageBridge.setItem()` instead of raw `AsyncStorage.setItem()`
- This ensures all writes go through MMKV, and MMKV is always the source of truth

**Option B — Make `loadLeads()` check both MMKV and AsyncStorage, preferring the newer data**:
- Read from both MMKV and raw AsyncStorage
- Compare `updatedAt` timestamps on the lead arrays
- Use whichever has the more recent data
- More complex but more resilient

**Option C — Flush MMKV on AppState background/change**:
- Add a `compact()` call or explicit flush when the app goes to background
- Reduces (but doesn't eliminate) the window for data loss on force-close

**Option A is recommended** — it's the simplest and eliminates the root cause.

---

## 7. Additional Risk: `autoExport.js` background overwrite

`autoExport.js` lines 166-175 can modify `LEADS_STORAGE_KEY` if `clearAfterSend` or `archiveAfterSend` is enabled. This runs via `maybeRunAutoExport()` on `DashboardScreen` load (line 315). If auto-export fires between the save and the next ProspectQueueScreen load, it could remove or archive the edited lead.

This is a secondary risk — less likely than the MMKV persistence issue, but worth noting.
