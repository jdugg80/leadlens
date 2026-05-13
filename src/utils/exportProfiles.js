import { storageBridge as AsyncStorage } from './storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { read, utils, write } from 'xlsx';

import { LEADS_STORAGE_KEY } from '../constants';
import { normalizeLead } from './leadProcessing';

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
  'Branch / Dept / Team',
  'Source Method',
  'Image URI',
];

export const SALES_TEMPLATE_COLUMNS = [
  'Employee #',
  'Branch',
  'Route',
  'Status',
  'PropertyDescription',
  'PropertyType',
  'BusinessName',
  'FirstName',
  'LastName',
  'Salutation',
  'Phone',
  'Type',
  'Email',
  'StreetNum',
  'StreetName',
  'AddressLine2',
  'City',
  'State',
  'Zip',
  'Instructions/Comments',
  'Prospect Source Category',
  'Prospect Source',
  'CampaignId',
];

export const LEAD_FIELDS = [

  { key: 'pocLast', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'phoneType', label: 'Phone Type' },
  { key: 'email', label: 'Email' },
  { key: 'employeeNum', label: 'Employee #' },
  { key: 'branchNum', label: 'Branch / Dept / Team' },
  { key: 'status', label: 'Status' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'skip', label: 'Do not map' },

  { key: 'businessName', label: 'Business Name' },
  { key: 'pocFirst', label: 'First Name' },
  { key: 'pocLast', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'phoneType', label: 'Phone Type' },
  { key: 'email', label: 'Email' },
  { key: 'employeeNum', label: 'Employee #' },
  { key: 'branchNum', label: 'Branch / Dept / Team' },
  { key: 'status', label: 'Status' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'pocLast', label: 'Last Name' },

  { key: 'phone', label: 'Phone' },
  { key: 'phoneType', label: 'Phone Type' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'facebookUrl', label: 'Facebook URL' },
  { key: 'instagramUrl', label: 'Instagram URL' },
  { key: 'linkedinUrl', label: 'LinkedIn URL' },
  { key: 'tiktokUrl', label: 'TikTok URL' },
  { key: 'youtubeUrl', label: 'YouTube URL' },
  { key: 'xUrl', label: 'X URL' },

  { key: 'streetNumber', label: 'Street Number' },
  { key: 'streetName', label: 'Street Name' },
  { key: 'addressLine2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },

  { key: 'vertical', label: 'Industry Vertical' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'status', label: 'Status' },
  { key: 'notes', label: 'Notes' },

  { key: 'repName', label: 'Rep Name' },
  { key: 'employeeNum', label: 'Employee #' },
  { key: 'branchNum', label: 'Branch / Dept / Team' },

  { key: 'captureMethod', label: 'Capture Method' },
  { key: 'imageUri', label: 'Image URI' },

  { key: 'constant:Work', label: 'Constant: Work' },
  { key: 'constant:Mobile', label: 'Constant: Mobile' },
  { key: 'constant:Home', label: 'Constant: Home' },
  { key: 'constant:Other', label: 'Constant: Other' },

  { key: 'constant:Commercial', label: 'Constant: Commercial' },
  { key: 'constant:New', label: 'Constant: New' },
  { key: 'constant:.', label: 'Constant: .' },
];

export const CUSTOM_TEMPLATE_FIELD_OPTIONS = LEAD_FIELDS.map((field) => ({
  value: field.key,
  label: field.label,
}));

export function getTemplateFieldLabel(value) {
  const found = LEAD_FIELDS.find((field) => field.key === value);
  return found ? found.label : 'Do not map';
}

const SALES_TEMPLATE_MAPPING = {
  'Employee #': 'employeeNum',
  Branch: 'branchNum',
  Route: 'skip',
  Status: 'status',
  PropertyDescription: 'skip',
  PropertyType: 'propertyType',
  BusinessName: 'businessName',
  FirstName: 'pocFirst',
  LastName: 'pocLast',
  Salutation: 'skip',
  Phone: 'phone',
  Type: 'phoneType',
  Email: 'email',
  StreetNum: 'streetNumber',
  StreetName: 'streetName',
  AddressLine2: 'addressLine2',
  City: 'city',
  State: 'state',
  Zip: 'zip',
  'Instructions/Comments': 'skip',
  'Prospect Source Category': 'skip',
  'Prospect Source': 'skip',
  CampaignId: 'skip',
};

function normalizeHeader(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const AUTO_HEADER_MATCHES = {
  businessname: 'businessName',
  business: 'businessName',
  company: 'businessName',
  companyname: 'businessName',
  accountname: 'businessName',

  firstname: 'pocFirst',
  first: 'pocFirst',
  contactfirstname: 'pocFirst',

  lastname: 'pocLast',
  last: 'pocLast',
  contactlastname: 'pocLast',

  phone: 'phone',
  phonenumber: 'phone',
  telephone: 'phone',
  companyphone: 'phone',

  type: 'phoneType',
  phonetype: 'phoneType',
  phonekind: 'phoneType',

  email: 'email',
  emailaddress: 'email',
  contactemail: 'email',

  streetnum: 'streetNumber',
  streetnumber: 'streetNumber',
  streetno: 'streetNumber',

  streetname: 'streetName',
  street: 'streetName',

  addressline2: 'addressLine2',
  address2: 'addressLine2',
  suite: 'addressLine2',
  unit: 'addressLine2',
  ste: 'addressLine2',

  city: 'city',
  state: 'state',

  zip: 'zip',
  zipcode: 'zip',
  postalcode: 'zip',

  vertical: 'vertical',
  industry: 'vertical',
  industryvertical: 'vertical',

  propertytype: 'propertyType',
  property: 'propertyType',
  propertydescription: 'propertyType',

  status: 'status',

  notes: 'notes',
  comments: 'notes',
  instructions: 'notes',
  instructionscomments: 'notes',

  repname: 'repName',
  capturedby: 'repName',
  salesrep: 'repName',

  employee: 'employeeNum',
  employeenum: 'employeeNum',
  employeenumber: 'employeeNum',
  employeeid: 'employeeNum',

  branch: 'branchNum',
  branchnum: 'branchNum',
  branchnumber: 'branchNum',
  branchid: 'branchNum',

  sourcemethod: 'captureMethod',
  capturemethod: 'captureMethod',

  imageuri: 'imageUri',
};

export async function loadLeads() {
  const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveLeads(leads = []) {
  await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(leads || []));
}

export async function loadExportProfiles() {
  const raw = await AsyncStorage.getItem(EXPORT_PROFILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveExportProfiles(profiles) {
  await AsyncStorage.setItem(EXPORT_PROFILES_KEY, JSON.stringify(profiles || []));
}

export function buildSuggestedMapping(headers = []) {
  const mapping = {};

  headers.forEach((header) => {
    mapping[header] = AUTO_HEADER_MATCHES[normalizeHeader(header)] || 'skip';
  });

  return mapping;
}

export function buildStandardRows(leads = []) {
  return leads.map((lead) => {
    const l = normalizeLead(lead || {}, { fillNameDots: true });

    return [
      l.businessName || '',
      l.pocFirst || '.',
      l.pocLast || '.',
      l.phone || '',
      l.email || '',
      l.streetNumber || '',
      l.streetName || '',
      l.addressLine2 || '',
      l.city || '',
      l.state || '',
      l.zip || '',
      l.vertical || '',
      l.propertyType || 'Commercial',
      l.status || '',
      l.repName || '',
      l.employeeNum || '',
      l.branchNum || '',
      l.captureMethod || '',
      l.imageUri || '',
    ];
  });
}

function evaluateField(fieldKey, lead = {}, user = {}) {
  if (!fieldKey || fieldKey === 'skip') return '';

  if (String(fieldKey).startsWith('constant:')) {
    return String(fieldKey).slice('constant:'.length);
  }

  if (String(fieldKey).startsWith('static:')) {
    return String(fieldKey).slice('static:'.length);
  }

  const source =
    fieldKey in lead
      ? lead[fieldKey]
      : user && fieldKey in user
        ? user[fieldKey]
        : '';

  if (fieldKey === 'pocFirst') {
    return source || '.';
  }

  if (fieldKey === 'pocLast') {
    return source || '.';
  }

  if (fieldKey === 'phoneType') {
    return source || 'Work';
  }

  if (fieldKey === 'propertyType') {
    return source || 'Commercial';
  }

  return source ?? '';
}

function normalizeLeadForExport(lead = {}, user = {}) {
  const merged = {
    ...lead,

    employeeNum:
      lead.employeeNum ||
      user.employeeNum ||
      user.employeeNumber ||
      '',

    branchNum:
      lead.branchNum ||
      user.branchNum ||
      user.branchNumber ||
      '',

    repName:
      lead.repName ||
      user.repName ||
      user.name ||
      '',

    phoneType:
      lead.phoneType ||
      user.phoneType ||
      'Work',

    propertyType:
      lead.propertyType ||
      'Commercial',
  };

  return normalizeLead(merged, { fillNameDots: true });
}

export async function buildStandardSpreadsheetFile(leads = []) {
  const ws = utils.aoa_to_sheet([
    STANDARD_COLUMNS,
    ...buildStandardRows(leads),
  ]);

  ws['!cols'] = STANDARD_COLUMNS.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'LeadLens Export');

  return writeWorkbookFile(wb, 'LeadLens_Standard_Export');
}

export async function buildSalesTemplateFile(leads = [], user = {}) {
  const rows = leads.map((lead) => {
    const normalized = normalizeLeadForExport(lead, user);

    return SALES_TEMPLATE_COLUMNS.map((column) =>
      evaluateField(SALES_TEMPLATE_MAPPING[column], normalized, user)
    );
  });

  const ws = utils.aoa_to_sheet([
    SALES_TEMPLATE_COLUMNS,
    ...rows,
  ]);

  ws['!cols'] = SALES_TEMPLATE_COLUMNS.map((h) => ({
    wch: Math.max(12, h.length + 2),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');

  return writeWorkbookFile(wb, 'LeadLens_Sales_Module_Export');
}

export async function buildProfileExportFile(leads = [], profile = {}, user = {}) {
  const workbook = profile.templateUri
    ? read(
        await FileSystem.readAsStringAsync(profile.templateUri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
        { type: 'base64' }
      )
    : utils.book_new();

  const sheetName = profile.sheetName || profile.name || 'Export';
  const headers = profile.headers || [];

  const rows = leads.map((lead) => {
    const normalized = normalizeLeadForExport(lead, user);

    return headers.map((header) =>
      evaluateField(profile.mapping?.[header], normalized, user)
    );
  });

  const ws = utils.aoa_to_sheet([
    headers,
    ...rows,
  ]);

  ws['!cols'] = headers.map((header) => ({
    wch: Math.max(14, String(header).length + 2),
  }));

  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== sheetName);
  workbook.Sheets[sheetName] = ws;

  if (!workbook.SheetNames.includes(sheetName)) {
    workbook.SheetNames.push(sheetName);
  }

  return writeWorkbookFile(
    workbook,
    profile.fileBaseName || profile.name || 'LeadLens_Custom_Export'
  );
}

export async function exportStandardSpreadsheet(leads = []) {
  const ws = utils.aoa_to_sheet([
    STANDARD_COLUMNS,
    ...buildStandardRows(leads),
  ]);

  ws['!cols'] = STANDARD_COLUMNS.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'LeadLens Export');

  return writeWorkbookToShareableFile(wb, 'LeadLens_Standard_Export');
}

export async function exportSalesTemplate(leads = [], user = {}) {
  const rows = leads.map((lead) => {
    const normalized = normalizeLeadForExport(lead, user);

    return SALES_TEMPLATE_COLUMNS.map((column) =>
      evaluateField(SALES_TEMPLATE_MAPPING[column], normalized, user)
    );
  });

  const ws = utils.aoa_to_sheet([
    SALES_TEMPLATE_COLUMNS,
    ...rows,
  ]);

  ws['!cols'] = SALES_TEMPLATE_COLUMNS.map((h) => ({
    wch: Math.max(12, h.length + 2),
  }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');

  return writeWorkbookToShareableFile(wb, 'LeadLens_Sales_Module_Export');
}

export async function pickCustomTemplate() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];

  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const workbook = read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];

  const headerRows = utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    blankrows: false,
  });

  const headers = (headerRows[0] || []).map((v, index) =>
    String(v || `Column ${index + 1}`).trim()
  );

  return {
    asset,
    workbook,
    firstSheetName,
    headers,
    mapping: buildSuggestedMapping(headers),
  };
}

export async function exportUsingProfile(leads = [], profile = {}, user = {}) {
  const workbook = profile.templateUri
    ? read(
        await FileSystem.readAsStringAsync(profile.templateUri, {
          encoding: FileSystem.EncodingType.Base64,
        }),
        { type: 'base64' }
      )
    : utils.book_new();

  const sheetName = profile.sheetName || profile.name || 'Export';
  const headers = profile.headers || [];

  const rows = leads.map((lead) => {
    const normalized = normalizeLeadForExport(lead, user);

    return headers.map((header) =>
      evaluateField(profile.mapping?.[header], normalized, user)
    );
  });

  const ws = utils.aoa_to_sheet([
    headers,
    ...rows,
  ]);

  ws['!cols'] = headers.map((header) => ({
    wch: Math.max(14, String(header).length + 2),
  }));

  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== sheetName);
  workbook.Sheets[sheetName] = ws;

  if (!workbook.SheetNames.includes(sheetName)) {
    workbook.SheetNames.push(sheetName);
  }

  return writeWorkbookToShareableFile(
    workbook,
    profile.fileBaseName || profile.name || 'LeadLens_Custom_Export'
  );
}

async function writeWorkbookFile(workbook, fileBaseName) {
  const base64 = write(workbook, {
    type: 'base64',
    bookType: 'xlsx',
  });

  const safeBase = String(fileBaseName || 'LeadLens_Export').replace(
    /[^a-z0-9_\-]+/gi,
    '_'
  );

  const fileUri = `${FileSystem.cacheDirectory}${safeBase}_${new Date()
    .toISOString()
    .slice(0, 10)}.xlsx`;

  await FileSystem.writeAsStringAsync(fileUri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return fileUri;
}

async function writeWorkbookToShareableFile(workbook, fileBaseName) {
  const fileUri = await writeWorkbookFile(workbook, fileBaseName);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save or share your LeadLens export',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }

  return fileUri;
}