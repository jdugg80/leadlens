import { storageBridge as AsyncStorage } from './storage';
import {
  AUTOMATION_SETTINGS_KEY,
  LEADS_STORAGE_KEY,
  SUPABASE_SETTINGS_KEY,
} from '../constants';
import { createSupabaseClient } from './supabaseClient';
import { enqueueTask, TASK_TYPES } from './taskQueue';
import { normalizeFixedFieldValue } from './leadProcessing';

// ─── Error Categorization ─────────────────────────────────────────────────────

function categorizeError(err) {
  const msg = err?.message?.toLowerCase() || '';
  if (msg.includes('jwt') || msg.includes('auth') || msg.includes('unauthorized')) return 'auth';
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')) return 'network';
  if (msg.includes('rls') || msg.includes('policy') || msg.includes('permission')) return 'rls';
  return 'unknown';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRow(lead = {}, user = {}) {
  return {
    id:                lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    business_name:     lead.businessName || '',
    poc_first:         lead.pocFirst || '',
    poc_last:          lead.pocLast || '',
    phone:             lead.phone || '',
    email:             lead.email || '',
    street_number:     lead.streetNumber || '',
    street_name:       lead.streetName || '',
    address_line_2:    lead.addressLine2 || '',
    city:              lead.city || '',
    state:             lead.state || '',
    zip:               lead.zip || '',
    website:           lead.website || '',
    notes:             lead.notes || '',
    vertical:          lead.vertical || '',
    status:            normalizeFixedFieldValue(lead.status || 'New'),
    property_type:     normalizeFixedFieldValue(lead.propertyType || 'Commercial'),
    capture_method:    lead.captureMethod || '',
    rep_name:          user?.repName || lead.repName || '',
    employee_num:      user?.employeeNum || lead.employeeNum || '',
    branch_num:        user?.branchNum || lead.branchNum || '',
    saved_at:          lead.savedAt || new Date().toISOString(),
    created_at_client: lead.createdAt || lead.capturedAt || new Date().toISOString(),
    duplicate_warning: lead.duplicateWarning || '',
    raw_lead:          lead,
    updated_at:        new Date().toISOString(),
  };
}

// ─── Remove prospect from AsyncStorage only ───────────────────────────────────
// Internal helper — not exported. Always call deleteProspect() instead.

async function removeFromLocalStorage(leadId) {
  const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  const filtered = queue.filter(p => p.id !== leadId);
  await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

// ─── Single Prospect Upsert ───────────────────────────────────────────────────

export async function upsertProspect(lead = {}, user = {}, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const row = buildRow(lead, user);

    const { error } = await supabase
      .from('prospects')
      .upsert([row], { onConflict: 'id' });

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Single Prospect Delete ───────────────────────────────────────────────────
// FIX: now removes from BOTH Supabase AND AsyncStorage so the full-push sync
// can never resurrect a deleted prospect.

export async function deleteProspect(leadId, supabaseSettings = {}) {
  // Step 1 — remove from local AsyncStorage immediately so even if Supabase
  // fails the full-push won't bring it back on the next sync.
  let localQueue = [];
  try {
    localQueue = await removeFromLocalStorage(leadId);
  } catch (localErr) {
    console.warn('[deleteProspect] AsyncStorage removal failed:', localErr?.message);
    // Non-fatal — still attempt Supabase delete
  }

  // Step 2 — delete from Supabase
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { error } = await supabase
      .from('prospects')
      .delete()
      .eq('id', leadId);

    if (error) throw error;
    return { ok: true, localCount: localQueue.length };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Bulk Delete ──────────────────────────────────────────────────────────────
// Deletes an array of IDs from both AsyncStorage and Supabase.

export async function deleteProspects(leadIds = [], supabaseSettings = {}) {
  if (!leadIds.length) return { ok: true, count: 0 };

  const idSet = new Set(leadIds);

  // Step 1 — scrub from AsyncStorage
  try {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    const filtered = queue.filter(p => !idSet.has(p.id));
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (localErr) {
    console.warn('[deleteProspects] AsyncStorage removal failed:', localErr?.message);
  }

  // Step 2 — delete from Supabase
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { error } = await supabase
      .from('prospects')
      .delete()
      .in('id', leadIds);

    if (error) throw error;
    return { ok: true, count: leadIds.length };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Bulk sync all local prospects (full push) ────────────────────────────────
// SAFE: reads only what's currently in AsyncStorage. Because deleteProspect()
// already removed the record from AsyncStorage, deleted prospects will never
// appear in this push.

export async function syncAllProspectsToSupabase(user, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const rawQueue = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = rawQueue ? JSON.parse(rawQueue) : [];
    if (!queue.length) return { ok: true, count: 0 };

    const rows = queue.map(lead => buildRow(lead, user));

    const { error } = await supabase
      .from('prospects')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;
    return { ok: true, count: rows.length };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Enqueued Sync (Background Safe) ──────────────────────────────────────────

export async function enqueueSyncAll(supabaseSettings = {}) {
  return enqueueTask(TASK_TYPES.SYNC_ALL, { supabaseSettings });
}

// ─── Storage Bucket Verification ─────────────────────────────────────────────

export async function verifyExportsBucket(supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (!error) {
      const found = (buckets || []).find((b) => String(b?.name || '').toLowerCase() === 'exports');
      if (found) return { ok: true, bucket: found };
    }

    // Fallback check: list() directly against the bucket.
    // This works even when listBuckets is restricted by auth/policy.
    const { error: bucketError } = await supabase.storage.from('exports').list('', { limit: 1 });
    if (bucketError) {
      return {
        ok: false,
        reason: bucketError?.message || error?.message || 'bucket-not-found',
        category: categorizeError(bucketError || error),
        hint: 'Verify this app is connected to the intended Supabase project and that a bucket named "exports" exists.',
      };
    }

    return {
      ok: true,
      bucket: { name: 'exports' },
      note: error ? 'Bucket is reachable, but listBuckets() is restricted for this role.' : undefined,
    };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Update Export Job Status ─────────────────────────────────────────────────

export async function updateExportJobStatus(supabase, jobId, status, extra = {}) {
  try {
    const { error } = await supabase
      .from('scheduled_export_jobs')
      .update({ status, updated_at: new Date().toISOString(), ...extra })
      .eq('id', jobId);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message };
  }
}
