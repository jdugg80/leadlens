import { storage as AsyncStorage } from './storage';
import { LEADS_STORAGE_KEY } from '../constants';

export const OUTREACH_TYPES = {
  CALL:    { key: 'call',    label: 'Called',   icon: '📞' },
  TEXT:    { key: 'text',    label: 'Texted',   icon: '💬' },
  EMAIL:   { key: 'email',   label: 'Emailed',  icon: '✉️' },
  VISIT:   { key: 'visit',   label: 'Visited',  icon: '🚶' },
  NOTE:    { key: 'note',    label: 'Note',     icon: '📝' },
};

export function buildOutreachEntry(type, note = '') {
  return {
    id: `outreach_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type,
    timestamp: new Date().toISOString(),
    note: String(note || '').trim(),
  };
}

export async function logOutreachActivity(leadId, type, note = '') {
  try {
    // Use sync API for instant activity logging
    const raw = AsyncStorage.getSync(LEADS_STORAGE_KEY);
    const leads = raw ? JSON.parse(raw) : [];
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx === -1) return { ok: false, reason: 'lead-not-found' };

    const entry = buildOutreachEntry(type, note);
    const history = Array.isArray(leads[idx].outreachHistory)
      ? leads[idx].outreachHistory
      : [];

    leads[idx] = {
      ...leads[idx],
      outreachHistory: [entry, ...history],
      lastOutreachAt: entry.timestamp,
      lastOutreachType: type,
    };

    // Use sync API for instant save
    AsyncStorage.setSync(LEADS_STORAGE_KEY, JSON.stringify(leads));
    return { ok: true, entry };
  } catch (err) {
    return { ok: false, reason: err?.message };
  }
}

export function getOutreachSummary(lead = {}) {
  const history = Array.isArray(lead.outreachHistory) ? lead.outreachHistory : [];
  if (!history.length) return null;

  const last = history[0];
  const typeInfo = Object.values(OUTREACH_TYPES).find(t => t.key === last.type);
  const daysAgo = Math.floor((Date.now() - new Date(last.timestamp).getTime()) / (1000 * 60 * 60 * 24));

  return {
    count: history.length,
    lastType: last.type,
    lastIcon: typeInfo?.icon || '📋',
    lastLabel: typeInfo?.label || last.type,
    daysAgo,
    lastTimestamp: last.timestamp,
  };
}

export function formatOutreachDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)   return `${diffDays} days ago`;
  return date.toLocaleDateString();
}
