import { storageBridge as AsyncStorage } from './storage';
import { createSupabaseClient } from './supabaseClient';
import { SUPABASE_SETTINGS_KEY } from '../constants';

const USER_LEARNING_PROFILE_TABLE = 'user_learning_profiles';
const USER_ACTIVITY_EVENTS_TABLE = 'user_activity_events';
const LEARNING_PROFILE_LOCAL_KEY = '@leadlens_learning_profile';

function normalizeArrayField(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map(String).slice(0, 20);
}

function addUniqueItem(list = [], item) {
  if (!item) return list;
  const next = Array.from(new Set([...(list || []), String(item).trim()]));
  return next.slice(0, 20);
}

function updateLearningProfileForEvent(profile = {}, eventType, payload = {}) {
  const next = {
    preferred_zips: normalizeArrayField(profile.preferred_zips),
    ignored_zips: normalizeArrayField(profile.ignored_zips),
    top_business_types: normalizeArrayField(profile.top_business_types),
    ignored_business_types: normalizeArrayField(profile.ignored_business_types),
    best_performing_zips: normalizeArrayField(profile.best_performing_zips),
    preferred_search_radius: profile.preferred_search_radius || null,
    average_goal_completion: profile.average_goal_completion || null,
    last_recommended_areas: Array.isArray(profile.last_recommended_areas) ? profile.last_recommended_areas.slice(0, 8) : [],
    ai_personality_style: profile.ai_personality_style || null,
    ai_voice_profile: profile.ai_voice_profile || null,
    ...profile,
  };

  const zip = String(payload.zip_code || payload.zip || '').trim();
  const businessType = String(payload.business_type || payload.businessType || '').trim();
  const radius = Number.isFinite(Number(payload.radius)) ? Number(payload.radius) : null;
  const now = new Date().toISOString();

  if (radius && eventType === 'nearby_search_ran') {
    next.preferred_search_radius = radius;
  }

  switch (eventType) {
    case 'prospect_added':
    case 'prospect_exported':
    case 'export_created':
    case 'export_sent':
      if (zip) {
        next.preferred_zips = addUniqueItem(next.preferred_zips, zip);
        if (eventType !== 'prospect_added') {
          next.best_performing_zips = addUniqueItem(next.best_performing_zips, zip);
        }
      }
      if (businessType) {
        next.top_business_types = addUniqueItem(next.top_business_types, businessType);
      }
      break;
    case 'prospect_viewed':
    case 'prospect_marked_visited':
    case 'zip_opened':
      if (zip) {
        next.preferred_zips = addUniqueItem(next.preferred_zips, zip);
      }
      if (businessType && eventType !== 'zip_opened') {
        next.top_business_types = addUniqueItem(next.top_business_types, businessType);
      }
      break;
    case 'zip_recommended':
      if (zip) {
        next.last_recommended_areas = [
          { zip_code: zip, recommended_at: now },
          ...next.last_recommended_areas.filter((item) => item.zip_code !== zip),
        ].slice(0, 8);
      }
      break;
    case 'intro_text_sent':
    case 'intro_email_sent':
    case 'prospect_called':
    case 'prospect_marked_visited':
      if (zip) {
        next.preferred_zips = addUniqueItem(next.preferred_zips, zip);
        next.best_performing_zips = addUniqueItem(next.best_performing_zips, zip);
      }
      if (businessType) {
        next.top_business_types = addUniqueItem(next.top_business_types, businessType);
      }
      break;
    case 'prospect_deleted':
      if (zip) {
        next.ignored_zips = addUniqueItem(next.ignored_zips, zip);
      }
      if (businessType) {
        next.ignored_business_types = addUniqueItem(next.ignored_business_types, businessType);
      }
      break;
    default:
      break;
  }

  if (payload.goal_completion_ratio != null) {
    const ratio = Number(payload.goal_completion_ratio);
    if (Number.isFinite(ratio)) {
      next.average_goal_completion = Number(ratio.toFixed(2));
    }
  }

  return next;
}

async function getSupabaseSettings() {
  try {
    const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[UserLearning] Failed to read Supabase settings:', err?.message || String(err));
    return null;
  }
}

async function getSessionUserId(supabase) {
  if (!supabase?.auth) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user?.id) return null;
    return data.session.user.id;
  } catch (err) {
    console.warn('[UserLearning] Failed to get session user ID:', err?.message || String(err));
    return null;
  }
}

