# DIAGNOSIS: Prospect Queue Edit Not Persisting

## Files Involved

| Role | File | Key Lines |
|------|------|-----------|
| Queue load (read) | `src/screens/ProspectQueueScreen.js` | 133–153 (`useFocusEffect`) |
| Edit modal open | `src/screens/ProspectQueueScreen.js` | 155–169 (`openEdit`) |
| Save handler (write) | `src/screens/ProspectQueueScreen.js` | 183–243 (`handleSave`) |
| ID matching | `src/utils/leadHelpers.js` | 471–487 (`getLeadId`, `matchLeadByAnyId`) |
| Cloud sync | `src/utils/backendSync.js` | 82–108 (`upsertProspect`) |
| Storage bridge | `src/utils/storage.js` | `storageBridge` (MMKV wrapper) |

## Edit → Persist → Re-Read Path

### 1. Queue Load (Read)
```
useFocusEffect (line 133)
  → AsyncStorage.getItem(LEADS_STORAGE_KEY)   // storageBridge = MMKV
  → JSON.parse → setLeads(rawLeads)
```
**Reads from:** `storageBridge` (MMKV)
**Runs:** Once on mount (empty deps `[]`). Does NOT re-run on screen focus.

### 2. Save Handler (Write)
```
handleSave (line 183)
  → AsyncStorage.getItem(LEADS_STORAGE_KEY)   // re-reads from MMKV
  → matchLeadByAnyId(currentLeads, editingLead) → splice + push
  → setLeads(currentLeads)                    // updates React state
  → RawStorageSave.setItem(LEADS_STORAGE_KEY, ...)  // raw AsyncStorage (async)
  → AsyncStorage.setSync(LEADS_STORAGE_KEY, ...)    // MMKV (sync)
  → upsertProspect(updatedLead, user, settings)     // Supabase
  → closeEdit()
```
**Writes to:** raw AsyncStorage (async) + MMKV (sync) + Supabase

### 3. Re-Read (Re-render)
After `handleSave`, `setLeads(currentLeads)` updates React state immediately. The component re-renders with the updated array. **No re-read from storage occurs** — the state update IS the source of truth for the current render.

## Root Cause

**The `leads` state is never re-read from storage after the initial mount.**

The `useFocusEffect` at line 133 has an empty dependency array `[]`:
```js
useFocusEffect(useCallback(() => {
  // reads from MMKV
  ...
}, []));  // ← never re-runs on focus
```

This means:
1. On mount: reads from MMKV → `setLeads(rawLeads)` → UI shows MMKV data
2. After save: `setLeads(currentLeads)` → UI shows updated data (from state, not storage)
3. User navigates away and back: `useFocusEffect` does NOT re-run → state persists → still shows updated data
4. **If the component unmounts** (e.g., navigation resets the stack): next mount reads from MMKV

**The critical failure path:**

If the MMKV write (`AsyncStorage.setSync` at line 226) fails silently or doesn't persist:
- State shows updated leads (from `setLeads`)
- MMKV still has old leads
- On next mount/re-mount: reads MMKV → old data → UI reverts

**Contributing factor — `matchLeadByAnyId` fragility:**

`getLeadId` (line 471) falls through multiple fields:
```js
lead?.id || lead?.leadId || lead?.queueId || lead?.createdAt || lead?.savedAt || lead?.capturedAt || lead?.businessName
```

If `editingLead` (from React state, set at modal open) has a different ID than the corresponding lead in the freshly-read `currentLeads` array (from MMKV), `matchLeadByAnyId` returns -1, the splice removes nothing, and the updated lead is **appended as a duplicate** while the old version remains.

**This is the same root-cause family as the BetaTracker/ExportScreen bugs:**
- MMKV write may silently fail or not persist
- React state diverges from storage
- Stale state is displayed until a full re-mount forces a fresh read

## Specific Failure Point

**Line 226:** `AsyncStorage.setSync(LEADS_STORAGE_KEY, JSON.stringify(currentLeads));`

This is the only MMKV write for the prospect edit. If this call:
- Throws an uncaught error (the `try/catch` at line 237 catches it but only shows "Save Failed")
- Serializes incorrectly (large array, special characters in lead data)
- Has a race condition with the preceding `RawStorageSave.setItem` (line 225)

Then MMKV retains the old data while state shows the new data. The discrepancy is invisible until a re-mount forces a fresh read from MMKV.

## No Async Race Condition

The save handler is `async` but `closeEdit()` at line 236 runs synchronously after the `await` calls. Navigation back is not triggered by `handleSave` — the modal just closes. So there's no race between write completion and navigation.

The risk is purely: **state says one thing, MMKV says another.**

## Recommendation (for follow-up fix briefing)

After writing to MMKV, re-read from MMKV and set state from the fresh read instead of trusting the in-memory `currentLeads`:
```js
// After line 226, replace setLeads(currentLeads) with:
const freshRaw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
const freshLeads = freshRaw ? JSON.parse(freshRaw) : [];
setLeads(freshLeads);
```

Or alternatively, make `useFocusEffect` re-read on every focus (remove `[]` deps or add a focus counter).
