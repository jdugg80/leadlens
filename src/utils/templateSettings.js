import { storage as AsyncStorage } from './storage';
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_INTRO_TEMPLATES,
  DEFAULT_REVIEW_TEMPLATES,
  EXPORT_SETTINGS_KEY,
  INTRO_TEMPLATE_SETTINGS_KEY,
  OUTREACH_REVIEW_TEMPLATES_KEY,
  EXPORT_MODES,
  SUPABASE_SETTINGS_KEY,
} from '../constants';
import { createSupabaseClient } from './supabaseClient';

function normalizeMode(mode) {
  if (mode === 'template') return EXPORT_MODES.SALES_TEMPLATE;
  if (mode === 'sales_template') return EXPORT_MODES.SALES_TEMPLATE;
  if (mode === 'standard') return EXPORT_MODES.STANDARD;
  if (mode === 'custom' || mode === EXPORT_MODES.CUSTOM) return EXPORT_MODES.CUSTOM;
  return DEFAULT_EXPORT_SETTINGS.mode;
}

async function syncSettingsToSupabase(key, data) {
  try {
    // Use sync API for instant settings retrieval
    const raw = AsyncStorage.getSync(SUPABASE_SETTINGS_KEY);
    const config = raw ? JSON.parse(raw) : null;
    const supabase = createSupabaseClient(config);
    if (!supabase) return;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;

    // Get current settings first
    const { data: existing } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .single();

    const nextSettings = { ...(existing?.settings || {}), [key]: data };

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        settings: nextSettings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

    if (error) console.warn('[syncSettingsToSupabase] Failed:', error.message);
  } catch (err) {
    console.warn('[syncSettingsToSupabase] Unexpected error:', err.message);
  }
}

export async function getIntroTemplates() {
  const raw = await AsyncStorage.getItem(INTRO_TEMPLATE_SETTINGS_KEY);
  if (!raw) return DEFAULT_INTRO_TEMPLATES;
  try {
    return { ...DEFAULT_INTRO_TEMPLATES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_INTRO_TEMPLATES;
  }
}

export async function saveIntroTemplates(templates) {
  const next = { ...DEFAULT_INTRO_TEMPLATES, ...templates };
  await AsyncStorage.setItem(INTRO_TEMPLATE_SETTINGS_KEY, JSON.stringify(next));
  syncSettingsToSupabase('intro_templates', next);
  return next;
}

export async function resetIntroTemplates() {
  await AsyncStorage.setItem(INTRO_TEMPLATE_SETTINGS_KEY, JSON.stringify(DEFAULT_INTRO_TEMPLATES));
  syncSettingsToSupabase('intro_templates', DEFAULT_INTRO_TEMPLATES);
  return DEFAULT_INTRO_TEMPLATES;
}

export async function getExportSettings() {
  const raw = await AsyncStorage.getItem(EXPORT_SETTINGS_KEY);
  if (!raw) return DEFAULT_EXPORT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EXPORT_SETTINGS,
      ...parsed,
      mode: normalizeMode(parsed.mode),
      profileName: parsed.profileName || '',
    };
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

export async function saveExportSettings(settings) {
  const next = {
    ...DEFAULT_EXPORT_SETTINGS,
    ...settings,
    mode: normalizeMode(settings.mode),
    profileName: settings.profileName || '',
  };
  await AsyncStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(next));
  syncSettingsToSupabase('export_settings', next);
  return next;
}

export function applyTemplate(template, context) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    const value = context[key];
    return value === undefined || value === null || value === '' ? '' : String(value);
  });
}

export async function getReviewTemplates() {
  const raw = await AsyncStorage.getItem(OUTREACH_REVIEW_TEMPLATES_KEY);
  if (!raw) return DEFAULT_REVIEW_TEMPLATES;
  try {
    return { ...DEFAULT_REVIEW_TEMPLATES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_REVIEW_TEMPLATES;
  }
}

export async function saveReviewTemplates(templates) {
  const next = { ...DEFAULT_REVIEW_TEMPLATES, ...templates };
  await AsyncStorage.setItem(OUTREACH_REVIEW_TEMPLATES_KEY, JSON.stringify(next));
  syncSettingsToSupabase('review_templates', next);
  return next;
}

export async function resetReviewTemplates() {
  await AsyncStorage.setItem(OUTREACH_REVIEW_TEMPLATES_KEY, JSON.stringify(DEFAULT_REVIEW_TEMPLATES));
  syncSettingsToSupabase('review_templates', DEFAULT_REVIEW_TEMPLATES);
  return DEFAULT_REVIEW_TEMPLATES;
}

export function buildTemplateContext(lead, user) {
  const safeFirst = lead?.pocFirst && lead.pocFirst !== '.' ? lead.pocFirst : 'there';
  const safeLast = lead?.pocLast && lead.pocLast !== '.' ? lead.pocLast : '';
  const contactName = [safeFirst, safeLast].filter(Boolean).join(' ') || 'there';

  return {
    businessName: lead?.businessName || 'your business',
    firstName: safeFirst,
    lastName: safeLast,
    contactName,
    phone: lead?.phone || '',
    email: lead?.email || '',
    city: lead?.city || '',
    state: lead?.state || '',
    zip: lead?.zip || '',
    repName: user?.repName || '',
    repEmail: user?.repEmail || '',
    employeeNum: user?.employeeNum || '',
    branchNum: user?.branchNum || '',
    territory: user?.territory || '',
  };
}
