import { storageBridge as AsyncStorage } from './storage';
import { AI_PERSONALITY_STYLES, AI_PERSONALITY_STYLE_KEY, AI_VOICE_PROFILE_KEY, AI_VOICE_PROFILES } from '../constants';

const AI_WELCOME_CACHE_KEY = '@leadlens_ai_welcome_cache';
const AI_WELCOME_ENABLED_KEY = '@leadlens_ai_welcome_enabled';
const AI_WELCOME_PREF_KEYS = {
  currentLocation: '@leadlens_ai_welcome_pref_current_location',
  openProspects: '@leadlens_ai_welcome_pref_open_prospects',
  highActivity: '@leadlens_ai_welcome_pref_high_activity',
  leastRecent: '@leadlens_ai_welcome_pref_least_recently_worked',
  personalizedRecommendations: '@leadlens_ai_welcome_pref_personalized_recommendations',
  useLocationHistory: '@leadlens_ai_welcome_pref_use_location_history',
};
const AI_WELCOME_SHOWN_PREFIX = 'aiWelcomeShown:';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // refresh every 4 hours

const getAIWelcomeUserKey = (user = {}) => {
  const id = user.id || user.employeeNum || user.repEmail || user.email || 'unknown';
  return String(id).trim().toLowerCase() || 'unknown';
};

