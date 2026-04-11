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

export const PROPERTY_TYPES = [
  'Commercial',
  'Retail',
  'Restaurant',
  'Office',
  'Industrial',
  'Medical',
  'Other',
];

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
  captureMethod: 'manual',
  imageUri: null,
};

export const USER_STORAGE_KEY = '@leadlens_user';
export const LEADS_STORAGE_KEY = '@leadlens_leads';
