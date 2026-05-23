/**
 * Multi-Business Detection Service
 * Detects and enriches multiple businesses from a single photo
 * Powers LeadLock camera to capture entire shopping centers/strips
 */

import { enrichProspectProfile } from './dataEnrichmentOrchestrator';
import { extractLocationFromBusinessCard } from './addressGeocoder';
import { extractProspectAI } from '../services/extractProspectAI';

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
 * Use Claude Vision to detect businesses in photo
 * @private
 */
async function detectBusinessesWithVision(base64Image, context) {
  try {
    const result = await extractProspectAI({
      imageBase64: base64Image,
      mimeType: 'image/jpeg',
      mode: 'multi-business',
      context: context ? JSON.stringify(context) : ''
    });

    if (!result) throw new Error('No result returned from multi-business detection');

    return {
      success: true,
      businesses: result.businesses || [],
      totalDetected: result.totalDetected || 0,
      analysisNotes: result.analysisNotes || '',
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Vision detection error:', error);
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
  try {
    // Geocode the address
    let location = null;
    if (business.address) {
      const fullAddress = `${business.address}, ${context.city || 'Houston'}, TX`;
      location = await extractLocationFromBusinessCard({
        address: fullAddress,
      }).catch(() => null);
    }

    // If no geocoding, use context coordinates
    const latitude = location?.latitude || context.latitude;
    const longitude = location?.longitude || context.longitude;

    // Enrich with prospect intelligence
    let intelligence = null;
    if (business.name && latitude && longitude) {
      intelligence = await enrichProspectProfile({
        businessName: business.name,
        address: business.address || fullAddress,
        city: context.city || 'Houston',
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
        latitude: context.latitude,
        longitude: context.longitude,
        verified: false,
      },

      // Intelligence data
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
      location: { latitude: context.latitude, longitude: context.longitude },
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
  if (!detectionResult.success) return [];

  return detectionResult.businesses.map(business => ({
    id: `${business.detection.name}-${Date.now()}`,
    name: business.detection.name || 'Unknown Business',
    address: business.detection.address,
    businessType: business.detection.businessType,
    riskScore: business.riskScore,
    riskLevel: business.riskLevel,
    badges: generateBusinessBadges(business),
    pestIndicators: business.detection.pestIndicators,
    confidence: business.detection.confidence,
    position: business.detection.position,
    selected: business.selected,
    fullData: business,
  }));
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
export function convertSelectedBusinessesToProspects(selectedBusinesses) {
  if (!Array.isArray(selectedBusinesses)) return [];

  return selectedBusinesses
    .filter(b => b.selected)
    .map(business => ({
      id: `leadlock_${business.id}_${Date.now()}`,
      type: 'LEADLOCK_PHOTO_CAPTURE',
      
      // Core data
      businessName: business.name,
      address: business.address,
      businessType: business.businessType,
      latitude: business.fullData.location.latitude,
      longitude: business.fullData.location.longitude,
      
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
      capturedAt: new Date().toISOString(),
      
      // Raw detection data
      rawDetection: business.fullData.detection,
    }));
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
