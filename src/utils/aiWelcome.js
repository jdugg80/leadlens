// src/utils/aiWelcome.js

// IMPORTANT:
// Adjust this import path only if your Supabase client lives somewhere else.
// Search your project for "createClient" or "export const supabase" if this path fails.
import { storageBridge as AsyncStorage } from './storage';
import { supabase } from "../lib/supabase";
import {
  AI_WELCOME_ENABLED_KEY,
  AI_WELCOME_SHOWN_DATE_KEY,
  AI_RECOMMENDATION_SETTINGS_KEY,
  AI_PERSONALITY_STYLE_KEY,
  AI_VOICE_PROFILE_KEY
} from '../constants';

export async function isAIWelcomeEnabled() {
  try {
    const val = await AsyncStorage.getItem(AI_WELCOME_ENABLED_KEY || '@leadlens_ai_welcome_enabled');
    return val === null ? true : val === 'true';
  } catch { return true; }
}

export async function setAIWelcomeEnabled(enabled) {
  await AsyncStorage.setItem(AI_WELCOME_ENABLED_KEY, String(enabled));
}

export async function hasAIWelcomeBeenShownToday(user) {
  try {
    const date = await AsyncStorage.getItem(`${AI_WELCOME_SHOWN_DATE_KEY}_${user?.id || 'anon'}`);
    return date === new Date().toISOString().slice(0, 10);
  } catch { return false; }
}

export async function markAIWelcomeShownToday(user) {
  await AsyncStorage.setItem(`${AI_WELCOME_SHOWN_DATE_KEY}_${user?.id || 'anon'}`, new Date().toISOString().slice(0, 10));
}

export async function clearAIWelcomeCache() {
  // Clearing the "shown today" flag effectively allows a refresh
  // On a real system, you might clear a cached response object here.
}

export async function loadAIRecommendationSettings() {
  try {
    const val = await AsyncStorage.getItem(AI_RECOMMENDATION_SETTINGS_KEY);
    return val ? JSON.parse(val) : {
      currentLocation: true,
      openProspects: true,
      highActivity: true,
      leastRecent: true,
      personalizedRecommendations: true
    };
  } catch {
    return { currentLocation: true, openProspects: true, highActivity: true, leastRecent: true };
  }
}

export async function setAIRecommendationPreference(key, value) {
  const settings = await loadAIRecommendationSettings();
  settings[key] = value;
  await AsyncStorage.setItem(AI_RECOMMENDATION_SETTINGS_KEY, JSON.stringify(settings));
}

export async function getAIPersonalityStyle() {
  try {
    return await AsyncStorage.getItem(AI_PERSONALITY_STYLE_KEY) || 'Professional';
  } catch { return 'Professional'; }
}

export async function setAIPersonalityStyle(style) {
  await AsyncStorage.setItem(AI_PERSONALITY_STYLE_KEY, style);
}

export async function getAIVoiceProfile() {
  try {
    return await AsyncStorage.getItem(AI_VOICE_PROFILE_KEY) || 'Default';
  } catch { return 'Default'; }
}

export async function setAIVoiceProfile(profile) {
  await AsyncStorage.setItem(AI_VOICE_PROFILE_KEY, profile);
}

export async function getAIWelcomeSuggestions(user, rawLeads, activity, recommendationResult) {
  const input = {
    userName: user?.repName || user?.firstName || 'there',
    role: user?.role,
    recentActivity: Array.isArray(activity) ? activity.slice(0, 3).map(a => `${a.zip}: ${a.weeklyCount} leads`).join(', ') : '',
    recommendation: recommendationResult?.recommendedZip,
  };

  const suggestion = await fetchAISuggestions(input);

  // If it's just a string (the fallback or simple response),
  // structure it for the Dashboard UI which expects an object.
  if (typeof suggestion === 'string') {
    return {
      greeting: `Welcome back, ${user?.firstName || 'there'}!`,
      insight: suggestion,
      suggestions: [],
      recommendation: recommendationResult?.recommendedZip,
      backups: recommendationResult?.backups || [],
      fallback: recommendationResult?.fallback
    };
  }

  return {
    ...suggestion,
    recommendation: suggestion.recommendation || recommendationResult?.recommendedZip,
    backups: suggestion.backups || recommendationResult?.backups || [],
    fallback: suggestion.fallback || recommendationResult?.fallback
  };
}

/**
 * Fetches AI Welcome suggestions through the Supabase Edge Function.
 *
 * The mobile app should NEVER call Anthropic directly.
 * The Anthropic API key must stay inside Supabase Edge Function secrets.
 */
export async function fetchAISuggestions(input = {}) {
  try {
    const {
      userName,
      role,
      territory,
      industry,
      recentActivity,
      requestedMode = "briefing",

      // Optional compatibility fields in case your existing screen passes these:
      repName,
      currentUser,
      user,
      stats,
      prospectStats,
      activitySummary,
      styleInstruction,
    } = input || {};

    const resolvedUserName =
      userName ||
      repName ||
      currentUser?.name ||
      user?.name ||
      currentUser?.firstName ||
      user?.firstName ||
      "there";

    const resolvedRole =
      role ||
      currentUser?.role ||
      user?.role ||
      "outside sales";

    const resolvedTerritory =
      territory ||
      currentUser?.territory ||
      user?.territory ||
      "your assigned territory";

    const resolvedIndustry =
      industry ||
      currentUser?.industry ||
      user?.industry ||
      "commercial prospecting";

    const resolvedRecentActivity =
      recentActivity ||
      activitySummary ||
      prospectStats?.summary ||
      stats?.summary ||
      "No recent activity provided.";

    const { data, error } = await supabase.functions.invoke("ai-welcome", {
      body: {
        userName: resolvedUserName,
        role: resolvedRole,
        territory: resolvedTerritory,
        industry: resolvedIndustry,
        recentActivity: resolvedRecentActivity,
        requestedMode,
        styleInstruction,
        stats,
        prospectStats,
      },
    });

    if (error) {
      console.warn("AI Welcome Edge Function error:", error);
      return FALLBACK_AI_WELCOME;
    }

    return data?.suggestion || FALLBACK_AI_WELCOME;
  } catch (err) {
    console.warn("AI Welcome unexpected error:", err);
    return FALLBACK_AI_WELCOME;
  }
}

export default fetchAISuggestions;