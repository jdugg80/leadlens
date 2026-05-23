/**
 * Data Enrichment Orchestrator
 * Coordinates Health Dept, Building Permits, Property Records, and AI services
 * Creates comprehensive prospect intelligence profiles
 */

import { searchHealthViolations, getViolationStats } from './healthDepartmentService.js';
import { searchBuildingPermits, findNewBusinessOpenings } from './buildingPermitsService.js';
import { getPropertyRecord, searchPropertiesByCriteria } from './propertyRecordsService.js';
import { extractBusinessCardData, validateExtractedData } from './businessCardExtractor.js';
import { enrichBusinessCardWithClaude } from './businessCardEnricher.js';
import { extractLocationFromBusinessCard } from './addressGeocoder.js';

/**
 * Comprehensive prospect profile enrichment
 * Pulls data from all sources to create complete intelligence on a prospect
 * @param {object} prospect - Basic prospect data (name, address, etc.)
 * @returns {promise} Enriched prospect profile
 */
export async function enrichProspectProfile(prospect) {
  if (!prospect) return { success: false, error: 'Invalid prospect' };

  const enrichedProfile = {
    ...prospect,
    enrichmentData: {},
    riskScores: {},
    recommendations: [],
    dataQuality: {},
  };

  try {
    // Parallel fetch of all data sources
    const [healthData, permitData, propertyData] = await Promise.all([
      searchHealthViolations(prospect.businessName, prospect.city),
      searchBuildingPermits(prospect.address, 90),
      getPropertyRecord(prospect.address),
    ]);

    // Health department violations
    if (healthData.success) {
      enrichedProfile.enrichmentData.healthViolations = healthData;
      enrichedProfile.riskScores.healthRisk = 60; // Will be calculated below
    }

    // Building permits
    if (permitData.success) {
      enrichedProfile.enrichmentData.buildingActivity = permitData;
    }

    // Property records
    if (propertyData.success) {
      enrichedProfile.enrichmentData.propertyData = propertyData.property;
      enrichedProfile.riskScores.propertyRisk = propertyData.pestRiskScore;
      enrichedProfile.riskFactors = propertyData.pestRiskFactors;
    }

    // Calculate composite risk score
    enrichedProfile.riskScores.composite = calculateCompositeRiskScore(enrichedProfile);

    // Generate recommendations
    enrichedProfile.recommendations = generateProspectRecommendations(enrichedProfile);

    // Data quality metrics
    enrichedProfile.dataQuality = {
      healthDataComplete: healthData.success,
      permitDataComplete: permitData.success,
      propertyDataComplete: propertyData.success,
      overallCompleteness: calculateDataCompleteness(enrichedProfile),
    };

    enrichedProfile.success = true;
    enrichedProfile.enrichedAt = new Date().toISOString();

    return enrichedProfile;
  } catch (error) {
    console.error('Profile enrichment error:', error);
    return {
      ...enrichedProfile,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Enrich business card data with all available data sources
 * @param {string} ocrText - OCR text from business card
 * @param {string} businessName - Business name (optional)
 * @returns {promise} Complete enriched business card profile
 */
export async function enrichBusinessCard(ocrText, businessName = null) {
  try {
    // Step 1: Extract basic data from card text
    const extracted = extractBusinessCardData(ocrText);
    const validated = validateExtractedData(extracted);

    // Step 2: Enrich with Claude AI
    const enriched = await enrichBusinessCardWithClaude(extracted);

    // Step 3: Geocode address
    const location = await extractLocationFromBusinessCard(enriched);

    const profile = {
      ...enriched,
      location,
      dataProfile: {
        phones: validated.phones,
        emails: validated.emails,
        websites: validated.websites,
        social: validated.social,
        addresses: validated.addresses,
        contacts: validated.contacts,
      },
    };

    // Step 4: Fetch prospect intelligence if we have location
    if (location.success && location.latitude && location.longitude) {
      const address = location.formatted || enriched.address;
      const name = enriched.primaryContact?.name || businessName || 'Unknown';

      const prospectData = await enrichProspectProfile({
        businessName: name,
        address,
        city: 'Houston', // Can be extracted from location
        latitude: location.latitude,
        longitude: location.longitude,
      });

      profile.prospectIntelligence = prospectData;
    }

    profile.enrichmentComplete = true;
    profile.enrichedAt = new Date().toISOString();

    return profile;
  } catch (error) {
    console.error('Business card enrichment error:', error);
    return {
      success: false,
      error: error.message,
      rawCard: validated || {},
    };
  }
}

/**
 * Find high-value prospects in an area
 * @param {string} zip - Zip code to search
 * @returns {promise} Top prospects by various criteria
 */
export async function findProspectsInArea(zip) {
  try {
    // Find new business openings
    const newOpenings = await findNewBusinessOpenings('Houston', 30);

    // Find high-value properties
    const properties = await searchPropertiesByCriteria({
      minAge: 20,
      minSize: 5000,
      landUse: 'commercial',
    }, 100);

    // Enrich top properties
    const topProspects = [];

    if (newOpenings.success && newOpenings.newOpenings.length > 0) {
      for (const opening of newOpenings.newOpenings.slice(0, 10)) {
        const enriched = await enrichProspectProfile({
          businessName: opening.description,
          address: opening.address,
          city: 'Houston',
        });

        topProspects.push({
          ...enriched,
          source: 'NEW_OPENING',
          tier: opening.prospectTier,
        });
      }
    }

    return {
      success: true,
      zip,
      newOpeningsCount: newOpenings.count || 0,
      propertiesCount: properties.count || 0,
      topProspects,
      prospectCount: topProspects.length,
    };
  } catch (error) {
    console.error('Area prospect search error:', error);
    return {
      success: false,
      error: error.message,
      topProspects: [],
    };
  }
}

/**
 * Calculate composite risk score from all data sources
 * @private
 */
function calculateCompositeRiskScore(profile) {
  let score = 50;
  let dataPoints = 0;

  // Health violations weight (40%)
  if (profile.enrichmentData.healthViolations) {
    const violations = profile.enrichmentData.healthViolations;
    const violationScore = Math.min(violations.count * 5, 40);
    score += violationScore * 0.4;
    dataPoints++;
  }

  // Property risk weight (40%)
  if (profile.riskScores.propertyRisk) {
    score += profile.riskScores.propertyRisk * 0.4;
    dataPoints++;
  }

  // Building activity weight (20%)
  if (profile.enrichmentData.buildingActivity) {
    const permits = profile.enrichmentData.buildingActivity;
    if (permits.permits.some(p => p.pesSignificance?.score > 20)) {
      score += 20 * 0.2;
    }
    dataPoints++;
  }

  return Math.round(Math.min(score, 100));
}

/**
 * Generate actionable recommendations for prospect
 * @private
 */
function generateProspectRecommendations(profile) {
  const recommendations = [];

  // Health violations recommendations
  if (profile.enrichmentData.healthViolations?.violations?.length > 0) {
    const criticalViolations = profile.enrichmentData.healthViolations.violations.filter(
      v => v.severity === 'CRITICAL' || v.severity === 'CRITICAL_PEST'
    );

    if (criticalViolations.length > 0) {
      recommendations.push({
        priority: 'URGENT',
        type: 'HEALTH_VIOLATIONS',
        message: `${criticalViolations.length} critical health violation(s) - HIGH PEST RISK`,
        action: 'IMMEDIATE_OUTREACH',
        details: criticalViolations.map(v => v.description),
      });
    }
  }

  // New building activity
  if (profile.enrichmentData.buildingActivity?.permits?.length > 0) {
    const highSigPermits = profile.enrichmentData.buildingActivity.permits.filter(
      p => p.pesSignificance?.score > 25
    );

    if (highSigPermits.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        type: 'NEW_CONSTRUCTION',
        message: `Active building permits - structural vulnerabilities likely`,
        action: 'FOLLOWUP_INSPECTION',
        details: highSigPermits.map(p => p.description),
      });
    }
  }

  // Property age/condition
  if (profile.enrichmentData.propertyData?.buildingAge > 50) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'BUILDING_AGE',
      message: `Building ${profile.enrichmentData.propertyData.buildingAge} years old - maintenance risk`,
      action: 'REGULAR_MONITORING',
    });
  }

  // Size/type based
  if (profile.enrichmentData.propertyData?.squareFeet > 100000) {
    recommendations.push({
      priority: 'MEDIUM',
      type: 'FACILITY_SIZE',
      message: `Large facility (${Math.round(profile.enrichmentData.propertyData.squareFeet / 1000)}k sq ft) - comprehensive coverage needed`,
      action: 'DETAILED_ASSESSMENT',
    });
  }

  return recommendations;
}

