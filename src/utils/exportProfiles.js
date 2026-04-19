import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { read, utils, write } from 'xlsx';
import { LEADS_STORAGE_KEY } from '../constants';
import { normalizeLead } from './leadProcessing';

export const EXPORT_PROFILES_KEY = '@leadlens_export_profiles';

export const STANDARD_COLUMNS = [
  'Business Name', 'First Name', 'Last Name', 'Phone', 'Email',
  'Street Number', 'Street Name', 'Address Line 2', 'City', 'State', 'ZIP',
  'Vertical', 'Property Type', 'Status', 'Captured By', 'Employee #', 'Branch #', 'Source Method', 'Image URI'
];

export const SALES_TEMPLATE_COLUMNS = [
  'Employee #', 'Branch', 'Route', 'Status', 'PropertyDescription', 'PropertyType',
  'BusinessName', 'FirstName', 'LastName', 'Salutation', 'Phone', 'Type', 'Email',
  'StreetNum', 'StreetName', 'AddressLine2', 'City', 'State', 'Zip',
  'Instructions/Comments', 'Prospect Source Category', 'Prospect Source', 'CampaignId'
];

export const LEAD_FIELDS = [
  { key: 'skip', label: 'Do not map' },
  { key: 'businessName', label: 'Business Name' },
  { key: 'pocFirst', label: 'First Name' },
  { key: 'pocLast', label: 'Last Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'streetNumber', label: 'Street Number' },
  { key: 'streetName', label: 'Street Name' },
  { key: 'addressLine2', label: 'Address Line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  { key: 'vertical', label: 'Industry Vertical' },
  { key: 'propertyType', label: 'Property Type' },
  { key: 'status', label: 'Status' },
  { key: 'repName', label: 'Rep Name' },
  { key: 'employeeNum', label: 'Employee #' },
  { key: 'branchNum', label: 'Branch #' },
  { key: 'captureMethod', label: 'Capture Method' },
  { key: 'imageUri', label: 'Image URI' },
  { key: 'constant:Commercial', label: 'Constant: Commercial' },
  { key: 'constant:.', label: 'Constant: .' },
];

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
  Type: 'skip',
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
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

const AUTO_HEADER_MATCHES = {
  businessname: 'businessName',
  company: 'businessName',
  companyname: 'businessName',
  accountname: 'businessName',
  firstname: 'pocFirst',
  contactfirstname: 'pocFirst',
  lastname: 'pocLast',
  contactlastname: 'pocLast',
  phone: 'phone',
  telephone: 'phone',
  companyphone: 'phone',
  email: 'email',
  emailaddress: 'email',
  contactemail: 'email',
  streetnum: 'streetNumber',
  streetnumber: 'streetNumber',
  streetname: 'streetName',
  addressline2: 'addressLine2',
  suite: 'addressLine2',
  city: 'city',
  state: 'state',
  zip: 'zip',
  zipcode: 'zip',
  vertical: 'vertical',
  industry: 'vertical',
  propertytype: 'propertyType',
  status: 'status',
};

export async function loadLeads() {
  const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function loadExportProfiles() {
  const raw = await AsyncStorage.getItem(EXPORT_PROFILES_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveExportProfiles(profiles) {
  await AsyncStorage.setItem(EXPORT_PROFILES_KEY, JSON.stringify(profiles));
}

export function buildStandardRows(leads) {
  return leads.map((lead) => {
    const l = normalizeLead(lead, { fillNameDots: true });
    return [
      l.businessName, l.pocFirst, l.pocLast, l.phone, l.email,
      l.streetNumber, l.streetName, l.addressLine2, l.city, l.state, l.zip,
      l.vertical, l.propertyType, l.status, l.repName, l.employeeNum, l.branchNum, l.captureMethod, l.imageUri,
    ];
  });
}

function evaluateField(fieldKey, lead, user) {
  if (!fieldKey || fieldKey === 'skip') return '';
  if (fieldKey.startsWith('constant:')) return fieldKey.slice('constant:'.length);
  const source = fieldKey in lead ? lead[fieldKey] : user?.[fieldKey];
  if (fieldKey === 'pocFirst' || fieldKey === 'pocLast') return source || '.';
  return source ?? '';
}

export async function exportStandardSpreadsheet(leads) {
  const ws = utils.aoa_to_sheet([STANDARD_COLUMNS, ...buildStandardRows(leads)]);
  ws['!cols'] = STANDARD_COLUMNS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'LeadLens Export');
  return writeWorkbookToShareableFile(wb, 'LeadLens_Standard_Export');
}

export async function exportSalesTemplate(leads, user) {
  const rows = leads.map((lead) => SALES_TEMPLATE_COLUMNS.map((column) => evaluateField(SALES_TEMPLATE_MAPPING[column], normalizeLead(lead, { fillNameDots: true }), user)));
  const ws = utils.aoa_to_sheet([SALES_TEMPLATE_COLUMNS, ...rows]);
  ws['!cols'] = SALES_TEMPLATE_COLUMNS.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');
  return writeWorkbookToShareableFile(wb, 'LeadLens_Sales_Module_Export');
}

export async function pickCustomTemplate() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', '*/*'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
  const workbook = read(base64, { type: 'base64' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const headerRows = utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });
  const headers = (headerRows[0] || []).map((v, index) => String(v || `Column ${index + 1}`).trim());
  return {
    asset,
    workbook,
    firstSheetName,
    headers,
    mapping: buildSuggestedMapping(headers),
  };
}

export function buildSuggestedMapping(headers = []) {
  const mapping = {};
  headers.forEach((header) => {
    mapping[header] = AUTO_HEADER_MATCHES[normalizeHeader(header)] || 'skip';
  });
  return mapping;
}

export async function exportUsingProfile(leads, profile, user) {
  const workbook = profile.templateUri ? read(await FileSystem.readAsStringAsync(profile.templateUri, { encoding: FileSystem.EncodingType.Base64 }), { type: 'base64' }) : utils.book_new();
  const sheetName = profile.sheetName || profile.name || 'Export';
  const rows = leads.map((lead) => {
    const normalized = normalizeLead({ ...lead, employeeNum: lead.employeeNum || user.employeeNum, branchNum: lead.branchNum || user.branchNum, repName: lead.repName || user.repName }, { fillNameDots: true });
    return profile.headers.map((header) => evaluateField(profile.mapping[header], normalized, user));
  });
  const ws = utils.aoa_to_sheet([profile.headers, ...rows]);
  ws['!cols'] = profile.headers.map((header) => ({ wch: Math.max(14, String(header).length + 2) }));
  workbook.SheetNames = workbook.SheetNames.filter((name) => name !== sheetName);
  workbook.Sheets[sheetName] = ws;
  if (!workbook.SheetNames.includes(sheetName)) workbook.SheetNames.push(sheetName);
  return writeWorkbookToShareableFile(workbook, profile.fileBaseName || profile.name || 'LeadLens_Custom_Export');
}

async function writeWorkbookToShareableFile(workbook, fileBaseName) {
  const base64 = write(workbook, { type: 'base64', bookType: 'xlsx' });
  const safeBase = String(fileBaseName || 'LeadLens_Export').replace(/[^a-z0-9_\-]+/gi, '_');
  const fileUri = `${FileSystem.cacheDirectory}${safeBase}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save or share your LeadLens export',
      UTI: 'com.microsoft.excel.xlsx',
    });
  }
  return fileUri;
}
