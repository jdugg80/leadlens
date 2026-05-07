import { supabase } from '../lib/supabase';

/**
 * Ported enrichment logic for the LeadLens Web Management Portal.
 */

/**
 * Simulates Social Enrichment.
 * In a real web app, direct fetch(website) usually fails due to CORS.
 * This should ideally call a backend proxy.
 */
export async function enrichSocialData(website) {
  if (!website) return null;

  // Mocking extracted links for the UI demonstration
  // In production, this would call a Supabase Edge Function or similar backend proxy
  return {
    facebook_url: `https://facebook.com/${website.split('.')[1] || 'business'}`,
    instagram_url: `https://instagram.com/${website.split('.')[1] || 'business'}`,
    social_confidence: 'possible',
    social_source: 'Web Analysis (Simulated)'
  };
}

/**
 * Ported ContactSignal logic (Mocked for Web MVP)
 */
export async function enrichContactSignal(name, address) {
  const normalizedName = (name || '').toLowerCase();

  const contacts = [];

  if (normalizedName.includes('grill') || normalizedName.includes('bar')) {
    contacts.push({
      fullName: 'Maria Lopez',
      firstName: 'Maria',
      lastName: 'Lopez',
      role: 'License Holder',
      source: 'TABC (Mock)',
      confidence: 'strong'
    });
  }

  contacts.push({
    fullName: 'Corporate Secretary',
    firstName: 'Corporate',
    lastName: 'Secretary',
    role: 'Registered Agent',
    source: 'Secretary of State (Mock)',
    confidence: 'possible'
  });

  return {
    contact_signal: contacts.length > 0,
    contact_signal_confidence: contacts[0]?.confidence || 'weak',
    contacts: contacts
  };
}

/**
 * Ported LensSignal lookup using Supabase PostGIS
 */
export async function fetchLensSignalsNearby(lat, lng, radiusMiles = 5) {
  if (!lat || !lng) return [];

  const { data, error } = await supabase.rpc('get_lenssignal_nearby', {
    p_latitude: lat,
    p_longitude: lng,
    p_radius_miles: radiusMiles
  });

  if (error) {
    console.error('[LensSignal] Fetch failed:', error);
    return [];
  }

  return data || [];
}
