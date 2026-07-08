/**
 * Multi-Business Detection Service
 * Detects and enriches multiple businesses from a single photo
 * Powers LeadLock camera to capture entire shopping centers/strips
 */

import { enrichProspectProfile } from './dataEnrichmentOrchestrator';
import { extractLocationFromBusinessCard } from './addressGeocoder';
import { enrichBusinessWithPublicSources } from './enrichmentNormalizer';
import { extractPhoneCandidatesFromText, mergePhoneCandidates, selectBestPhone } from './phoneExtraction';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

/**
 * Analyze photo for multiple businesses/storefronts
 * Uses Claude vision to identify businesses in the image
 * @param {string} base64Image - Base64 encoded image from camera
 * @param {object} context - { latitude, longitude, city, county }
 * @returns {promise} Array of detected businesses with enrichment
 */
export async function detectMultipleBusinessesInPhoto(base64Image, context = {}) {
  if (!base64Image) {
    return { success: false, error: 'No image provided', businesses: [] };
  }

  try {
    // STEP 1: Use Claude Vision to detect businesses in photo
    const detections = await detectBusinessesWithVision(base64Image, context);

    if (!detections.success || detections.businesses.length === 0) {
      return {
        success: false,
        error: 'No businesses detected in photo',
        businesses: [],
        context,
      };
    }

    // STEP 2: Parallel enrich all detected businesses
    const enrichedBusinesses = await Promise.all(
      detections.businesses.map(business => enrichBusinessDetection(business, context))
    );

    return {
      success: true,
      businessCount: enrichedBusinesses.length,
      businesses: enrichedBusinesses,
      context,
      detectedAt: new Date().toISOString(),
      imageAnalyzedAt: detections.analyzedAt,
    };
  } catch (error) {
    console.error('Multi-business detection error:', error);
    return {
      success: false,
      error: error.message,
      businesses: [],
      context,
    };
  }
}

/**
 * Use Claude Vision directly to detect all businesses in photo
 * @private
 */
