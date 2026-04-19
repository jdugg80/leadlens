import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_INTRO_TEMPLATES,
  EXPORT_SETTINGS_KEY,
  INTRO_TEMPLATE_SETTINGS_KEY,
  EXPORT_MODES,
} from '../constants';

function normalizeMode(mode) {
  if (mode === 'template') return EXPORT_MODES.SALES_TEMPLATE;
  if (mode === 'sales_template') return EXPORT_MODES.SALES_TEMPLATE;
  if (mode === 'standard') return EXPORT_MODES.STANDARD;
  return DEFAULT_EXPORT_SETTINGS.mode;
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
  return next;
}

export async function resetIntroTemplates() {
  await AsyncStorage.setItem(INTRO_TEMPLATE_SETTINGS_KEY, JSON.stringify(DEFAULT_INTRO_TEMPLATES));
  return DEFAULT_INTRO_TEMPLATES;
}

export async function getExportSettings() {
  const raw = await AsyncStorage.getItem(EXPORT_SETTINGS_KEY);
  if (!raw) return DEFAULT_EXPORT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_EXPORT_SETTINGS, ...parsed, mode: normalizeMode(parsed.mode) };
  } catch {
    return DEFAULT_EXPORT_SETTINGS;
  }
}

export async function saveExportSettings(settings) {
  const next = { ...DEFAULT_EXPORT_SETTINGS, ...settings, mode: normalizeMode(settings.mode) };
  await AsyncStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify(next));
  return next;
}

export function applyTemplate(template, context) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
    const value = context[key];
    return value === undefined || value === null || value === '' ? '' : String(value);
  });
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
