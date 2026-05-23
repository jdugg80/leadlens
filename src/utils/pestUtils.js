/**
 * Pest Type Utilities
 * Maps pest details to specific icons and types for enhanced signal visualization
 */

const PEST_TYPES = {
  RODENT: { icon: '🐀', label: 'Rodent Issue', keywords: ['rodent', 'mouse', 'mice', 'rat', 'rats', 'droppings', 'gnaw'] },
  ROACH: { icon: '🪳', label: 'Roach Issue', keywords: ['roach', 'cockroach', 'german', 'american'] },
  ANT: { icon: '🐜', label: 'Ant Infestation', keywords: ['ant', 'ants', 'carpenter'] },
  SPIDER: { icon: '🕷️', label: 'Spider Issue', keywords: ['spider', 'spiders', 'web'] },
  MOSQUITO: { icon: '🦟', label: 'Mosquito Issue', keywords: ['mosquito', 'mosquitoes', 'sketer'] },
  BED_BUG: { icon: '🛏️', label: 'Bed Bug Issue', keywords: ['bed bug', 'bedbug', 'bedbugs'] },
  TERMITE: { icon: '🪵', label: 'Termite Issue', keywords: ['termite', 'termites', 'subterranean'] },
  GENERAL: { icon: '🐛', label: 'Pest Issue', keywords: ['pest', 'insect', 'infestation', 'bug'] },
};

/**
 * Extract pest type from compliance_findings or pest_details
 * @param {string} pestDetails - Pest details or findings text
 * @returns {object} { icon, label, type }
 */
export function extractPestType(pestDetails) {
  if (!pestDetails) return PEST_TYPES.GENERAL;

  const detailsLower = pestDetails.toLowerCase();

  for (const [typeKey, typeData] of Object.entries(PEST_TYPES)) {
    if (typeKey === 'GENERAL') continue; // Skip general, it's the fallback
    
    for (const keyword of typeData.keywords) {
      if (detailsLower.includes(keyword)) {
        return { icon: typeData.icon, label: typeData.label, type: typeKey };
      }
    }
  }

  return PEST_TYPES.GENERAL;
}

/**
 * Format pest signal display with icon and label
 * @param {string} pestDetails - Pest details text
 * @param {string} alertLevel - Alert level (Priority Review, Monitor, etc.)
 * @returns {object} { display, icon, label }
 */
export function formatPestSignal(pestDetails, alertLevel = 'Active') {
  const pest = extractPestType(pestDetails);
  const display = `${pest.icon} ${pest.label}${alertLevel ? ` - ${alertLevel}` : ''}`;
  
  return {
    display,
    icon: pest.icon,
    label: pest.label,
    type: pest.type,
  };
}

/**
 * Get pest icon only (for map markers)
 * @param {string} pestDetails - Pest details text
 * @returns {string} Emoji icon
 */
export function getPestIcon(pestDetails) {
  return extractPestType(pestDetails).icon;
}

/**
 * Get all available pest types (for filtering/display)
 * @returns {array} Array of { icon, label, type }
 */
export function getAllPestTypes() {
  return Object.entries(PEST_TYPES)
    .filter(([key]) => key !== 'GENERAL')
    .map(([key, data]) => ({
      type: key,
      icon: data.icon,
      label: data.label,
    }));
}
