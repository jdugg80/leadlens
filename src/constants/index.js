export const COLORS = {
  bg: '#0D0F14',
  surface: '#13161E',
  surface2: '#1A1E28',
  border: '#252A38',
  accent: '#00C9FF',
  accent2: '#FF6B2B',
  danger: '#FF3B5C',
  success: '#00E5A0',
  text: '#E8EAF0',
  muted: '#6B7280',
  label: '#9CA3AF',
};

export const STATUS_OPTIONS = [
  'Suspect',
  'New',
  'Contacted',
  'In Progress',
  'Not Interested',
  'Closed',
];

// Pest control industry verticals
export const INDUSTRY_VERTICALS = [
  'Restaurant',
  'Food Service / Processing',
  'Retail',
  'Warehouse / Distribution',
  'Multi-Family / Apartments',
  'HOA / Community',
  'Commercial Office',
  'Healthcare / Medical',
  'School / Daycare',
  'Hotel / Hospitality',
  'Government / Municipal',
  'Other',
];

// Property types kept for Sales Module compatibility
export const PROPERTY_TYPES = [
  'Commercial',
  'Retail',
  'Restaurant',
  'Office',
  'Industrial',
  'Medical',
  'Other',
];

// User roles
export const ROLES = {
  ACCOUNT_MANAGER: 'Account Manager',
  BRANCH_MANAGER: 'Branch Manager',
  REGIONAL_MANAGER: 'Regional Manager',
};

export const EMPTY_LEAD = {
  businessName: '',
  pocFirst: '',
  pocLast: '',
  phone: '',
  email: '',
  streetNumber: '',
  streetName: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  status: 'Suspect',
  propertyType: 'Commercial',
  vertical: 'Restaurant',
  captureMethod: 'manual',
  imageUri: null,
};

export const USER_STORAGE_KEY = '@leadlens_user';
export const LEADS_STORAGE_KEY = '@leadlens_leads';
export const ALL_LEADS_KEY = '@leadlens_all_leads'; // cross-rep storage
export const AUTO_INTRO_KEY = '@leadlens_auto_intro';
