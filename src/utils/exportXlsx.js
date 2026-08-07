import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { utils, write, read } from 'xlsx';
import { applyRequiredPlaceholders, normalizeLead } from './leadHelpers';
import { mergeWithFreshUserProfile } from './storage';

const TEMPLATE_HEADERS = [
  'Employee #','Branch','Route','Status','PropertyDescription',
  'PropertyType','BusinessName','FirstName','LastName','Salutation',
  'Phone','Type','Email','StreetNum','StreetName','AddressLine2',
  'City','State','Zip','Instructions/Comments',
  'Prospect Source Category','Prospect Source','CampaignId',
];

const STANDARD_HEADERS = [
  'Business Name','First Name','Last Name','Phone','Email',
  'Street Number','Street Name','Address Line 2','City','State','Zip',
  'Status','Property Type','Vertical','Capture Method','Notes',
];

function buildTemplateRow(lead, user) {
  const safe = applyRequiredPlaceholders(normalizeLead(lead));
  return [
    user.employeeNum, user.branchNum, '', safe.status, '',
    safe.propertyType, safe.businessName, safe.pocFirst, safe.pocLast, '',
    safe.phone, 'Work', safe.email, safe.streetNumber, safe.streetName, safe.addressLine2,
    safe.city, safe.state, safe.zip, '', '', '', '',
  ];
}

function buildStandardRow(lead) {
  const safe = applyRequiredPlaceholders(normalizeLead(lead));
  return [
    safe.businessName, safe.pocFirst, safe.pocLast, safe.phone, safe.email,
    safe.streetNumber, safe.streetName, safe.addressLine2, safe.city, safe.state, safe.zip,
    safe.status, safe.propertyType, safe.vertical || '', safe.captureMethod || '', safe.notes || '',
  ];
}

async function buildWorkbook(leads, user, options = {}) {
  const freshUser = mergeWithFreshUserProfile(user);
  const mode = options.mode || 'template';
  const wb = utils.book_new();
  if (mode === 'standard') {
    const ws = utils.aoa_to_sheet([STANDARD_HEADERS, ...leads.map(buildStandardRow)]);
    ws['!cols'] = STANDARD_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 14) }));
    utils.book_append_sheet(wb, ws, 'LeadLens Export');
    return wb;
  }

  if (mode === 'custom' && options.templateUri && options.mapping) {
    let templateWb;
    if (options.templateBase64) {
      templateWb = read(options.templateBase64, { type: 'base64' });
    } else {
      const templateB64 = await FileSystem.readAsStringAsync(options.templateUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      templateWb = read(templateB64, { type: 'base64' });
    }

    const wsName = templateWb.SheetNames[0] || 'Export';
    const ws = templateWb.Sheets[wsName] || utils.aoa_to_sheet([[]]);
    const startRow = Number(options.startRow || 2);
    leads.forEach((lead, idx) => {
      const safe = applyRequiredPlaceholders(normalizeLead(lead));
      Object.entries(options.mapping).forEach(([column, field]) => {
        const cell = `${column}${startRow + idx}`;
        ws[cell] = { t: 's', v: safe[field] || '' };
      });
    });
    templateWb.Sheets[wsName] = ws;
    return templateWb;
  }

  const ws = utils.aoa_to_sheet([TEMPLATE_HEADERS, ...leads.map((lead) => buildTemplateRow(lead, freshUser))]);
  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');
  return wb;
}

export async function buildXlsxUri(leads, user, options = {}) {
  const wb = buildWorkbook(leads, user, options);
  const b64 = write(wb, { type: 'base64', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);
  const filename = `LeadLens_Export_${date}.xlsx`;
  const fileUri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(fileUri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return fileUri;
}

export async function exportLeadsToXLSX(leads, user, options = {}) {
  const fileUri = await buildXlsxUri(leads, user, options);
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing not available on this device.');
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Save or share your lead export',
    UTI: 'com.microsoft.excel.xlsx',
  });
  return fileUri;
}
