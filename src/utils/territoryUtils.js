import { storageBridge as AsyncStorage } from './storage';

export { GOALS_STORAGE_KEY } from '../constants';

const TERRITORY_STORAGE_KEY  = 'leadlens_territory_zips';
const SHARED_TERRITORY_KEY   = 'leadlens_shared_territories';
const TERRITORY_REVISION_KEY = 'leadlens_territory_zips_revision';

const getRaw = require('@react-native-async-storage/async-storage').default;

async function dualRead(key) {
  // Try MMKV first (fast sync), fall back to raw AsyncStorage
  try {
    const sync = AsyncStorage.getSync(key);
    if (sync) return sync;
  } catch {}
  try {
    return await getRaw.getItem(key);
  } catch { return null; }
}

async function dualWrite(key, value) {
  // Write to both MMKV and raw AsyncStorage
  try { AsyncStorage.setSync(key, value); } catch {}
  try { await getRaw.setItem(key, value); } catch {}
}

// ─── Local Storage Helpers ────────────────────────────────────────────────────

export async function loadMyZips() {
  try {
    const raw = await dualRead(TERRITORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveMyZips(zips) {
  await dualWrite(TERRITORY_STORAGE_KEY, JSON.stringify(zips));
  await dualWrite(TERRITORY_REVISION_KEY, String(Date.now()));
}

export async function getMyZipsRevision() {
  try {
    const raw = await dualRead(TERRITORY_REVISION_KEY);
    const value = Number(raw || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

export async function loadSharedTerritories() {
  try {
    const raw = await dualRead(SHARED_TERRITORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveSharedTerritories(data) {
  await dualWrite(SHARED_TERRITORY_KEY, JSON.stringify(data));
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

// ─── Activity / Heat Map with 90-DAY PROSPECT COUNTING ───────────────────────

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Calculate 90-day prospect count and heat level for each ZIP.
 * Based on TOTAL PROSPECTS in that territory (not just weekly).
 */
export function calculateZipActivity(myZips = [], allProspects = []) {
  const now = Date.now();
  const ninetyDaysAgo = now - NINETY_DAYS_MS;

  const activity = {};

  // Initialize all ZIPs
  for (const entry of myZips) {
    activity[entry.zip] = {
      ...entry,
      prospectCount: 0,
      prospectCount90d: 0,
      heatLevel: 'none',
      lastProspectDate: null,
    };
  }

  // Count prospects in each ZIP (90-day window)
  for (const prospect of allProspects) {
    const zip = String(prospect.zip || '')
      .replace(/\D/g, '')
      .slice(0, 5);

    if (!zip || !activity[zip]) continue;

    // Total count
    activity[zip].prospectCount += 1;

    // 90-day count
    const capturedAt = prospect.capturedAt || prospect.savedAt || prospect.createdAt || '';
    const captureTime = capturedAt ? new Date(capturedAt).getTime() : 0;

    if (captureTime >= ninetyDaysAgo) {
      activity[zip].prospectCount90d += 1;
    }

    // Track most recent prospect date
    if (capturedAt && (!activity[zip].lastProspectDate || capturedAt > activity[zip].lastProspectDate)) {
      activity[zip].lastProspectDate = capturedAt;
    }
  }

  // Assign heat levels based on 90-day prospect count
  for (const zip of Object.keys(activity)) {
    const count90d = activity[zip].prospectCount90d;
    activity[zip].heatLevel = getHeatLevelFromProspectCount(count90d);
  }

  return Object.values(activity).sort((a, b) => b.prospectCount90d - a.prospectCount90d);
}

/**
 * Map prospect count to heat level.
 * These thresholds can be adjusted based on your sales targets.
 */
export function getHeatLevelFromProspectCount(count = 0) {
  if (count >= 50) return 'high';          // 50+ prospects = high activity
  if (count >= 25) return 'medium';        // 25-49 = medium
  if (count >= 5) return 'low';            // 5-24 = low
  return 'none';                           // 0-4 = no activity
}

/**
 * Get descriptive label for heat level.
 * Handles both OLD (on-target, warm, light, cold, inactive)
 * and NEW (high, medium, low, none) heat level names.
 */
export function getHeatLabel(level) {
  const normalized = String(level || '').toLowerCase();

  // NEW system labels
  switch (normalized) {
    case 'high': return '50+ prospects';
    case 'medium': return '25-49 prospects';
    case 'low': return '5-24 prospects';
    case 'none': return '0-4 prospects';
    
    // OLD system labels (for backward compatibility)
    case 'on-target': return '10+/day';
    case 'warm': return '7-9/day';
    case 'light': return '3-6/day';
    case 'cold': return '1-2/day';
    case 'inactive': return 'None';
    
    default: return 'Unknown';
  }
}

/**
 * BACKWARD COMPATIBILITY: Old function name for existing code.
 * Maps from the new prospect-count system to the old heat level names.
 * Some screens (TerritoryManagerScreen, etc.) still call this.
 */
export function getHeatLevel(countOrLevel = 0) {
  // If it's a string, it's already a heat level
  if (typeof countOrLevel === 'string') {
    return countOrLevel;
  }
  // If it's a number, it's a prospect count
  return getHeatLevelFromProspectCount(countOrLevel);
}

/**
 * Get color scheme for heat level (returns object with border/bg/text).
 * Handles BOTH old heat levels (on-target, warm, light, cold, inactive)
 * AND new heat levels (high, medium, low, none).
 * 
 * GREEN = high activity (go work that territory!)
 * CYAN = medium activity
 * ORANGE = low activity
 * RED = no activity (warning)
 */
export function getHeatColor(level) {
  const normalized = String(level || '').toLowerCase();

  // NEW system: prospect-count based
  if (normalized === 'high') {
    return {
      border: 'rgba(34, 197, 94, 0.85)',
      bg: 'rgba(34, 197, 94, 0.28)',
      text: '#22C55E',
    };
  }
  if (normalized === 'medium') {
    return {
      border: 'rgba(0, 201, 255, 0.76)',
      bg: 'rgba(0, 201, 255, 0.24)',
      text: '#00C9FF',
    };
  }
  if (normalized === 'low') {
    return {
      border: 'rgba(255, 140, 0, 0.75)',
      bg: 'rgba(255, 140, 0, 0.20)',
      text: '#FF8C00',
    };
  }
  if (normalized === 'none') {
    return {
      border: 'rgba(239, 68, 68, 0.65)',
      bg: 'rgba(239, 68, 68, 0.15)',
      text: '#EF4444',
    };
  }

  // OLD system: daily average based (for backward compatibility)
  if (normalized === 'on-target') {
    return {
      border: 'rgba(34, 197, 94, 0.85)',
      bg: 'rgba(34, 197, 94, 0.28)',
      text: '#22C55E',
    };
  }
  if (normalized === 'warm') {
    return {
      border: 'rgba(0, 201, 255, 0.76)',
      bg: 'rgba(0, 201, 255, 0.24)',
      text: '#00C9FF',
    };
  }
  if (normalized === 'light') {
    return {
      border: 'rgba(255, 140, 0, 0.75)',
      bg: 'rgba(255, 140, 0, 0.20)',
      text: '#FF8C00',
    };
  }
  if (normalized === 'cold' || normalized === 'inactive') {
    return {
      border: 'rgba(239, 68, 68, 0.65)',
      bg: 'rgba(239, 68, 68, 0.15)',
      text: '#EF4444',
    };
  }

  // Fallback
  return {
    border: 'rgba(239, 68, 68, 0.65)',
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#EF4444',
  };
}

/**
 * Legacy function for backward compatibility.
 * Returns objects with the OLD shape (dailyAvg, weeklyCount, etc.)
 * but using NEW 90-day activity calculation underneath.
 * 
 * This keeps existing code (like TerritoryManagerScreen) working without changes.
 */
export function buildZipActivity(myZips = [], leads = []) {
  const now = Date.now();
  const ninetyDaysAgo = now - NINETY_DAYS_MS;

  const activity = {};

  // Initialize all ZIPs with OLD object shape
  for (const entry of myZips) {
    activity[entry.zip] = {
      ...entry,
      leadCount: 0,
      weeklyCount: 0,
      prospectCount90d: 0,
      dailyAvg: 0,
      lastActivity: null,
      leads: [],
      heatLevel: 'none',
    };
  }

  // Count prospects in OLD format (weekly + daily avg)
  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    const rawZip = lead.zip ?? lead.zipCode ?? lead.postalCode ?? lead.ZIP ?? '';
    const zip = String(rawZip).replace(/\D/g, '').slice(0, 5);
    if (!zip || !activity[zip]) continue;

    activity[zip].leadCount += 1;
    activity[zip].leads.push(lead);

    const ts = lead.capturedAt || lead.savedAt || '';
    const captureTime = ts ? new Date(ts).getTime() : 0;

    // Count in both weekly AND 90-day windows
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    if (captureTime >= weekAgo) {
      activity[zip].weeklyCount += 1;
    }
    if (captureTime >= ninetyDaysAgo) {
      activity[zip].prospectCount90d += 1;
    }

    if (!activity[zip].lastActivity || ts > activity[zip].lastActivity) {
      activity[zip].lastActivity = ts;
    }
  }

  // Calculate daily avg from weekly count (÷7) - for backward compatibility
  for (const zip of Object.keys(activity)) {
    activity[zip].dailyAvg = parseFloat((activity[zip].weeklyCount / 7).toFixed(1));
    // Also set the new heat level based on 90-day count
    activity[zip].heatLevel = getHeatLevelFromProspectCount(activity[zip].prospectCount90d);
  }

  return Object.values(activity).sort((a, b) => b.prospectCount90d - a.prospectCount90d);
}

export function matchLeadsToTerritory(leads = [], myZips = []) {
  const zipSet = new Set(myZips.map(e => e.zip));
  return leads.filter(l => zipSet.has(String(l.zip || '').replace(/\D/g, '').slice(0, 5)));
}

/** Aggregate stats for AI / dashboard copy (safe if activity is missing or malformed). */
export function summarizeZipActivity(zipActivity = []) {
  if (!Array.isArray(zipActivity)) {
    return { zipCount: 0, prospectCount: 0, prospectCount90d: 0, hottestZip: null };
  }
  let prospectCount = 0;
  let prospectCount90d = 0;
  for (const z of zipActivity) {
    prospectCount += Number(z?.prospectCount) || 0;
    prospectCount90d += Number(z?.prospectCount90d) || 0;
  }
  return {
    zipCount: zipActivity.length,
    prospectCount,
    prospectCount90d,
    hottestZip: zipActivity[0]?.zip ?? null,
  };
}

/**
 * Pick a recommended ZIP for the dashboard / AI welcome card.
 * Uses local territory + activity only (no network).
 */
export function getRecommendedZipAreas(_leads = [], myZips = [], _currentLocation = null, options = {}) {
  const zipActivity = Array.isArray(options.zipActivity) ? options.zipActivity : [];

  let ranked = zipActivity.map((row) => ({
    ...row,
  }));

  if (!ranked.length && Array.isArray(myZips) && myZips.length) {
    ranked = myZips.map((e) => ({
      zip: e.zip,
      notes: e.notes,
      prospectCount: 0,
      prospectCount90d: 0,
      heatLevel: 'none',
      lastProspectDate: null,
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
    // Prioritize high prospect counts
    if (options.highActivity !== false) {
      score += (Number(row.prospectCount90d) || 0) * 2;
      score += (Number(row.prospectCount) || 0) * 0.5;
    }
    // Bonus for recent activity
    if (options.leastRecent !== false && row.lastProspectDate) {
      const t = new Date(row.lastProspectDate).getTime();
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
      (top.prospectCount90d || 0) > 0
        ? `${top.prospectCount90d} prospects in this ZIP (90-day window).`
        : (top.prospectCount || 0) > 0
          ? `${top.prospectCount} total prospects in this territory.`
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

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('[syncTerritoryToSupabase] Auth failed:', authError?.message);
      return { ok: false, reason: 'unauthorized' };
    }

    // Deduplicate by zip_code — prevent ON CONFLICT errors from duplicate entries
    const seen = new Set();
    const rows = myZips
      .filter(entry => {
        const zip = String(entry.zip || '').trim();
        if (!zip || seen.has(zip)) return false;
        seen.add(zip);
        return true;
      })
      .map(entry => ({
        user_id:      authUser.id,
        zip_code:     entry.zip,
        notes:        entry.notes || '',
        rep_name:     user?.repName || '',
        employee_num: user?.employeeNum || '',
        branch_num:   user?.branchNum || '',
        added_at:     entry.addedAt || new Date().toISOString(),
      }));

    if (!rows.length) return { ok: true };

    const { error } = await supabase
      .from('territory_zips')
      .upsert(rows, { onConflict: 'user_id,zip_code' });

    if (error) {
      console.error('[syncTerritoryToSupabase] Upsert failed:', error.message, error.details);
      throw error;
    }

    return { ok: true };
  } catch (err) {
    console.error('[syncTerritoryToSupabase] Unexpected error:', err.message);
    return { ok: false, reason: err?.message };
  }
}

// ─── Supabase: Pull MY ZIPs down ──────────────────────────────────────────────

export async function fetchMyTerritoryFromSupabase(supabase, user) {
  try {
    if (!supabase) return { ok: false, data: [] };

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, data: [], reason: 'unauthorized' };

    const { data, error } = await supabase
      .from('territory_zips')
      .select('zip_code, notes, added_at')
      .eq('user_id', authUser.id);

    if (error) {
      console.error('[fetchMyTerritoryFromSupabase] Query failed:', error.message);
      throw error;
    }
    if (!data?.length) return { ok: true, data: [] };

    const zips = data.map(row => ({
      zip:     row.zip_code,
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
  // Team territory sharing is not enabled for private beta.
  return { ok: true, data: [], note: 'Team territory sharing is disabled.' };
}
