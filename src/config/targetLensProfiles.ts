/**
 * TargetLens Profile Configuration - Phase 1
 *
 * Defines specialized profiles for new non-pest industries.
 * CRITICAL: This configuration is independent of existing Pest Control logic.
 */

export type TargetLensCategory = 'hvac' | 'security' | 'solar' | 'real_estate' | 'pest_control';

export type TargetLensSearchMode = 'Strict' | 'Expanded' | 'Referral';

export interface TargetLensProfile {
  id: string;
  category: string;
  label: string;
  division: 'Commercial' | 'Residential' | 'Mixed';
  defaultMode: 'commercial' | 'residential';
  description: string;
  primaryProspectTypes: string[];
  secondaryProspectTypes: string[];
  referralProspectTypes: string[];
  excludedByDefault: boolean;
  searchKeywords: string[];
  opportunitySignals: {
    label: string;
    keywords: string[];
    priority: 'low' | 'medium' | 'high' | 'critical';
  }[];
  suggestedFilters: Record<string, any>;
  scoringWeights: {
    nameMatch: number;
    keywordMatch: number;
    signalMatch: number;
    proximityMatch: number;
  };
  minimumScore: number;
}

export const TARGET_LENS_PROFILES: TargetLensProfile[] = [
  // --- HVAC / MECHANICAL ---
  {
    id: 'hvac_commercial',
    category: 'HVAC / Mechanical',
    label: 'Commercial HVAC',
    division: 'Commercial',
    defaultMode: 'commercial',
    description: 'Targeting large-scale mechanical systems, chillers, and industrial HVAC.',
    primaryProspectTypes: ['Warehouse', 'Manufacturing', 'Hospital', 'Hotel'],
    secondaryProspectTypes: ['Office Building', 'Retail Center'],
    referralProspectTypes: ['Property Manager', 'Mechanical Engineer'],
    excludedByDefault: false,
    searchKeywords: ['hvac', 'mechanical contractor', 'chillers', 'boilers', 'industrial ac'],
    opportunitySignals: [
      { label: 'New Permit', keywords: ['mechanical permit', 'hvac install'], priority: 'high' },
      { label: 'Aging Infrastructure', keywords: ['rust', 'old unit', 'worn'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Commercial' },
    scoringWeights: { nameMatch: 0.4, keywordMatch: 0.3, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 60
  },
  {
    id: 'hvac_residential',
    category: 'HVAC / Mechanical',
    label: 'Residential HVAC',
    division: 'Residential',
    defaultMode: 'residential',
    description: 'Targeting home AC repair, replacement, and maintenance.',
    primaryProspectTypes: ['Single Family Home', 'Townhome'],
    secondaryProspectTypes: ['Apartment Complex'],
    referralProspectTypes: ['Real Estate Agent', 'Home Inspector'],
    excludedByDefault: false,
    searchKeywords: ['ac repair', 'home heating', 'residential hvac', 'air conditioning service'],
    opportunitySignals: [
      { label: 'Recent Sale', keywords: ['sold', 'new owner'], priority: 'medium' },
      { label: 'Weather Event', keywords: ['hail', 'freeze', 'heatwave'], priority: 'high' }
    ],
    suggestedFilters: { propertyType: 'Residential' },
    scoringWeights: { nameMatch: 0.3, keywordMatch: 0.4, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 50
  },

  // --- SECURITY / ACCESS CONTROL ---
  {
    id: 'security_commercial',
    category: 'Security / Access Control',
    label: 'Commercial Security',
    division: 'Commercial',
    defaultMode: 'commercial',
    description: 'Enterprise-grade surveillance, access control, and monitoring.',
    primaryProspectTypes: ['Office Park', 'Data Center', 'Logistics Center'],
    secondaryProspectTypes: ['Retail Store', 'Bank'],
    referralProspectTypes: ['IT Consultant', 'Facility Manager'],
    excludedByDefault: false,
    searchKeywords: ['security systems', 'cctv', 'access control', 'alarm monitoring'],
    opportunitySignals: [
      { label: 'Vulnerability', keywords: ['broken fence', 'poor lighting'], priority: 'high' },
      { label: 'Expansion', keywords: ['new location', 'hiring'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Commercial' },
    scoringWeights: { nameMatch: 0.4, keywordMatch: 0.3, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 60
  },
  {
    id: 'security_residential',
    category: 'Security / Access Control',
    label: 'Residential Security',
    division: 'Residential',
    defaultMode: 'residential',
    description: 'Smart home security and residential monitoring solutions.',
    primaryProspectTypes: ['High-end Residential', 'Gated Communities'],
    secondaryProspectTypes: ['Rental Property'],
    referralProspectTypes: ['Home Builder', 'Insurance Agent'],
    excludedByDefault: false,
    searchKeywords: ['home alarm', 'security cameras', 'smart locks', 'residential security'],
    opportunitySignals: [
      { label: 'Neighborhood Alert', keywords: ['crime report', 'break-in'], priority: 'high' },
      { label: 'New Construction', keywords: ['under construction', 'moving in'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Residential' },
    scoringWeights: { nameMatch: 0.3, keywordMatch: 0.4, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 50
  },

  // --- SOLAR & ENERGY ---
  {
    id: 'solar_commercial',
    category: 'Solar & Energy',
    label: 'Commercial Solar',
    division: 'Commercial',
    defaultMode: 'commercial',
    description: 'Commercial roof-mount and ground-mount solar installations.',
    primaryProspectTypes: ['Industrial Warehouse', 'Cold Storage', 'Retail Mall'],
    secondaryProspectTypes: ['Farm', 'School'],
    referralProspectTypes: ['Energy Consultant', 'CFO'],
    excludedByDefault: false,
    searchKeywords: ['commercial solar', 'renewable energy', 'photovoltaic', 'energy storage'],
    opportunitySignals: [
      { label: 'High Energy Usage', keywords: ['refrigeration', 'heavy machinery'], priority: 'high' },
      { label: 'Sustainability Goal', keywords: ['green initiative', 'esg'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Commercial' },
    scoringWeights: { nameMatch: 0.2, keywordMatch: 0.5, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 65
  },
  {
    id: 'solar_residential',
    category: 'Solar & Energy',
    label: 'Residential Solar',
    division: 'Residential',
    defaultMode: 'residential',
    description: 'Residential rooftop solar and battery backup systems.',
    primaryProspectTypes: ['Homeowner'],
    secondaryProspectTypes: ['HOA'],
    referralProspectTypes: ['Roofer', 'Electrician'],
    excludedByDefault: false,
    searchKeywords: ['home solar', 'solar panels', 'tesla powerwall', 'residential renewable'],
    opportunitySignals: [
      { label: 'High Bill', keywords: ['utility rate hike', 'expensive electricity'], priority: 'high' },
      { label: 'EV Owner', keywords: ['tesla', 'electric vehicle charger'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Residential' },
    scoringWeights: { nameMatch: 0.2, keywordMatch: 0.5, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 55
  },
  {
    id: 'solar_maintenance',
    category: 'Solar & Energy',
    label: 'Solar Maintenance / Cleaning',
    division: 'Mixed',
    defaultMode: 'commercial',
    description: 'Panel cleaning, system diagnostics, and repair services.',
    primaryProspectTypes: ['Existing Solar Site', 'Solar Farm'],
    secondaryProspectTypes: ['Commercial Rooftop Solar'],
    referralProspectTypes: ['Solar Installer', 'O&M Manager'],
    excludedByDefault: false,
    searchKeywords: ['solar cleaning', 'panel repair', 'solar maintenance'],
    opportunitySignals: [
      { label: 'System Downtime', keywords: ['offline', 'low production'], priority: 'critical' },
      { label: 'Dirty Panels', keywords: ['dust', 'debris', 'pigeons'], priority: 'medium' }
    ],
    suggestedFilters: { hasSolar: true },
    scoringWeights: { nameMatch: 0.3, keywordMatch: 0.3, signalMatch: 0.3, proximityMatch: 0.1 },
    minimumScore: 60
  },

  // --- REAL ESTATE / PROPERTY SERVICES ---
  {
    id: 're_agent',
    category: 'Real Estate / Property Services',
    label: 'Realtor / Agent Prospecting',
    division: 'Mixed',
    defaultMode: 'residential',
    description: 'Tools for agents to find listings and manage client leads.',
    primaryProspectTypes: ['Homeowner', 'FSBO'],
    secondaryProspectTypes: ['Expired Listing'],
    referralProspectTypes: ['Lender', 'Title Company'],
    excludedByDefault: false,
    searchKeywords: ['real estate agent', 'broker', 'listing specialist'],
    opportunitySignals: [
      { label: 'Life Event', keywords: ['marriage', 'new baby', 'job change'], priority: 'medium' },
      { label: 'Market Hotness', keywords: ['low inventory', 'high demand'], priority: 'high' }
    ],
    suggestedFilters: {},
    scoringWeights: { nameMatch: 0.3, keywordMatch: 0.3, signalMatch: 0.3, proximityMatch: 0.1 },
    minimumScore: 55
  },
  {
    id: 're_property_mgmt',
    category: 'Real Estate / Property Services',
    label: 'Property Management Services',
    division: 'Commercial',
    defaultMode: 'commercial',
    description: 'Managing commercial and multi-family residential properties.',
    primaryProspectTypes: ['Apartment Complex', 'Office Building', 'Shopping Center'],
    secondaryProspectTypes: ['HOA Management'],
    referralProspectTypes: ['Asset Manager', 'Investor'],
    excludedByDefault: false,
    searchKeywords: ['property management', 'leasing agent', 'facility management'],
    opportunitySignals: [
      { label: 'High Vacancy', keywords: ['for lease', 'available space'], priority: 'high' },
      { label: 'Poor Maintenance', keywords: ['overgrown', 'trash', 'deferred maintenance'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Commercial' },
    scoringWeights: { nameMatch: 0.4, keywordMatch: 0.3, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 60
  },
  {
    id: 're_construction',
    category: 'Real Estate / Property Services',
    label: 'Builder / Construction Services',
    division: 'Mixed',
    defaultMode: 'commercial',
    description: 'General contracting, new construction, and renovation services.',
    primaryProspectTypes: ['Vacant Land', 'Development Site', 'Fixer Upper'],
    secondaryProspectTypes: ['Commercial Build-out'],
    referralProspectTypes: ['Architect', 'Civil Engineer'],
    excludedByDefault: false,
    searchKeywords: ['home builder', 'general contractor', 'construction company'],
    opportunitySignals: [
      { label: 'Land Clearing', keywords: ['demo', 'clearing', 'fenced off'], priority: 'high' },
      { label: 'Permit Filed', keywords: ['building permit', 'platting'], priority: 'high' }
    ],
    suggestedFilters: {},
    scoringWeights: { nameMatch: 0.3, keywordMatch: 0.4, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 60
  },
  {
    id: 're_inspection',
    category: 'Real Estate / Property Services',
    label: 'Home Inspection Services',
    division: 'Residential',
    defaultMode: 'residential',
    description: 'Pre-sale and post-sale residential inspections.',
    primaryProspectTypes: ['Homes Under Contract', 'New Listing'],
    secondaryProspectTypes: ['Commercial Inspection'],
    referralProspectTypes: ['Buyer Agent', 'Mortgage Broker'],
    excludedByDefault: false,
    searchKeywords: ['home inspector', 'real estate inspection', 'mold inspection'],
    opportunitySignals: [
      { label: 'Under Contract', keywords: ['pending', 'contingent'], priority: 'critical' },
      { label: 'One-Year Warranty', keywords: ['new build', '11-month'], priority: 'medium' }
    ],
    suggestedFilters: { propertyType: 'Residential' },
    scoringWeights: { nameMatch: 0.2, keywordMatch: 0.5, signalMatch: 0.2, proximityMatch: 0.1 },
    minimumScore: 50
  },

  // --- PEST CONTROL (Legacy Integration) ---
  {
    id: 'pest_control_legacy',
    category: 'Pest Control',
    label: 'Standard Pest Control',
    division: 'Mixed',
    defaultMode: 'residential',
    description: 'Existing pest control discovery and compliance logic.',
    primaryProspectTypes: ['Commercial', 'Residential'],
    secondaryProspectTypes: [],
    referralProspectTypes: [],
    excludedByDefault: false,
    searchKeywords: ['pest control', 'exterminator'],
    opportunitySignals: [],
    suggestedFilters: {},
    scoringWeights: { nameMatch: 0.5, keywordMatch: 0.5, signalMatch: 0, proximityMatch: 0 },
    minimumScore: 50
  }
];

// --- HELPER FUNCTIONS ---

export function getTargetLensProfiles(): TargetLensProfile[] {
  return TARGET_LENS_PROFILES;
}

export function getTargetLensProfileById(profileId: string): TargetLensProfile | undefined {
  return TARGET_LENS_PROFILES.find(p => p.id === profileId);
}

export function getTargetLensProfilesByCategory(category: string): TargetLensProfile[] {
  return TARGET_LENS_PROFILES.filter(p => p.category === category);
}

export function getTargetLensCategories(): string[] {
  const categories = TARGET_LENS_PROFILES.map(p => p.category);
  // Ensure correct order
  const order = [
    'HVAC / Mechanical',
    'Security / Access Control',
    'Solar & Energy',
    'Real Estate / Property Services',
    'Pest Control'
  ];
  return Array.from(new Set(categories)).sort((a, b) => {
    return order.indexOf(a) - order.indexOf(b);
  });
}
