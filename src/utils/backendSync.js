import { storage as AsyncStorage } from './storage';
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

function buildRow(lead = {}, user = {}, authUserId = null) {
  return {
    id:                lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    user_id:           authUserId,
    business_name:     lead.businessName || '',
    poc_first:         lead.pocFirst || '',
    poc_last:          lead.pocLast || '',
    phone:             lead.phone || '',
    email:             lead.email || '',
    address:           lead.address || '',
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
    updated_at:        lead.updatedAt || new Date().toISOString(),

    // New queue/viability fields
    collected_at:      lead.collectedAt || lead.createdAt || lead.capturedAt || new Date().toISOString(),
    reviewed_at:       lead.reviewedAt || null,
    last_edited_at:    lead.lastEditedAt || null,
    queue_status:      lead.queueStatus || 'new',
    queue_sort_group:  lead.queueSortGroup ?? 0,
    viability_score:   lead.viabilityScore ?? 0,
    viability_label:   lead.viabilityLabel || null,
    missing_viability_fields: lead.missingViabilityFields || [],
    shade_key:         lead.shadeKey || null,
  };
}

// ─── Remove prospect from AsyncStorage only ───────────────────────────────────
// Internal helper — not exported. Always call deleteProspect() instead.

async function removeFromLocalStorage(leadId) {
  const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  const queue = raw ? JSON.parse(raw) : [];
  const filtered = queue.filter(p => {
    const pid = p.id || p.leadId || p.queueId || p.createdAt || p.savedAt || p.capturedAt || p.businessName;
    return String(pid).trim() !== String(leadId).trim();
  });
  await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(filtered));
  return filtered;
}

// ─── Single Prospect Upsert ───────────────────────────────────────────────────

export async function upsertProspect(lead = {}, user = {}, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('[upsertProspect] Auth check failed:', authError?.message);
      return { ok: false, reason: 'unauthorized' };
    }

    const row = buildRow(lead, user, authUser.id);

    const { error } = await supabase
      .from('prospects')
      .upsert([row], { onConflict: 'id' });

    if (error) {
      console.error('[upsertProspect] Supabase error:', error.message, error.details);
      throw error;
    }
    return { ok: true };
  } catch (err) {
    console.error('[upsertProspect] Unexpected error:', err.message);
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

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };

    const { error } = await supabase
      .from('prospects')
      .delete()
      .eq('id', leadId)
      .eq('user_id', authUser.id);

    if (error) {
      console.error('[deleteProspect] Supabase error:', error.message);
      throw error;
    }
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
    const filtered = queue.filter(p => {
      const pid = p.id || p.leadId || p.queueId || p.createdAt || p.savedAt || p.capturedAt || p.businessName;
      return !idSet.has(String(pid).trim());
    });
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(filtered));
  } catch (localErr) {
    console.warn('[deleteProspects] AsyncStorage removal failed:', localErr?.message);
  }

  // Step 2 — delete from Supabase
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };

    const { error } = await supabase
      .from('prospects')
      .delete()
      .in('id', leadIds)
      .eq('user_id', authUser.id);

    if (error) {
      console.error('[deleteProspects] Supabase error:', error.message);
      throw error;
    }
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

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) {
      console.error('[syncAllProspectsToSupabase] Auth failed:', authError?.message);
      return { ok: false, reason: 'unauthorized' };
    }

    const rawQueue = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = rawQueue ? JSON.parse(rawQueue) : [];
    if (!queue.length) return { ok: true, count: 0 };

    const rows = queue.map(lead => buildRow(lead, user, authUser.id));

    const { error } = await supabase
      .from('prospects')
      .upsert(rows, { onConflict: 'id' });

    if (error) {
      console.error('[syncAllProspectsToSupabase] Supabase error:', error.message);
      throw error;
    }
    return { ok: true, count: rows.length };
  } catch (err) {
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}

// ─── Enqueued Sync (Background Safe) ──────────────────────────────────────────

export async function enqueueSyncAll(supabaseSettings = {}) {
  return enqueueTask(TASK_TYPES.SYNC_ALL, { supabaseSettings });
}

// ─── Full Pull Sync (Supabase to local) ──────────────────────────────────────