export async function loadUserLearningProfile() {
  try {
    const settings = await getSupabaseSettings();
    const supabase = createSupabaseClient(settings);
    const userId = supabase ? await getSessionUserId(supabase) : null;

    if (userId) {
      const { data, error } = await supabase
        .from(USER_LEARNING_PROFILE_TABLE)
        .select('*')
        .eq('user_id', userId)
        .single();
      if (!error && data) {
        return {
          ...data,
          preferred_zips: normalizeArrayField(data.preferred_zips),
          ignored_zips: normalizeArrayField(data.ignored_zips),
          top_business_types: normalizeArrayField(data.top_business_types),
          best_performing_zips: normalizeArrayField(data.best_performing_zips),
          last_recommended_areas: Array.isArray(data.last_recommended_areas)
            ? data.last_recommended_areas
            : [],
        };
      }
    }
  } catch (err) {
    console.warn('[UserLearning] Failed to load learning profile from Supabase:', err?.message || String(err));
  }

  try {
    const raw = await AsyncStorage.getItem(LEARNING_PROFILE_LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[UserLearning] Failed to load learning profile from local storage:', err?.message || String(err));
    return null;
  }
}

export async function upsertUserLearningProfile(profile = {}) {
  const normalized = {
    preferred_zips: normalizeArrayField(profile.preferred_zips),
    ignored_zips: normalizeArrayField(profile.ignored_zips),
    top_business_types: normalizeArrayField(profile.top_business_types),
    ignored_business_types: normalizeArrayField(profile.ignored_business_types),
    best_performing_zips: normalizeArrayField(profile.best_performing_zips),
    preferred_search_radius: profile.preferred_search_radius || null,
    average_goal_completion:
      Number.isFinite(Number(profile.average_goal_completion))
        ? Number(profile.average_goal_completion)
        : null,
    last_recommended_areas: Array.isArray(profile.last_recommended_areas)
      ? profile.last_recommended_areas.slice(0, 8)
      : [],
    ai_personality_style: profile.ai_personality_style || profile.personalityStyle || null,
    ai_voice_profile: profile.ai_voice_profile || profile.voiceProfile || null,
    updated_at: new Date().toISOString(),
    ...profile,
  };

  try {
    const settings = await getSupabaseSettings();
    const supabase = createSupabaseClient(settings);
    const userId = supabase ? await getSessionUserId(supabase) : null;
    if (userId) {
      await supabase
        .from(USER_LEARNING_PROFILE_TABLE)
        .upsert(
          [
            {
              user_id: userId,
              preferred_zips: normalized.preferred_zips,
              ignored_zips: normalized.ignored_zips,
              top_business_types: normalized.top_business_types,
              ignored_business_types: normalized.ignored_business_types,
              best_performing_zips: normalized.best_performing_zips,
              preferred_search_radius: normalized.preferred_search_radius,
              average_goal_completion: normalized.average_goal_completion,
              last_recommended_areas: normalized.last_recommended_areas,
              ai_personality_style: normalized.ai_personality_style,
              ai_voice_profile: normalized.ai_voice_profile,
              updated_at: normalized.updated_at,
            },
          ],
          { onConflict: 'user_id' }
        );
    }
  } catch (err) {
    console.warn('[UserLearning] Failed to upsert learning profile to Supabase:', err?.message || String(err));
  }

  try {
    await AsyncStorage.setItem(LEARNING_PROFILE_LOCAL_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.warn('[UserLearning] Failed to save learning profile locally:', err?.message || String(err));
  }

  return normalized;
}

export async function resetUserLearningData() {
  try {
    const settings = await getSupabaseSettings();
    const supabase = createSupabaseClient(settings);
    const userId = supabase ? await getSessionUserId(supabase) : null;
    if (userId) {
      await supabase
        .from(USER_LEARNING_PROFILE_TABLE)
        .delete()
        .eq('user_id', userId);
      await supabase
        .from(USER_ACTIVITY_EVENTS_TABLE)
        .delete()
        .eq('user_id', userId);
    }
  } catch (err) {
    console.warn('[UserLearning] Failed to reset learning data in Supabase:', err?.message || String(err));
  }

  try {
    await AsyncStorage.removeItem(LEARNING_PROFILE_LOCAL_KEY);
  } catch (err) {
    console.warn('[UserLearning] Failed to remove local learning profile:', err?.message || String(err));
  }
}

export async function recordUserActivityEvent(eventType, payload = {}) {
  try {
    const settings = await getSupabaseSettings();
    const supabase = createSupabaseClient(settings);
    const userId = supabase ? await getSessionUserId(supabase) : null;

    if (userId && supabase) {
      await supabase.from(USER_ACTIVITY_EVENTS_TABLE).insert([
        {
          user_id: userId,
          event_type: eventType,
          prospect_id: payload.prospectId || payload.prospect_id || null,
          zip_code: payload.zip_code || payload.zip || null,
          business_type: payload.business_type || payload.businessType || null,
          confidence_score:
            Number.isFinite(Number(payload.confidence_score || payload.confidenceScore))
              ? Number(payload.confidence_score || payload.confidenceScore)
              : null,
          source_type: payload.source_type || payload.sourceType || null,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  } catch (err) {
    console.warn('[UserLearning] Failed to record activity event to Supabase:', err?.message || String(err));
  }

  try {
    const existing = (await loadUserLearningProfile()) || {};
    const updated = updateLearningProfileForEvent(existing, eventType, payload);
    await upsertUserLearningProfile(updated);
  } catch (err) {
    console.warn('[UserLearning] Failed to update learning profile after event:', err?.message || String(err));
  }
}