async function detectBusinessesWithVision(base64Image, context) {
  // Guard against null context — GPS may not be available
  const safeContext = context || {};
  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('EXPO_PUBLIC_ANTHROPIC_API_KEY is not set');
    }

    const systemPrompt = `You are a business intelligence system analyzing photos of commercial areas for pest control sales prospecting.

Your job is to identify ALL visible businesses and storefronts in the photo.

Respond ONLY with valid JSON in this exact format — no markdown, no explanation, nothing else:
{
  "businesses": [
    {
      "name": "Business name from signage",
      "signage": "Exact text visible on sign",
      "address": "Street address if visible, otherwise null",
      "businessType": "restaurant|retail|office|grocery|hotel|warehouse|medical|other",
      "position": "left|center|right|background",
      "confidence": 0.95,
      "pestIndicators": ["dumpsters visible", "outdoor food prep", "standing water", "delivery activity"],
      "notes": "any relevant observations for pest control prospecting"
    }
  ],
  "totalDetected": 2,
  "analysisNotes": "brief scene description"
}

If no businesses are clearly identifiable, return:
{"businesses": [], "totalDetected": 0, "analysisNotes": "reason no businesses detected"}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Analyze this photo taken near ${safeContext.city || 'Houston'}, ${safeContext.county ? safeContext.county + ' County,' : ''} TX. Identify every visible business and storefront. Focus on signage, storefronts, and any commercial activity. This is for pest control sales prospecting — note any food service, waste areas, or conditions that indicate pest risk.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    console.log('[LeadLock] Claude raw response:', rawText.slice(0, 200));

    // Strip any accidental markdown fences before parsing
    const clean = rawText.replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error('[LeadLock] JSON parse failed:', parseErr, 'raw:', rawText);
      throw new Error('Claude returned non-JSON response');
    }

    const businesses = parsed.businesses || [];
    console.log(`[LeadLock] Detected ${businesses.length} businesses`);

    return {
      success: businesses.length > 0,
      businesses,
      totalDetected: parsed.totalDetected || businesses.length,
      analysisNotes: parsed.analysisNotes || '',
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[LeadLock] Vision detection error:', error);
    return {
      success: false,
      error: error.message,
      businesses: [],
      analyzedAt: new Date().toISOString(),
    };
  }
}

/**
 * Enrich a single detected business with all data sources
 * @private
 */
async function enrichBusinessDetection(business, context) {
  const safeContext = context || {};
  try {
    const fullAddress = business.address
      ? `${business.address}, ${safeContext.city || 'Houston'}, TX`
      : `${safeContext.city || 'Houston'}, TX`;

    // Geocode the address
    let location = null;
    if (business.address) {
      location = await extractLocationFromBusinessCard({
        address: fullAddress,
      }).catch(() => null);
    }

    // If no geocoding, use context coordinates
    const latitude = location?.latitude || safeContext.latitude;
    const longitude = location?.longitude || safeContext.longitude;

    // STEP 1: Enrich with Google Places + Comptroller + POC (PUBLIC SOURCES)
    // This is the PRIMARY enrichment source for LeadLock
    let publicSources = null;
    if (business.name && (latitude || safeContext.city)) {
      const enrichmentContext = {
        photoZip: safeContext.zip || null,
        locationSource: 'photo_detection',
        locationConfidence: business.confidence || 0.8,
      };

      console.log('[LeadLock Detection] Enriching business:', {
        businessName: business.name,
        photoZip: enrichmentContext.photoZip,
        city: safeContext.city || 'Houston',
        latitude,
        longitude,
      });

      publicSources = await enrichBusinessWithPublicSources({
        businessName: business.name,
        address: business.address || fullAddress,
        city: safeContext.city || 'Houston',
        state: 'TX',
        latitude,
        longitude,
      }, enrichmentContext).catch((err) => {
        console.warn('[LeadLock Detection] Public sources enrichment failed:', err.message);
        return null;
      });

      console.log('[LeadLock Detection] Public enrichment result:', publicSources ? {
        businessName: publicSources.businessName,
        phone: publicSources.phone || null,
        website: publicSources.website || null,
        address: publicSources.formatted_address || publicSources.address || null,
        zip: publicSources.zip || null,
        enrichment_confidence: publicSources.enrichment_confidence,
        enrichment_confidence_score: publicSources.enrichment_confidence_score,
      } : null);
    } else {
      console.warn('[LeadLock Detection] Skipping public enrichment: missing business name or location', {
        businessName: business.name,
        latitude,
        city: safeContext.city,
      });
    }

    // STEP 2: Enrich with prospect intelligence (health violations, permits, property data)
    let intelligence = null;
    if (business.name && latitude && longitude) {
      intelligence = await enrichProspectProfile({
        businessName: business.name,
        address: business.address || fullAddress,
        city: safeContext.city || 'Houston',
        latitude,
        longitude,
      }).catch(() => null);
    }

    // Build risk score
    let riskScore = 50;

    // Add risk from pest indicators
    if (business.pestIndicators && business.pestIndicators.length > 0) {
      riskScore += business.pestIndicators.length * 5;
    }

    // Add risk from business type
    const riskByType = {
      restaurant: 30,
      'food service': 30,
      grocery: 25,
      hotel: 20,
      office: 10,
      retail: 15,
      warehouse: 25,
      medical: 20,
    };

    const typeKey = (business.businessType || '').toLowerCase();
    for (const [type, risk] of Object.entries(riskByType)) {
      if (typeKey.includes(type)) {
        riskScore += risk;
        break;
      }
    }

    // Add intelligence risk
    if (intelligence?.riskScores?.composite) {
      riskScore = (riskScore + intelligence.riskScores.composite) / 2;
    }

    return {
      // Detection data
      detection: {
        name: business.name,
        signage: business.signage,
        address: business.address,
        businessType: business.businessType,
        position: business.position,
        confidence: business.confidence,
        pestIndicators: business.pestIndicators || [],
        detectionNotes: business.notes,
      },

      // Location data
      location: location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        formatted: location.formatted,
        verified: true,
      } : {
        latitude: safeContext.latitude,
        longitude: safeContext.longitude,
        verified: false,
      },

      // Public sources enrichment (Google Places, Comptroller, POC)
      publicSources: publicSources || {},

      // Intelligence data (health violations, permits, property)
      intelligence: intelligence ? {
        riskScore: intelligence.riskScores?.composite,
        healthViolations: intelligence.enrichmentData?.healthViolations?.count || 0,
        recentPermits: intelligence.enrichmentData?.buildingActivity?.count || 0,
        recommendations: intelligence.recommendations,
      } : null,

      // Calculated risk
      riskScore: Math.round(Math.min(riskScore, 100)),
      riskLevel: calculateRiskLevel(riskScore),

      // Status
      selectable: true,
      selected: false,
    };
  } catch (error) {
    console.error('Business enrichment error:', error);
    return {
      detection: business,
      location: { latitude: safeContext.latitude, longitude: safeContext.longitude },
      riskScore: 50,
      riskLevel: 'UNKNOWN',
      selectable: true,
      selected: false,
      enrichmentError: error.message,
    };
  }
}

/**
 * Calculate risk level from score
 * @private
 */
function calculateRiskLevel(score) {
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

/**
 * Format multi-business results for queue display
 * @param {object} detectionResult - From detectMultipleBusinessesInPhoto
 * @returns {array} Formatted businesses for UI
 */
export function formatMultiBusinessesForDisplay(detectionResult) {
  if (!detectionResult.success) {
    console.log('[LeadLock Display] formatMultiBusinessesForDisplay: detectionResult.success is false, returning []');
    return [];
  }

  console.log(`[LeadLock Display] Formatting ${detectionResult.businesses?.length || 0} businesses for display`);

  const formatted = detectionResult.businesses.map((business, index) => {
    // Extract contact data from public sources enrichment
    const publicSources = business.publicSources || {};
    const phone = publicSources.formatted_phone_number || 
                  publicSources.internationalPhoneNumber || 
                  publicSources.nationalPhoneNumber || 
                  publicSources.phone || '';
    
    const website = publicSources.website || 
                    publicSources.websiteUri || 
                    publicSources.url || '';
    
    const address = publicSources.formatted_address ||
                    publicSources.address ||
                    business.detection.address || '';

    return {
      id: `${business.detection.name}-${Date.now()}-${index}`,
      name: business.detection.name || 'Unknown Business',
      address: address,
      businessType: business.detection.businessType,
      phone: phone,
      website: website,
      riskScore: business.riskScore,
      riskLevel: business.riskLevel,
      badges: generateBusinessBadges(business),
      pestIndicators: business.detection.pestIndicators,
      confidence: business.detection.confidence,
      position: business.detection.position,
      selected: business.selected,
      fullData: business,
    };
  });

  console.log(`[LeadLock Display] Formatted ${formatted.length} businesses. Sample:`, formatted.slice(0, 2).map(b => ({
    name: b.name,
    address: b.address,
    phone: b.phone,
    website: b.website,
  })));
  return formatted;
}

/**
 * Generate display badges for business
 * @private
 */
function generateBusinessBadges(business) {
  const badges = [];

  // Risk badge
  badges.push({
    label: `${business.riskLevel}`,
    value: `${business.riskScore}/100`,
    color: business.riskLevel === 'CRITICAL' ? '#FF3B5C' 
           : business.riskLevel === 'HIGH' ? '#FF6B6B'
           : business.riskLevel === 'MEDIUM' ? '#FFA94D'
           : '#51CF66',
  });

  // Health violations
  if (business.intelligence?.healthViolations > 0) {
    badges.push({
      label: 'Violations',
      value: business.intelligence.healthViolations,
      color: '#FF6B6B',
    });
  }

  // Permits
  if (business.intelligence?.recentPermits > 0) {
    badges.push({
      label: 'Permits',
      value: business.intelligence.recentPermits,
      color: '#00C9FF',
    });
  }

  // Pest indicators
  if (business.detection.pestIndicators.length > 0) {
    badges.push({
      label: '🐀 Risk',
      value: business.detection.pestIndicators.length,
      color: '#CC1040',
    });
  }

  return badges;
}

/**
 * Convert selected businesses to queue prospects
 * @param {array} selectedBusinesses - From formatMultiBusinessesForDisplay with selected: true
 * @returns {array} Prospect objects ready for queue
 */
export function convertSelectedBusinessesToProspects(selectedBusinesses, resolvedLocation = null) {
  if (!Array.isArray(selectedBusinesses)) {
    console.log('[LeadLock Prospects] convertSelectedBusinessesToProspects: input not an array, returning []');
    return [];
  }

  const selected = selectedBusinesses.filter(b => b.selected);
  console.log(`[LeadLock Prospects] Converting ${selected.length} selected businesses to prospects. resolvedLocation:`, resolvedLocation);

  if (selected.length === 0) {
    console.warn('[LeadLock Prospects] No businesses selected for conversion');
  }

  const prospects = selected.map(business => {
      const publicSources = business.fullData?.publicSources || {};
      
      return {
        id: `leadlock_${business.id}_${Date.now()}`,
        type: 'LEADLOCK_PHOTO_CAPTURE',
        
        // Core data
        businessName: business.name,
        address: publicSources.formatted_address || business.address,
        businessType: business.businessType,
        latitude: (resolvedLocation && resolvedLocation.latitude) || business.fullData.location.latitude,
        longitude: (resolvedLocation && resolvedLocation.longitude) || business.fullData.location.longitude,
        
        // Contact data from Google Places enrichment
        phone: publicSources.formatted_phone_number || 
               publicSources.internationalPhoneNumber || 
               publicSources.nationalPhoneNumber || 
               publicSources.phone || '',
        website: publicSources.website || 
                 publicSources.websiteUri || 
                 publicSources.url || '',
        email: publicSources.email || '',
        
        // Address components from enrichment
        streetNumber: publicSources.streetNumber || '',
        streetName: publicSources.streetName || '',
        city: publicSources.city || (resolvedLocation && resolvedLocation.city) || '',
        state: publicSources.state || 'TX',
        zip: publicSources.zip || (resolvedLocation && resolvedLocation.zip) || '',
        
        // POC candidates (from Comptroller, website, etc)
        pocCandidates: publicSources.pocCandidates || publicSources.contacts || [],
        
        // Risk data
        riskScore: business.riskScore,
        pestIndicators: business.pestIndicators,
        
        // Intelligence
        healthViolations: business.fullData.intelligence?.healthViolations || 0,
        recentPermits: business.fullData.intelligence?.recentPermits || 0,
        
        // Metadata
        captureMethod: 'LEADLOCK_PHOTO',
        detectionConfidence: business.confidence,
        detectionPosition: business.position,
        capturedAt: (resolvedLocation && resolvedLocation.capturedAt) || new Date().toISOString(),
        // Location resolution (photo-based)
        photo_zip: (resolvedLocation && resolvedLocation.zip) || null,
        location_source: (resolvedLocation && resolvedLocation.source) || 'photo_detection',
        location_confidence: (resolvedLocation && resolvedLocation.confidence) || null,
        location_warning: (resolvedLocation && resolvedLocation.warning) || null,
        gps_accuracy_meters: (resolvedLocation && resolvedLocation.gpsAccuracyMeters) || business.fullData.location?.accuracy || null,
        
        // Raw detection data
        rawDetection: business.fullData.detection,
        
        // Enrichment metadata
        enrichmentSource: 'photo_detection_multi_business',
        enrichedAt: new Date().toISOString(),
      };
    });

  console.log(`[LeadLock Prospects] Converted ${prospects.length} prospects. Sample:`, prospects.slice(0, 2).map(p => ({
    businessName: p.businessName,
    zip: p.zip,
    phone: p.phone,
    website: p.website,
    latitude: p.latitude,
    longitude: p.longitude,
  })));
  return prospects;
}

/**
 * Detect multiple business cards laid out in a single photo
 * @param {string} base64Image - Base64 encoded image
 * @param {object} context - { latitude, longitude, city }
 * @returns {promise} { success, cards[], totalDetected, analysisNotes, detectedAt }
 */
export async function detectBusinessCardsInPhoto(base64Image, context = {}) {
  if (!base64Image) {
    return { success: false, error: 'No image provided', cards: [] };
  }

  const safeContext = context || {};

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('EXPO_PUBLIC_ANTHROPIC_API_KEY is not set');
    }

    const systemPrompt = `You are a business card OCR system for a field sales app. The user has photographed one or more business cards laid on a flat surface.