export async function syncProspectsFromSupabase(supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };

    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };

    console.log('[PullSync] Starting deep sync for:', authUser.email);

    // 1. Fetch Prospects
    const { data: remoteProspects, error: pError } = await supabase
      .from('prospects')
      .select('*')
      .eq('user_id', authUser.id);

    if (pError) throw pError;

    const localLeads = (remoteProspects || []).map(row => {
      const raw = row.raw_lead || {};
      return {
        ...raw,
        id: row.id,
        businessName: row.business_name,
        pocFirst: row.poc_first,
        pocLast: row.poc_last,
        phone: row.phone,
        email: row.email,
        address: row.address,
        streetNumber: row.street_number,
        streetName: row.street_name,
        addressLine2: row.address_line_2,
        city: row.city,
        state: row.state,
        zip: row.zip,
        website: row.website,
        notes: row.notes,
        vertical: row.vertical,
        status: row.status,
        propertyType: row.property_type,
        captureMethod: row.capture_method,
        savedAt: row.saved_at,
        updatedAt: row.updated_at,
        viabilityScore: row.viability_score,
        viabilityLabel: row.viability_label,
        shadeKey: row.shade_key,
        queueStatus: row.queue_status || 'new',
      };
    });

    // 2. Fetch Territory ZIPs
    const { data: remoteZips, error: zError } = await supabase
      .from('territory_zips')
      .select('zip_code, notes, added_at')
      .eq('user_id', authUser.id);

    if (zError) throw zError;

    const localZips = (remoteZips || []).map(row => ({
      zip:     row.zip_code,
      notes:   row.notes || '',
      addedAt: row.added_at || new Date().toISOString(),
    }));

    // 3. Commit to local storage
    await Promise.all([
      AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(localLeads)),
      AsyncStorage.setItem('leadlens_territory_zips', JSON.stringify(localZips)),
    ]);

    console.log(`[PullSync] Restored ${localLeads.length} leads and ${localZips.length} ZIPs.`);

    return { ok: true, leads: localLeads.length, zips: localZips.length };
  } catch (err) {
    console.error('[PullSync] Error:', err.message);
    return { ok: false, reason: err.message };
  }
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
export async function syncTerritoryZipsToSupabase(user = {}, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };
 
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };
 
    // Get local ZIPs from AsyncStorage
    const rawZips = await AsyncStorage.getItem('leadlens_territory_zips');
    const localZips = rawZips ? JSON.parse(rawZips) : [];
 
    if (!localZips.length) return { ok: true, count: 0 };
 
    // Transform to match database schema
    const rows = localZips.map((z, idx) => ({
      user_id: authUser.id,
      zip_code: z.zip,
      notes: z.notes || '',
      added_at: z.addedAt || new Date().toISOString(),
    }));
 
    // Upsert — if ZIP already exists for this user, update it
    const { error } = await supabase
      .from('territory_zips')
      .upsert(rows, { onConflict: 'user_id,zip_code' });
 
    if (error) {
      console.error('[syncTerritoryZipsToSupabase] Error:', error.message);
      throw error;
    }
 
    return { ok: true, count: rows.length };
  } catch (err) {
    console.error('[syncTerritoryZipsToSupabase] Failed:', err.message);
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}
 
// ─── Sync User Settings to Supabase (PUSH) ────────────────────────────────────
 
export async function syncUserSettingsToSupabase(supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };
 
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };
 
    // Get local settings from AsyncStorage
    const rawSettings = await AsyncStorage.getItem(AUTOMATION_SETTINGS_KEY);
    const localSettings = rawSettings ? JSON.parse(rawSettings) : {};
 
    if (!Object.keys(localSettings).length) {
      // No settings to sync — that's OK
      return { ok: true, count: 0 };
    }
 
    // Upsert settings as JSONB in user_settings table
    // Assumes table has: id (primary key), user_id, settings (JSONB), updated_at
    const { error } = await supabase
      .from('user_settings')
      .upsert(
        {
          user_id: authUser.id,
          settings: localSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
 
    if (error) {
      console.error('[syncUserSettingsToSupabase] Error:', error.message);
      throw error;
    }
 
    return { ok: true, count: Object.keys(localSettings).length };
  } catch (err) {
    console.error('[syncUserSettingsToSupabase] Failed:', err.message);
    return { ok: false, reason: err?.message, category: categorizeError(err) };
  }
}
 
// ─── Fetch User Settings from Supabase (PULL) ────────────────────────────────
 
export async function syncUserSettingsFromSupabase(supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) return { ok: false, reason: 'missing-config' };
 
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser) return { ok: false, reason: 'unauthorized' };
 
    const { data: rows, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', authUser.id)
      .single();
 
    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found, which is OK for first login
      console.error('[syncUserSettingsFromSupabase] Error:', error.message);
      throw error;
    }
 
    const settings = rows?.settings || {};
 
    // Save to AsyncStorage
    if (Object.keys(settings).length) {
      await AsyncStorage.setItem(AUTOMATION_SETTINGS_KEY, JSON.stringify(settings));
    }
 
    return { ok: true, count: Object.keys(settings).length };
  } catch (err) {
    console.error('[syncUserSettingsFromSupabase] Failed:', err.message);
    return { ok: false, reason: err?.message };
  }
}
 
// ─── FULL SYNC ALL DATA (call on login or periodically) ──────────────────────
 
export async function syncAllDataToSupabase(user = {}, supabaseSettings = {}) {
  console.log('[FullSync] Pushing all local data to Supabase...');
  
  const results = await Promise.all([
    syncAllProspectsToSupabase(user, supabaseSettings),
    syncTerritoryZipsToSupabase(user, supabaseSettings),
    syncUserSettingsToSupabase(supabaseSettings),
  ]);
 
  const allOk = results.every(r => r.ok);
  return {
    ok: allOk,
    prospects: results[0],
    territories: results[1],
    settings: results[2],
  };
}
 
export async function syncAllDataFromSupabase(supabaseSettings = {}) {
  console.log('[FullSync] Pulling all data from Supabase...');
 
  const results = await Promise.all([
    syncProspectsFromSupabase(supabaseSettings),
    syncUserSettingsFromSupabase(supabaseSettings),
  ]);
 
  const allOk = results.every(r => r.ok);
  return {
    ok: allOk,
    prospects: results[0],
    settings: results[1],
  };
}