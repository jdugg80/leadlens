import { storageBridge as AsyncStorage } from './storage';

export { GOALS_STORAGE_KEY } from '../constants';

const TERRITORY_STORAGE_KEY  = 'leadlens_territory_zips';
const SHARED_TERRITORY_KEY   = 'leadlens_shared_territories';

// ─── Local Storage Helpers ────────────────────────────────────────────────────

export async function loadMyZips() {
  try {
    const raw = await AsyncStorage.getItem(TERRITORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveMyZips(zips) {
  await AsyncStorage.setItem(TERRITORY_STORAGE_KEY, JSON.stringify(zips));
}

export async function loadSharedTerritories() {
  try {
    const raw = await AsyncStorage.getItem(SHARED_TERRITORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveSharedTerritories(data) {
  await AsyncStorage.setItem(SHARED_TERRITORY_KEY, JSON.stringify(data));
}

// ─── ZIP Helpers ──────────────────────────────────────────────────────────────

export function isValidZip(zip) {
  return /^\d{5}$/.test(String(zip || '').trim());
}

export function normalizeZipEntry(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 5);
}

export function buildZipEntry(zip, notes = '') {
  return { zip: String(zip).trim(), notes, addedAt: new Date().toISOString() };
}

export function validateZipBatch(rawZips = [], existingZips = []) {
  const existingSet = new Set(existingZips.map(e => e.zip));
  const valid = [], duplicates = [], invalid = [];
  for (const z of rawZips) {
    const n = normalizeZipEntry(z);
    if (!isValidZip(n))        invalid.push(z);
    else if (existingSet.has(n)) duplicates.push(n);
    else                        valid.push(n);
  }
  return { valid, duplicates, invalid };
}

// ─── Activity / Heat Map ──────────────────────────────────────────────────────

const DAILY_TARGET_LOW  = 10;
const DAILY_TARGET_HIGH = 15;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function buildZipActivity(myZips = [], leads = []) {
  const now = Date.now();
  const weekAgo = now - WEEK_MS;

  const activity = {};
  for (const entry of myZips) {
    activity[entry.zip] = {
      ...entry,
      leadCount:    0,
      weeklyCount:  0,
      dailyAvg:     0,
      lastActivity: null,
      leads:        [],
    };
  }

  for (const lead of leads) {
    const zip = String(lead.zip || '').replace(/\D/g, '').slice(0, 5);
    if (!zip || !activity[zip]) continue;

    activity[zip].leadCount += 1;
    activity[zip].leads.push(lead);

    const ts = lead.capturedAt || lead.savedAt || '';
    const captureTime = ts ? new Date(ts).getTime() : 0;

    if (captureTime >= weekAgo) activity[zip].weeklyCount += 1;

    if (!activity[zip].lastActivity || ts > activity[zip].lastActivity) {
      activity[zip].lastActivity = ts;
    }
  }

  // Calculate daily avg from weekly count (÷7)
  for (const zip of Object.keys(activity)) {
    activity[zip].dailyAvg = parseFloat((activity[zip].weeklyCount / 7).toFixed(1));
  }

  return Object.values(activity).sort((a, b) => b.weeklyCount - a.weeklyCount);
}

export function getHeatLevel(dailyAvg = 0) {
  if (dailyAvg >= DAILY_TARGET_LOW) return 'on-target';
  if (dailyAvg >= 7)  return 'warm';
  if (dailyAvg >= 3)  return 'light';
  if (dailyAvg >= 1)  return 'cold';
  return 'inactive';
}

export function getHeatLabel(level) {
  switch (level) {
    case 'on-target': return '10+/day';
    case 'warm':      return '7-9/day';
    case 'light':     return '3-6/day';
    case 'cold':      return '1-2/day';
    default:          return 'None';
  }
}

export function getHeatColor(level) {
  switch (level) {
    case 'on-target': return { border: 'rgba(0,201,100,0.7)',   bg: 'rgba(0,201,100,0.12)',   text: '#00C964' };
    case 'warm':      return { border: 'rgba(0,201,255,0.6)',   bg: 'rgba(0,201,255,0.08)',   text: '#00C9FF' };
    case 'light':     return { border: 'rgba(255,200,0,0.6)',   bg: 'rgba(255,200,0,0.08)',   text: '#FFC800' };
    case 'cold':      return { border: 'rgba(255,107,43,0.6)',  bg: 'rgba(255,107,43,0.08)',  text: '#FF6B2B' };
    default:          return { border: 'rgba(107,114,128,0.3)', bg: 'rgba(107,114,128,0.05)', text: '#6B7280' };
  }
}

export function matchLeadsToTerritory(leads = [], myZips = []) {
  const zipSet = new Set(myZips.map(e => e.zip));
  return leads.filter(l => zipSet.has(String(l.zip || '').replace(/\D/g, '').slice(0, 5)));
}

/** Aggregate stats for AI / dashboard copy (safe if activity is missing or malformed). */
export function summarizeZipActivity(zipActivity = []) {
  if (!Array.isArray(zipActivity)) {
    return { zipCount: 0, leadCount: 0, weeklyLeadCount: 0, hottestZip: null };
  }
  let leadCount = 0;
  let weeklyLeadCount = 0;
  for (const z of zipActivity) {
    leadCount += Number(z?.leadCount) || 0;
    weeklyLeadCount += Number(z?.weeklyCount) || 0;
  }
  return {
    zipCount: zipActivity.length,
    leadCount,
    weeklyLeadCount,
    hottestZip: zipActivity[0]?.zip ?? null,
  };
}

const OPEN_STATUSES = new Set(['Suspect', 'New', '']);

function countOpenProspectsForZip(zipActivityRow) {
  const leads = zipActivityRow?.leads;
  if (!Array.isArray(leads)) return 0;
  return leads.filter((l) => OPEN_STATUSES.has(l?.status || 'Suspect')).length;
}

/**
 * Pick a recommended ZIP for the dashboard / AI welcome card.
 * Uses local territory + activity only (no network).
 */
export function getRecommendedZipAreas(_leads = [], myZips = [], _currentLocation = null, options = {}) {
  const zipActivity = Array.isArray(options.zipActivity) ? options.zipActivity : [];

  let ranked = zipActivity.map((row) => ({
    ...row,
    openProspects: countOpenProspectsForZip(row),
  }));

  if (!ranked.length && Array.isArray(myZips) && myZips.length) {
    ranked = myZips.map((e) => ({
      zip: e.zip,
      notes: e.notes,
      leadCount: 0,
      weeklyCount: 0,
      dailyAvg: 0,
      leads: [],
      lastActivity: null,
      openProspects: 0,
    }));
  }

  if (!ranked.length) {
    return {
      recommendedZip: null,
      backups: [],
      fallback: 'Add ZIP codes in Territory Manager to see recommendations.',
    };
  }

  const scoreRow = (row) => {
    let score = 0;
    if (options.highActivity !== false) {
      score += (Number(row.weeklyCount) || 0) * 3 + (Number(row.dailyAvg) || 0) * 2;
    }
    if (options.openProspects !== false) {
      score += (Number(row.openProspects) || 0) * 4;
    }
    if (options.leastRecent !== false && row.lastActivity) {
      const t = new Date(row.lastActivity).getTime();
      if (!Number.isNaN(t)) {
        const days = (Date.now() - t) / 86400000;
        score += Math.min(Math.max(days, 0), 14) * 0.5;
      }
    }
    return score;
  };

  ranked = [...ranked].sort((a, b) => scoreRow(b) - scoreRow(a));
  const top = ranked[0];
  const zipStr = String(top?.zip || '').replace(/\D/g, '').slice(0, 5);

  if (!zipStr || zipStr.length !== 5) {
    return { recommendedZip: null, backups: [], fallback: null };
  }

  const recommendedZip = {
    zip: zipStr,
    reason:
      (top.openProspects || 0) > 0
        ? 'Open prospects still waiting in this ZIP.'
        : (top.weeklyCount || 0) > 0
          ? 'Recent activity in this territory ZIP.'
          : 'Territory ZIP selected from your saved list.',
    summary: top.notes || '',
  };

  const backups = ranked
    .slice(1, 4)
    .map((r) => String(r.zip || '').replace(/\D/g, '').slice(0, 5))
    .filter((z) => z.length === 5)
    .map((zip) => ({ zip, reason: 'Alternate ZIP from your territory.' }));

  return { recommendedZip, backups, fallback: null };
}

// ─── Supabase: Push my ZIPs up ────────────────────────────────────────────────

export async function syncTerritoryToSupabase(supabase, user, myZips) {
  try {
    if (!supabase) return { ok: false, reason: 'no-client' };

    const rows = myZips.map(entry => ({
      zip:          entry.zip,
      notes:        entry.notes || '',
      rep_name:     user?.repName || '',
      employee_num: user?.employeeNum || '',
      branch_num:   user?.branchNum || '',
      added_at:     entry.addedAt,
    }));

    // Delete this rep's existing rows then reinsert
    await supabase
      .from('territory_zips')
      .delete()
      .eq('employee_num', user?.employeeNum || '');

    if (rows.length) {
      const { error } = await supabase.from('territory_zips').insert(rows);
      if (error) throw error;
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message };
  }
}

// ─── Supabase: Pull MY ZIPs down ──────────────────────────────────────────────
// FIX: This was the missing function. Without it, ZIPs in Supabase never
// made it back into the app on a fresh install or after clearing local storage.

export async function fetchMyTerritoryFromSupabase(supabase, user) {
  try {
    if (!supabase) return { ok: false, data: [] };

    const { data, error } = await supabase
      .from('territory_zips')
      .select('zip, notes, added_at')
      .eq('employee_num', user?.employeeNum || '');

    if (error) throw error;
    if (!data?.length) return { ok: true, data: [] };

    const zips = data.map(row => ({
      zip:     row.zip,
      notes:   row.notes || '',
      addedAt: row.added_at || new Date().toISOString(),
    }));

    return { ok: true, data: zips };
  } catch (err) {
    return { ok: false, data: [], reason: err?.message };
  }
}

// ─── Supabase: Fetch other reps' territories ──────────────────────────────────

export async function fetchSharedTerritories(supabase, user) {
  try {
    if (!supabase) return { ok: false, data: [] };

    const { data, error } = await supabase
      .from('territory_zips')
      .select('zip, rep_name, employee_num, branch_num')
      .neq('employee_num', user?.employeeNum || '');

    if (error) throw error;

    // Group by rep
    const byRep = {};
    for (const row of data || []) {
      const key = row.employee_num || row.rep_name;
      if (!byRep[key]) {
        byRep[key] = {
          repName:     row.rep_name,
          employeeNum: row.employee_num,
          branchNum:   row.branch_num,
          zips:        [],
        };
      }
      byRep[key].zips.push(row.zip);
    }

    return { ok: true, data: Object.values(byRep) };
  } catch (err) {
    return { ok: false, data: [], reason: err?.message };
  }
}