Extract every business card visible in the photo. For each card return all readable contact information.

PHONE EXTRACTION RULES:
- Extract EVERY phone number visible on each card (office, direct, cell, mobile, fax)
- Recognize these common abbreviations and labels: cell, cellular, mobile, mob, m, c, direct, dir, d, phone, ph, telephone, tel, t, office, o, work, w, fax, f
- If a number is labeled with any mobile/cell/direct abbreviation, treat it as a mobile number
- The "phone" field must be the BEST number to reach a decision-maker: prefer mobile/cell/direct over office/main
- Store the primary mobile/cell/direct number in "mobile" if it is separate from the main number
- Store any additional numbers in "altPhone" and a complete list in "phoneCandidates"
- Each candidate must include the number and a type label like "mobile", "office", "fax", or "direct"

Respond ONLY with valid JSON — no markdown, no explanation:
{
  "cards": [
    {
      "name": "Full name on card or null",
      "title": "Job title or null",
      "company": "Company/business name or null",
      "phone": "Primary phone number or null",
      "mobile": "Mobile/cell number if separate or null",
      "altPhone": "Alternate phone number or null",
      "phoneCandidates": [{"number": "", "type": ""}],
      "email": "Email address or null",
      "website": "Website URL or null",
      "address": "Street address or null",
      "city": "City or null",
      "state": "State abbreviation or null",
      "zip": "ZIP code or null",
      "confidence": 0.92,
      "cardNotes": "Any other text on the card worth capturing"
    }
  ],
  "totalDetected": 1,
  "analysisNotes": "brief description of what was seen"
}

