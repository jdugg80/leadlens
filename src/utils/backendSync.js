import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTOMATION_SETTINGS_KEY,
  LEADS_STORAGE_KEY,
} from '../constants';
import { createSupabaseClient } from './supabaseClient';

function normalizeLeadForSync(lead = {}, user = {}) {
  return {
    business_name: lead.businessName || '',
    poc_first: lead.pocFirst || lead.firstName || '',
    poc_last: lead.pocLast || lead.lastName || '',
    phone: lead.phone || '',
    email: lead.email || '',
    street_number: lead.streetNumber || '',
    street_name: lead.streetName || '',
    address_line_2: lead.addressLine2 || '',
    city: lead.city || '',
    state: lead.state || '',
    zip: lead.zip || '',
    website: lead.website || '',
    notes: lead.notes || '',
    vertical: lead.vertical || '',
    source_type: lead.sourceType || '',
    duplicate_flag: !!lead.possibleDuplicate,
    raw_lead: lead,
    rep_name: user?.repName || '',
    employee_num: user?.employeeNum || '',
    branch_num: user?.branchNum || '',
    created_at_client: new Date().toISOString(),
  };
}

export async function syncQueueToSupabase(user, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) {
      return { ok: false, reason: 'missing-config' };
    }

    const rawQueue = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = rawQueue ? JSON.parse(rawQueue) : [];

    if (!Array.isArray(queue) || queue.length === 0) {
      return { ok: true, reason: 'empty-queue', count: 0 };
    }

    const rows = queue.map((lead) => normalizeLeadForSync(lead, user));

    const { error } = await supabase.from('queue_items').insert(rows);

    if (error) {
      return { ok: false, reason: error.message || 'insert-failed' };
    }

    return { ok: true, reason: 'synced', count: rows.length };
  } catch (err) {
    return { ok: false, reason: err?.message || 'sync-failed' };
  }
}

export async function queueScheduledExport(user, supabaseSettings = {}) {
  try {
    const supabase = createSupabaseClient(supabaseSettings);
    if (!supabase) {
      return { ok: false, reason: 'missing-config' };
    }

    const rawQueue = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = rawQueue ? JSON.parse(rawQueue) : [];

    if (!Array.isArray(queue) || queue.length === 0) {
      return { ok: true, reason: 'empty-queue', count: 0 };
    }

    const rawAutomation = await AsyncStorage.getItem(AUTOMATION_SETTINGS_KEY);
    const automation = rawAutomation ? JSON.parse(rawAutomation) : {};

    const payload = {
      requested_by: user?.repName || '',
      employee_num: user?.employeeNum || '',
      branch_num: user?.branchNum || '',
      lead_count: queue.length,
      recipients: automation?.recipients || '',
      subject: automation?.subject || 'LeadLens Scheduled Export',
      body: automation?.body || 'Attached is the latest LeadLens export.',
      send_time: automation?.sendTime || '17:00',
      export_profile: automation?.exportProfile || 'standard',
      clear_after_send: !!automation?.clearAfterSend,
      status: 'queued',
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('scheduled_export_jobs').insert([payload]);

    if (error) {
      return { ok: false, reason: error.message || 'job-queue-failed' };
    }

    return { ok: true, reason: 'queued', count: queue.length };
  } catch (err) {
    return { ok: false, reason: err?.message || 'job-queue-failed' };
  }
}