/**
 * Calculate data completeness percentage
 * @private
 */
function calculateDataCompleteness(profile) {
  let complete = 0;
  let total = 5;

  if (profile.enrichmentData.healthViolations) complete++;
  if (profile.enrichmentData.buildingActivity) complete++;
  if (profile.enrichmentData.propertyData) complete++;
  if (profile.riskScores.composite) complete++;
  if (profile.recommendations.length > 0) complete++;

  return Math.round((complete / total) * 100);
}

/**
 * Batch enrich multiple prospects
 * @param {array} prospects - Array of prospect objects
 * @returns {promise} Array of enriched profiles
 */
export async function batchEnrichProspects(prospects) {
  if (!Array.isArray(prospects)) return [];

  // Process in batches of 3 to avoid overwhelming APIs
  const batchSize = 3;
  const results = [];

  for (let i = 0; i < prospects.length; i += batchSize) {
    const batch = prospects.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(p => enrichProspectProfile(p))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Export comprehensive prospect report
 * @param {object} enrichedProfile - Profile from enrichProspectProfile
 * @returns {object} Formatted report
 */
export function generateProspectReport(enrichedProfile) {
  return {
    businessName: enrichedProfile.businessName,
    address: enrichedProfile.address,
    riskAssessment: {
      composite: enrichedProfile.riskScores.composite,
      property: enrichedProfile.riskScores.propertyRisk,
      health: enrichedProfile.riskScores.healthRisk,
    },
    dataAvailable: enrichedProfile.dataQuality,
    keyFindings: enrichedProfile.enrichmentData,
    recommendations: enrichedProfile.recommendations,
    confidenceLevel: enrichedProfile.dataQuality.overallCompleteness,
    generatedAt: enrichedProfile.enrichedAt,
  };
}
