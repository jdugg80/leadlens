// src/components/ImportedListsManager.js
//
// "Your lists" -- shows the Named Address Lists the rep has imported (name, address count) and lets
// them look inside one or delete it. Rendered inside Territory Manager's "Named Address Lists" card.
//
// Deleting removes the list row; its addresses go with it (imported_address_list_items has
// ON DELETE CASCADE). Addresses already added to the rep's queue are separate local leads and are
// NOT affected. No Modal anywhere (project rule): confirmation uses the themed alert, details expand inline.

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SUPABASE_SETTINGS_KEY } from '../constants';
import { storage as AsyncStorage } from '../utils/storage';
import { createSupabaseClient } from '../utils/supabaseClient';
import { showThemedAlert } from './ThemedAlert';
import { loadImportedListSummaries, loadImportedListItems, deleteImportedList } from '../utils/importedLists';

const PREVIEW_LIMIT = 25;

export function describeDeleteFailure(reason) {
  if (reason === 'not-deleted') return 'The server did not delete it. Try signing out and back in, then try again.';
  if (reason === 'no-client') return 'Could not connect. Check your connection and try again.';
  return reason ? String(reason) : 'Something went wrong. Please try again.';
}

export function deleteConfirmText(list) {
  const n = Number(list?.itemCount) || 0;
  return `This removes "${list?.name || 'this list'}"${n ? ` and its ${n} address${n !== 1 ? 'es' : ''}` : ''} from your account and from the map. ` +
    'Addresses you already added to your queue are not affected. This cannot be undone.';
}

async function getClient() {
  const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
  const settings = raw ? JSON.parse(raw) : null;
  return createSupabaseClient(settings);
}

export default function ImportedListsManager({ busy = false }) {
  const [lists, setLists] = useState(null);      // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);    // list whose addresses are showing
  const [itemsById, setItemsById] = useState({}); // listId -> { loading, items, error }
  const [deletingId, setDeletingId] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = await getClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) { if (mounted.current) { setError('Not signed in. Sign in again to see your lists.'); setLists([]); } return; }
      const result = await loadImportedListSummaries(supabase, { force: true });
      if (!mounted.current) return;
      if (result.ok) setLists(result.lists);
      else { setError(`Could not load your lists (${result.reason}).`); setLists((prev) => prev || []); }
    } catch (e) {
      if (mounted.current) { setError(`Could not load your lists (${e?.message || 'error'}).`); setLists((prev) => prev || []); }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // load when the screen is shown / focused
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  // reload when an import (the parent's busy flag) finishes
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) refresh();
    wasBusy.current = !!busy;
  }, [busy, refresh]);

  const toggleOpen = async (list) => {
    if (openId === list.id) { setOpenId(null); return; }
    setOpenId(list.id);
    if (itemsById[list.id]?.items) return;
    setItemsById((m) => ({ ...m, [list.id]: { loading: true } }));
    try {
      const supabase = await getClient();
      const result = await loadImportedListItems(supabase, list.id);
      if (!mounted.current) return;
      setItemsById((m) => ({ ...m, [list.id]: result.ok ? { items: result.items } : { error: result.reason || 'error' } }));
    } catch (e) {
      if (mounted.current) setItemsById((m) => ({ ...m, [list.id]: { error: e?.message || 'error' } }));
    }
  };

  const doDelete = async (list) => {
    setDeletingId(list.id);
    try {
      const supabase = await getClient();
      const result = await deleteImportedList(supabase, list.id);
      if (!mounted.current) return;
      if (result.ok) {
        setLists((prev) => (prev || []).filter((l) => l.id !== list.id));
        setOpenId((cur) => (cur === list.id ? null : cur));
      } else {
        showThemedAlert('Could not delete list', describeDeleteFailure(result.reason));
      }
    } catch (e) {
      showThemedAlert('Could not delete list', describeDeleteFailure(e?.message));
    } finally {
      if (mounted.current) setDeletingId(null);
    }
  };

  const confirmDelete = (list) => {
    showThemedAlert(`Delete "${list.name}"?`, deleteConfirmText(list), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete list', style: 'destructive', onPress: () => doDelete(list) },
    ]);
  };

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.heading}>Your lists{lists ? ` (${lists.length})` : ''}</Text>
        <TouchableOpacity onPress={refresh} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.refresh}>{loading ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={s.error}>{error}</Text>}
      {loading && lists === null && <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 10 }} />}
      {lists && lists.length === 0 && !error && (
        <Text style={s.empty}>No lists yet. Import one above and it will show up here.</Text>
      )}

      {(lists || []).map((list) => {
        const open = openId === list.id;
        const detail = itemsById[list.id];
        return (
          <View key={list.id} style={s.row}>
            <View style={s.rowTop}>
              <TouchableOpacity style={s.rowMain} onPress={() => toggleOpen(list)} activeOpacity={0.7}>
                <View style={[s.dot, { backgroundColor: list.color || COLORS.accent }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{list.name}</Text>
                  <Text style={s.count}>{list.itemCount} address{list.itemCount !== 1 ? 'es' : ''} - tap to {open ? 'hide' : 'view'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={s.deleteBtn} onPress={() => confirmDelete(list)} disabled={deletingId === list.id}>
                <Text style={s.deleteText}>{deletingId === list.id ? 'Deleting...' : 'Delete'}</Text>
              </TouchableOpacity>
            </View>

            {open && (
              <View style={s.details}>
                {detail?.loading && <ActivityIndicator color={COLORS.accent} />}
                {!!detail?.error && <Text style={s.error}>Could not load addresses ({detail.error}).</Text>}
                {!!detail?.items && detail.items.length === 0 && <Text style={s.empty}>No mappable addresses in this list.</Text>}
                {!!detail?.items && detail.items.slice(0, PREVIEW_LIMIT).map((it) => (
                  <View key={it.id} style={s.item}>
                    <Text style={s.itemName} numberOfLines={1}>{it.businessName || it.address}</Text>
                    <Text style={s.itemAddr} numberOfLines={1}>
                      {[it.businessName ? it.address : '', it.city, it.state, it.zip].filter(Boolean).join(', ')}{it.inQueue ? '  (in your queue)' : ''}
                    </Text>
                  </View>
                ))}
                {!!detail?.items && detail.items.length > PREVIEW_LIMIT && (
                  <Text style={s.more}>+ {detail.items.length - PREVIEW_LIMIT} more not shown</Text>
                )}
                {!!detail?.items && list.itemCount > detail.items.length && (
                  <Text style={s.more}>{list.itemCount - detail.items.length} address(es) could not be placed on the map and are not listed here.</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heading: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  refresh: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  error: { color: COLORS.danger, fontSize: 12, marginBottom: 8 },
  empty: { color: COLORS.muted, fontSize: 12, marginBottom: 4 },
  row: { borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: 12 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  name: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  count: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  deleteBtn: { paddingHorizontal: 14, paddingVertical: 12 },
  deleteText: { color: COLORS.danger, fontSize: 13, fontWeight: '700' },
  details: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingHorizontal: 12, paddingVertical: 8 },
  item: { paddingVertical: 5 },
  itemName: { color: COLORS.text, fontSize: 13 },
  itemAddr: { color: COLORS.textDim, fontSize: 11, marginTop: 1 },
  more: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
});
