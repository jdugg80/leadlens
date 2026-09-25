// src/utils/importedLists.js
// LeadLens: read/write helpers for "Imported Address Lists" (e.g. a rep's own
// CVS list) -- the map-only, private, toggleable layer built in
// imported_address_lists / imported_address_list_items.
//
// Mirrors branchTerritories.js's shape (ok/reason results, never throws into the
// screen) so TerritoryMapScreen can treat both layers the same way.

const CACHE_TTL_MS = 3 * 60 * 1000; // list summaries change rarely; items even less so
let _summaryCache = null; // { at, result }
const _itemsCache = new Map(); // listId -> { at, items }

/**
 * List summaries only (name, color, item_count) -- cheap, used to render the
 * toggle-chip row without pulling every address up front.
 */
export async function loadImportedListSummaries(supabase, { force = false } = {}) {
  try {
    if (!force && _summaryCache && Date.now() - _summaryCache.at < CACHE_TTL_MS) {
      return _summaryCache.result;
    }
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { ok: false, lists: [], reason: 'no-client' };
    }
    const { data, error } = await supabase.rpc('get_my_imported_lists');
    if (error) {
      console.warn('[ImportedLists] summaries RPC failed:', error.message);
      return { ok: false, lists: [], reason: error.message };
    }
    const lists = (Array.isArray(data) ? data : []).map((row) => ({
      id: row.id,
      name: row.name || 'Untitled List',
      color: row.color || '#00C9FF',
      itemCount: Number(row.item_count) || 0,
    }));
    const result = { ok: true, lists };
    _summaryCache = { at: Date.now(), result };
    return result;
  } catch (err) {
    console.warn('[ImportedLists] loadImportedListSummaries error:', err?.message || String(err));
    return { ok: false, lists: [], reason: err?.message || 'error' };
  }
}

/**
 * Items for ONE list -- fetched lazily, only when that list's chip is toggled
 * on, not for every list up front.
 */
export async function loadImportedListItems(supabase, listId, { force = false } = {}) {
  try {
    if (!listId) return { ok: false, items: [], reason: 'no-list-id' };
    const cached = _itemsCache.get(listId);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return { ok: true, items: cached.items };
    }
    if (!supabase || typeof supabase.from !== 'function') {
      return { ok: false, items: [], reason: 'no-client' };
    }
    const { data, error } = await supabase
      .from('imported_address_list_items')
      .select('id, list_id, business_name, address, city, state, zip, latitude, longitude, in_queue')
      .eq('list_id', listId);

    if (error) {
      console.warn('[ImportedLists] items query failed:', error.message);
      return { ok: false, items: [], reason: error.message };
    }

    const items = (Array.isArray(data) ? data : [])
      .filter((row) => isFinite(Number(row.latitude)) && isFinite(Number(row.longitude)))
      .map((row) => ({
        id: row.id,
        listId: row.list_id,
        businessName: row.business_name || '',
        address: row.address || '',
        city: row.city || '',
        state: row.state || '',
        zip: row.zip || '',
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        inQueue: !!row.in_queue,
      }));

    _itemsCache.set(listId, { at: Date.now(), items });
    return { ok: true, items };
  } catch (err) {
    console.warn('[ImportedLists] loadImportedListItems error:', err?.message || String(err));
    return { ok: false, items: [], reason: err?.message || 'error' };
  }
}

/**
 * Marks one item as added to the queue (best-effort -- called after the rep
 * confirms the add on the Review screen; a failure here just means the item's
 * in_queue flag stays stale, it doesn't block the actual queue add).
 */
export async function markImportedItemQueued(supabase, itemId) {
  try {
    if (!supabase || !itemId) return { ok: false };
    const { error } = await supabase.rpc('mark_imported_item_queued', { p_item_id: itemId });
    if (error) {
      console.warn('[ImportedLists] markImportedItemQueued failed:', error.message);
      return { ok: false, reason: error.message };
    }
    // Keep the local cache in sync so re-toggling the list doesn't show it as
    // unqueued again until the next 3-minute cache expiry.
    for (const { items } of _itemsCache.values()) {
      const hit = items.find((i) => i.id === itemId);
      if (hit) hit.inQueue = true;
    }
    return { ok: true };
  } catch (err) {
    console.warn('[ImportedLists] markImportedItemQueued error:', err?.message || String(err));
    return { ok: false, reason: err?.message || 'error' };
  }
}

export function clearImportedListsCache() {
  _summaryCache = null;
  _itemsCache.clear();
}

export default {
  loadImportedListSummaries,
  loadImportedListItems,
  markImportedItemQueued,
  clearImportedListsCache,
};