If no business cards are found return:
{"cards": [], "totalDetected": 0, "analysisNotes": "no cards detected"}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: base64Image },
              },
              {
                type: 'text',
                text: `Extract all business cards visible in this photo. Capture every readable field. This is for pest control sales prospecting near ${safeContext.city || 'Houston'}, TX.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || '';
    const clean = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      console.error('[CardScan] JSON parse failed:', e, 'raw:', rawText);
      throw new Error('Claude returned non-JSON response');
    }

    let cards = parsed.cards || [];
    console.log(`[CardScan] Detected ${cards.length} business cards`);

    cards = cards.map((card) => {
      const cardText = [card.cardNotes, card.address, card.name, card.company, card.title]
        .filter(Boolean)
        .join(' ');
      const aiCandidates = Array.isArray(card.phoneCandidates) ? card.phoneCandidates : [];
      const fallbackCandidates = extractPhoneCandidatesFromText(cardText);
      const candidates = mergePhoneCandidates(aiCandidates, fallbackCandidates);
      const mobile = candidates.find(c => c.type === 'mobile')?.number || card.mobile || '';
      const mainPhone = card.phone || '';
      const altPhone = card.altPhone || '';
      const bestPhone = mobile || mainPhone || altPhone || selectBestPhone(candidates);

      return {
        ...card,
        phone: bestPhone,
        mobile: mobile,
        altPhone: altPhone || mainPhone,
        phoneCandidates: candidates.length ? candidates : [
          mobile && { number: mobile, type: 'mobile' },
          mainPhone && { number: mainPhone, type: 'office' },
          altPhone && { number: altPhone, type: 'alternate' },
        ].filter(Boolean),
      };
    });

    return {
      success: cards.length > 0,
      cards,
      totalDetected: parsed.totalDetected || cards.length,
      analysisNotes: parsed.analysisNotes || '',
      detectedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[CardScan] Detection error:', error);
    return {
      success: false,
      error: error.message,
      cards: [],
      detectedAt: new Date().toISOString(),
    };
  }
}

/**
 * Batch process multiple photos
 * For processing a series of location photos
 * @param {array} base64Images - Array of base64 images
 * @param {object} context - Location context
 * @param {function} onProgress - Progress callback
 * @returns {promise} Array of all detected businesses
 */
export async function batchDetectMultipleBusinesses(base64Images, context, onProgress) {
  if (!Array.isArray(base64Images)) return [];

  const allBusinesses = [];

  for (let i = 0; i < base64Images.length; i++) {
    try {
      const result = await detectMultipleBusinessesInPhoto(base64Images[i], context);
      
      if (result.success) {
        allBusinesses.push(...result.businesses);
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: base64Images.length,
          businessesFound: allBusinesses.length,
        });
      }
    } catch (error) {
      console.error(`Photo ${i + 1} processing failed:`, error);
    }
  }

  return allBusinesses;
}
