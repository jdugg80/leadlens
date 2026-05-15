// src/utils/aiWelcome.js

// IMPORTANT:
// Adjust this import path only if your Supabase client lives somewhere else.
// Search your project for "createClient" or "export const supabase" if this path fails.
import { supabase } from "../lib/supabaseClient";

const FALLBACK_AI_WELCOME =
  "I couldn't load today's AI briefing yet. Start with nearby prospects, verify contact info, and queue the strongest leads first.";

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