const getAIWelcomeShownKey = (user, date = new Date()) => {
  const userKey = getAIWelcomeUserKey(user);
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${AI_WELCOME_SHOWN_PREFIX}${userKey}:${localDate}`;
};

export async function isAIWelcomeEnabled() {
  try {
    const raw = await AsyncStorage.getItem(AI_WELCOME_ENABLED_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export async function setAIWelcomeEnabled(enabled) {
  try {
    await AsyncStorage.setItem(AI_WELCOME_ENABLED_KEY, String(enabled));
  } catch {
    // ignore
  }
}

export async function getAIPersonalityStyle() {
  try {
    const style = await AsyncStorage.getItem(AI_PERSONALITY_STYLE_KEY);
    return style || AI_PERSONALITY_STYLES.FRIENDLY_COACH;
  } catch {
    return AI_PERSONALITY_STYLES.FRIENDLY_COACH;
  }
}

export async function setAIPersonalityStyle(style) {
  try {
    await AsyncStorage.setItem(AI_PERSONALITY_STYLE_KEY, style);
  } catch {
    // ignore
  }
}

export async function getAIVoiceProfile() {
  try {
    const voice = await AsyncStorage.getItem(AI_VOICE_PROFILE_KEY);
    return voice || Object.values(AI_VOICE_PROFILES)[0];
  } catch {
    return Object.values(AI_VOICE_PROFILES)[0];
  }
}

export async function setAIVoiceProfile(voice) {
  try {
    await AsyncStorage.setItem(AI_VOICE_PROFILE_KEY, voice);
  } catch {
    // ignore
  }
}

export async function loadAIRecommendationSettings() {
  try {
    const entries = await Promise.all(
      Object.entries(AI_WELCOME_PREF_KEYS).map(async ([key, storageKey]) => {
        const raw = await AsyncStorage.getItem(storageKey);
        return [key, raw === null ? true : raw === 'true'];
      })
    );
    const settings = Object.fromEntries(entries);
    settings.personalityStyle = await getAIPersonalityStyle();
    settings.voiceProfile = await getAIVoiceProfile();
    return settings;
  } catch {
    return {
      currentLocation: true,
      openProspects: true,
      highActivity: true,
      leastRecent: true,
      personalizedRecommendations: true,
      useLocationHistory: true,
      personalityStyle: AI_PERSONALITY_STYLES.FRIENDLY_COACH,
      voiceProfile: Object.values(AI_VOICE_PROFILES)[0],
    };
  }
}

export async function setAIRecommendationPreference(key, value) {
  try {
    if (key === 'personalityStyle') {
      await setAIPersonalityStyle(value);
      return;
    }
    if (key === 'voiceProfile') {
      await setAIVoiceProfile(value);
      return;
    }
    if (!AI_WELCOME_PREF_KEYS[key]) return;
    await AsyncStorage.setItem(AI_WELCOME_PREF_KEYS[key], String(value));
  } catch {
    // ignore
  }
}

export async function hasAIWelcomeBeenShownToday(user) {
  try {
    const key = getAIWelcomeShownKey(user);
    const value = await AsyncStorage.getItem(key);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markAIWelcomeShownToday(user) {
  try {
    const key = getAIWelcomeShownKey(user);
    await AsyncStorage.setItem(key, 'true');
  } catch {
    // ignore
  }
}

export async function getAIWelcomeSuggestions(user, leads = [], zipActivity = [], recommendation = null) {
  try {
    const personalityStyle = await getAIPersonalityStyle();
    // Check cache first
    const cached = await AsyncStorage.getItem(AI_WELCOME_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed.userId === getAIWelcomeUserKey(user) &&
        parsed.personalityStyle === personalityStyle &&
        Date.now() - parsed.generatedAt < CACHE_TTL_MS
      ) {
        return recommendation ? { ...parsed.data, recommendation } : parsed.data;
      }
    }

    const fresh = await fetchAISuggestions(user, leads, zipActivity, recommendation, personalityStyle);
    const payload = fresh ? { ...fresh, recommendation } : (recommendation ? { greeting: '', insight: '', suggestions: [], recommendation } : null);
    if (payload) {
      await AsyncStorage.setItem(AI_WELCOME_CACHE_KEY, JSON.stringify({
        userId: getAIWelcomeUserKey(user),
        personalityStyle,
        generatedAt: Date.now(),
        data: payload,
      }));
    }
    return payload;
  } catch {
    return recommendation ? { greeting: '', insight: '', suggestions: [], recommendation } : null;
  }
}

export async function clearAIWelcomeCache() {
  await AsyncStorage.removeItem(AI_WELCOME_CACHE_KEY);
}

async function fetchAISuggestions(user, leads, zipActivity, recommendation = null, personalityStyle = AI_PERSONALITY_STYLES.FRIENDLY_COACH) {
  try {
    const now = new Date();
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const hour = now.getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

    // Build context summary
    const statusCounts = leads.reduce((acc, l) => {
      acc[l.status || 'Unknown'] = (acc[l.status || 'Unknown'] || 0) + 1;
      return acc;
    }, {});

    const recentLeads = leads.filter(l => {
      const ts = l.savedAt || l.capturedAt || '';
      if (!ts) return false;
      return Date.now() - new Date(ts).getTime() < 7 * 24 * 60 * 60 * 1000;
    });

    const needsFollowUp = leads.filter(l =>
      ['Contacted', 'In Progress'].includes(l.status) &&
      (!l.lastOutreachAt || Date.now() - new Date(l.lastOutreachAt).getTime() > 2 * 24 * 60 * 60 * 1000)
    );

    const coldZips = zipActivity.filter(z => (z.dailyAvg || 0) < 3 && z.zip);
    const hotZips = zipActivity.filter(z => (z.dailyAvg || 0) >= 10 && z.zip);

    const recommendationContext = recommendation?.recommendedZip
      ? `Recommended area: ${recommendation.recommendedZip.zip}. Reason: ${recommendation.recommendedZip.reason || 'It has high activity and open prospects.'}`
      : 'No specific area recommendation is available right now. Suggest they search nearby or work their territory.';

    const repFirstName = user.firstName || user.repName?.split(' ')?.[0] || 'there';
    const repDisplayName = user.repName || `Rep`;

    const context = `
Rep: ${repDisplayName}, Branch ${user.branchNum}, Territory: ${user.territory || 'not set'}
First name: ${repFirstName}
Day: ${dayOfWeek} ${timeOfDay}
Total leads in queue: ${leads.length}
Status breakdown: ${JSON.stringify(statusCounts)}
Captured this week: ${recentLeads.length}
Needs follow-up (2+ days since last outreach): ${needsFollowUp.length}
Territory ZIPs on target (10+/day): ${hotZips.map(z => z.zip).join(', ') || 'none'}
Territory ZIPs that need attention (<3/day): ${coldZips.slice(0, 5).map(z => z.zip).join(', ') || 'none'}
${recommendationContext}
`.trim();

    let styleInstruction = '';
    if (personalityStyle === AI_PERSONALITY_STYLES.SARCASTIC) {
      styleInstruction = 'Use a Sarcastic / Ornery style. Use dry humor and a playful attitude while still being helpful. You may joke about the app, maps, spreadsheets, goals, exports, and prospecting. Do NOT insult the user personally. Do NOT insult customers or prospects. Do NOT use offensive, cruel, or inappropriate language.';
    } else if (personalityStyle === AI_PERSONALITY_STYLES.PROFESSIONAL) {
      styleInstruction = 'Use a Professional, business-like tone. Concise and direct.';
    } else if (personalityStyle === AI_PERSONALITY_STYLES.FRIENDLY_COACH) {
      styleInstruction = 'Use a Friendly Coach style. Warm, supportive, and encouraging.';
    } else if (personalityStyle === AI_PERSONALITY_STYLES.MOTIVATOR) {
      styleInstruction = 'Use a high-energy Motivator style. Focus on crushing goals and high activity.';
    } else if (personalityStyle === AI_PERSONALITY_STYLES.MINIMAL) {
      styleInstruction = 'Use a Minimal style. Very brief, almost telegram-like. Just the facts.';
    } else if (personalityStyle === AI_PERSONALITY_STYLES.PREMIUM_EXECUTIVE) {
      styleInstruction = 'Use a Premium Executive style. Sophisticated, high-level, and polished.';
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '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',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are an AI sales coach inside the LeadLens prospecting app. Based on this rep's current data, give a brief welcome message and 2-3 specific action suggestions for today.

${styleInstruction}

${context}

Return ONLY raw JSON in this exact shape, no markdown:
{
  "greeting": "short personalized greeting (1 sentence, use their first name if possible)",
  "insight": "one key observation about their pipeline or activity (1 sentence)",
  "suggestions": [
    { "icon": "emoji", "text": "specific actionable suggestion" },
    { "icon": "emoji", "text": "specific actionable suggestion" }
  ],
  "spoken_script": "A version of the greeting and insight optimized for being spoken by text-to-speech. Keep it conversational."
}

Use the rep's first name when generating the greeting if it is available.
Keep it concise and practical.`,
        }],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text = data.content?.map(b => b.text || '').join('') || '';
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}
