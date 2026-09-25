// src/utils/branchTerritories.js
// LeadLens: read-only "other reps in my branch" territory layer for TerritoryMapScreen.
//
// Data flow:
//   Supabase RPC get_branch_territories(p_branch_num)  ->  [{ zip_code, rep_name }]
//   -> group by ZIP, drop ZIPs that are already in MY territory
//   -> attach boundary rings via getBulkZipBounds (same source the map already uses)
//
// Everything here is best-effort. On any failure it returns { ok: false } and the
// map simply renders without the branch layer. It never throws into the screen.
//
// The data source is deliberately isolated in fetchBranchTerritoryRows(). If the
// source later moves from territory_zips to an imported branch roster table,
// only that one function changes.

import { mergeWithFreshUserProfile } from './storage';
import { getBulkZipBounds } from './zipBoundaryCache';

const RPC_NAME = 'get_branch_territories';
const CACHE_TTL_MS = 5 * 60 * 1000;   // reuse results for 5 minutes unless forced
const MAX_BRANCH_ZIPS = 80;           // hard cap on rendered branch ZIPs (map memory safety)

let _cache = null; // { key, at, result }

function normalizeZip(value) {
  const zip = String(value ?? '').replace(/\D/g, '').slice(0, 5);
  return zip.length === 5 ? zip : '';
}

function resolveBranchNum(user) {
  let fresh = null;
  try { fresh = mergeWithFreshUserProfile(user); } catch (_) { fresh = null; }
  const raw = fresh?.branchNum ?? user?.branchNum ?? '';
  return String(raw || '').trim();
}

/**
 * Pull raw branch rows from Supabase. Excludes the caller's own rows server-side.
 * Returns { ok, branchNum, rows: [{ zip, repName }], reason? }
 */
export async function fetchBranchTerritoryRows(supabase, user) {
  try {
    if (!supabase || typeof supabase.rpc !== 'function') {
      return { ok: false, rows: [], reason: 'no-client' };
    }
    const branchNum = resolveBranchNum(user);
    if (!branchNum) {
      return { ok: false, rows: [], reason: 'no-branch' };
    }

    const { data, error } = await supabase.rpc(RPC_NAME, { p_branch_num: branchNum });
    if (error) {
      console.warn('[BranchTerritories] RPC failed:', error.message);
      return { ok: false, rows: [], branchNum, reason: error.message };
    }

    const rows = (Array.isArray(data) ? data : [])
      .map((row) => ({
        zip: normalizeZip(row?.zip_code ?? row?.zip),
        repName: String(row?.rep_name ?? '').trim(),
      }))
      .filter((row) => row.zip);

    return { ok: true, branchNum, rows };
  } catch (err) {
    console.warn('[BranchTerritories] fetch error:', err?.message || String(err));
    return { ok: false, rows: [], reason: err?.message || 'error' };
  }
}

/**
 * Group rows by ZIP and drop any ZIP already in my own territory.
 * Returns [{ zip, repNames: string[] }] sorted by ZIP.
 */
export function groupBranchZips(rows = [], excludeZips = []) {
  const exclude = new Set((excludeZips || []).map(normalizeZip).filter(Boolean));
  const byZip = new Map();
  for (const row of rows) {
    if (!row?.zip || exclude.has(row.zip)) continue;
    if (!byZip.has(row.zip)) byZip.set(row.zip, new Set());
    if (row.repName) byZip.get(row.zip).add(row.repName);
  }
  return [...byZip.entries()]
    .map(([zip, names]) => ({ zip, repNames: [...names] }))
    .sort((a, b) => a.zip.localeCompare(b.zip));
}

/**
 * Attach boundary geometry. ZIPs without a usable boundary center are skipped.
 */
async function buildBranchMarkers(groups = []) {
  if (!groups.length) return [];
  const limited = groups.slice(0, MAX_BRANCH_ZIPS);
  const boundsMap = await getBulkZipBounds(limited.map((g) => g.zip)).catch(() => ({}));
  const markers = [];
  for (const group of limited) {
    const bounds = boundsMap?.[group.zip] || null;
    const center = bounds?.center;
    if (!center || !isFinite(center.latitude) || !isFinite(center.longitude)) continue;
    markers.push({
      zip: group.zip,
      coords: center,
      allRings: bounds.allRings || [],
      repNames: group.repNames,
    });
  }
  return markers;
}

/**
 * Public entry point used by TerritoryMapScreen.
 *
 * @param {object}   args
 * @param {object}   args.supabase  Supabase client
 * @param {object}   args.user      route user (branchNum resolved via fresh profile)
 * @param {string[]} args.myZips    my own ZIPs (excluded from the branch layer)
 * @param {boolean}  args.force     bypass the 5-minute cache
 * @returns {Promise<{ ok: boolean, markers: object[], total: number, truncated: boolean, reason?: string }>}
 */
export async function loadBranchLayer({ supabase, user, myZips = [], force = false } = {}) {
  try {
    const branchNum = resolveBranchNum(user);
    const myKey = [...new Set((myZips || []).map(normalizeZip).filter(Boolean))].sort().join(',');
    const cacheKey = `${branchNum}|${myKey}`;

    if (!force && _cache && _cache.key === cacheKey && Date.now() - _cache.at < CACHE_TTL_MS) {
      return _cache.result;
    }

    const fetched = await fetchBranchTerritoryRows(supabase, user);
    if (!fetched.ok) {
      return { ok: false, markers: [], total: 0, truncated: false, reason: fetched.reason };
    }

    const groups = groupBranchZips(fetched.rows, myZips);
    const markers = await buildBranchMarkers(groups);
    const result = {
      ok: true,
      markers,
      total: groups.length,
      truncated: groups.length > MAX_BRANCH_ZIPS,
    };

    _cache = { key: cacheKey, at: Date.now(), result };
    return result;
  } catch (err) {
    console.warn('[BranchTerritories] loadBranchLayer error:', err?.message || String(err));
    return { ok: false, markers: [], total: 0, truncated: false, reason: err?.message || 'error' };
  }
}

export function clearBranchLayerCache() {
  _cache = null;
}

export default { loadBranchLayer, fetchBranchTerritoryRows, groupBranchZips, clearBranchLayerCache };
