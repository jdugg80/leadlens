import * as XLSX from 'xlsx';

/**
 * LeadLens Export Constants (Sync with Mobile App)
 */
export const EXPORT_PROFILES_KEY = '@leadlens_export_profiles';

export const STANDARD_COLUMNS = [
  'Business Name',
  'First Name',
  'Last Name',
  'Phone',
  'Email',
  'Street Number',
  'Street Name',
  'Address Line 2',
  'City',
  'State',
  'ZIP',
  'Vertical',
  'Property Type',
  'Status',
  'Captured By',
  'Employee #',
  'Branch #',
  'Source Method',
];

export const LEAD_FIELDS = [
  { key: 'business_name', label: 'Business Name' },
  { key: 'poc_first', label: 'First Name' },
  { key: 'poc_last', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone_type', label: 'Phone Type' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'facebook_url', label: 'Facebook URL' },
  { key: 'instagram_url', label: 'Instagram URL' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'tiktok_url', label: 'TikTok URL' },
  { key: 'youtube_url', label: 'YouTube URL' },
  { key: 'x_url', label: 'X URL' },
  { key: 'street_number', label: 'Street Number' },
  { key: 'street_name', label: 'Street Name' },
  { key: 'address_line2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'vertical', label: 'Industry Vertical' },
  { key: 'property_type', label: 'Property Type' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },
  { key: 'rep_name', label: 'Rep Name' },
  { key: 'employee_num', label: 'Employee #' },
  { key: 'branch_num', label: 'Branch #' },
  { key: 'capture_method', label: 'Capture Method' },
  { key: 'constant:Work', label: 'Constant: Work' },
  { key: 'constant:Mobile', label: 'Constant: Mobile' },
  { key: 'constant:Home', label: 'Constant: Home' },
  { key: 'constant:Other', label: 'Constant: Other' },
  { key: 'constant:Commercial', label: 'Constant: Commercial' },
  { key: 'constant:New', label: 'Constant: New' },
  { key: 'constant:Suspect', label: 'Constant: Suspect' },
  { key: 'constant:.', label: 'Constant: .' },
  { key: 'skip', label: 'Do not map' },
];

const AUTO_HEADER_MATCHES = {
  business_name: 'business_name',
  businessname: 'business_name',
  business: 'business_name',
  company: 'business_name',
  companyname: 'business_name',
  accountname: 'business_name',
  poc_first: 'poc_first',
  firstname: 'poc_first',
  first: 'poc_first',
  contactfirstname: 'poc_first',
  poc_last: 'poc_last',
  lastname: 'poc_last',
  last: 'poc_last',
  contactlastname: 'poc_last',
  phone: 'phone',
  phonenumber: 'phone',
  telephone: 'phone',
  companyphone: 'phone',
  type: 'phone_type',
  phonetype: 'phone_type',
  phonekind: 'phone_type',
  email: 'email',
  emailaddress: 'email',
  contactemail: 'email',
  street_number: 'street_number',
  streetnum: 'street_number',
  streetnumber: 'street_number',
  streetno: 'street_number',
  street_name: 'street_name',
  streetname: 'street_name',
  street: 'street_name',
  address_line2: 'address_line2',
  addressline2: 'address_line2',
  address2: 'address_line2',
  suite: 'address_line2',
  unit: 'address_line2',
  ste: 'address_line2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  zipcode: 'zip',
  postalcode: 'zip',
  vertical: 'vertical',
  industry: 'vertical',
  industryvertical: 'vertical',
  property_type: 'property_type',
  propertytype: 'property_type',
  property: 'property_type',
  propertydescription: 'property_type',
  status: 'status',
  notes: 'notes',
  comments: 'notes',
  instructions: 'notes',
  instructionscomments: 'notes',
  rep_name: 'rep_name',
  repname: 'rep_name',
  capturedby: 'rep_name',
  salesrep: 'rep_name',
  employee: 'employee_num',
  employee_num: 'employee_num',
  employeenum: 'employee_num',
  employeenumber: 'employee_num',
  employeeid: 'employee_num',
  branch: 'branch_num',
  branch_num: 'branch_num',
  branchnum: 'branch_num',
  branchnumber: 'branch_num',
  branchid: 'branch_num',
  capture_method: 'capture_method',
  sourcemethod: 'capture_method',
  capturemethod: 'capture_method',
};

function normalizeHeader(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

export function buildSuggestedMapping(headers = []) {
  const mapping = {};
  headers.forEach((header) => {
    mapping[header] = AUTO_HEADER_MATCHES[normalizeHeader(header)] || 'skip';
  });
  return mapping;
}

/**
 * Helper to evaluate a field for a specific template
 */
function evaluateField(fieldKey, lead = {}, user = {}) {
  if (!fieldKey || fieldKey === 'skip') return '';

  if (String(fieldKey).startsWith('constant:')) {
    return String(fieldKey).slice('constant:'.length);
  }

  const source =
    fieldKey in lead
      ? lead[fieldKey]
      : user && fieldKey in user
        ? user[fieldKey]
        : '';

  if (fieldKey === 'poc_first' || fieldKey === 'poc_last') {
    return source || '.';
  }

  if (fieldKey === 'phone_type') {
    return source || 'Work';
  }

  if (fieldKey === 'property_type') {
    return source || 'Commercial';
  }

  return source ?? '';
}

/**
 * Standard Export
 */
export function exportStandardSpreadsheet(leads = []) {
  const rows = leads.map(l => [
    l.business_name || '',
    l.poc_first || '.',
    l.poc_last || '.',
    l.phone || '',
    l.email || '',
    l.street_number || '',
    l.street_name || '',
    l.address_line2 || '',
    l.city || '',
    l.state || '',
    l.zip || '',
    l.vertical || '',
    l.property_type || 'Commercial',
    l.status || '',
    l.rep_name || '',
    l.employee_num || '',
    l.branch_num || '',
    l.capture_method || '',
  ]);

  const ws = XLSX.utils.aoa_to_sheet([STANDARD_COLUMNS, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Prospects');
  XLSX.writeFile(wb, `LeadLens_Standard_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Custom Profile Export
 */
export function exportUsingProfile(leads = [], profile = {}, user = {}) {
  const headers = profile.headers || [];
  const rows = leads.map(lead =>
    headers.map(header =>
      evaluateField(profile.mapping?.[header], lead, user)
    )
  );

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, profile.sheetName || 'Export');
  XLSX.writeFile(wb, `${profile.name || 'LeadLens_Custom_Export'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Utility for parsing CSV/Excel files for import.
 */
export function parseImportFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bstr = e.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet);

        // Get headers too
        const headerRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const headers = (headerRows[0] || []).map((v, index) => String(v || `Column ${index + 1}`).trim());

        resolve({ data, headers, firstSheetName });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsBinaryString(file);
  });
}
