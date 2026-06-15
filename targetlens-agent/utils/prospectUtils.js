/**
 * Prospect classification and scoring utilities
 */

const { INVESTOR_PATTERNS } = require('../config');

function classifyOwnership(record) {
  const name = (record.grantee_name || '').toUpperCase();

  if (INVESTOR_PATTERNS.some(p => p.test(name))) {
    return { ownership_status: 'investor', prospect_type: 'rental' };
  }

  if (record.homestead_exemption === true) {
    return { ownership_status: 'owner_occupied', prospect_type: 'current_homeowner' };
  }

  if (record.days_since_transfer != null && record.days_since_transfer <= 120 && !record.homestead_exemption) {
    return { ownership_status: 'owner_occupied', prospect_type: 'new_homeowner' };
  }

  if (['103', '104', '105', '106', '107', '108', '109'].includes(record.use_code)) {
    return { ownership_status: 'rental', prospect_type: 'rental' };
  }

  return { ownership_status: 'unknown', prospect_type: 'current_homeowner' };
}

function scoreEfficiencyUpgrade(record) {
  let score = 50;
  const signals = { solar: false, roofing: false, hvac: false, windows: false, insulation: false };

  if (record.prospect_type === 'new_homeowner') score += 20;

  const age = new Date().getFullYear() - (record.year_built || 2000);
  if (age > 30) {
    score += 15;
    signals.hvac = true;
    signals.windows = true;
    signals.insulation = true;
  } else if (age > 15) {
    score += 8;
    signals.hvac = true;
  }

  const val = record.home_value_estimated || record.home_value_assessed || 0;
  if (val >= 200000 && val <= 800000) score += 10;
  else if (val > 800000) score += 5;
  else if (val < 150000) score -= 10;

  const sqft = record.home_sq_footage || 0;
  if (sqft > 2500) {
    score += 8;
    signals.solar = true;
    signals.roofing = true;
  } else if (sqft > 1500) {
    score += 4;
  }

  if (record.property_class === 'single_family') score += 5;

  if (record.prospect_type === 'rental') score -= 20;

  return {
    efficiency_score: Math.min(100, Math.max(0, score)),
    upgrade_signals: signals,
  };
}

function computeDaysSinceTransfer(deedDate) {
  if (!deedDate) return null;
  const now = new Date();
  const deed = new Date(deedDate);
  return Math.floor((now - deed) / (1000 * 60 * 60 * 24));
}

function computeLookbackBucket(daysSinceTransfer) {
  if (daysSinceTransfer == null) return '120d';
  if (daysSinceTransfer <= 30) return '30d';
  if (daysSinceTransfer <= 60) return '60d';
  if (daysSinceTransfer <= 90) return '90d';
  return '120d';
}

module.exports = {
  classifyOwnership,
  scoreEfficiencyUpgrade,
  computeDaysSinceTransfer,
  computeLookbackBucket,
};
