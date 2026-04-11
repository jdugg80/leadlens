import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { utils, write } from 'xlsx';

// Exact 23-column Sales Module Import Template (A–W)
// ★ = yellow / minimum required by the destination system
const HEADERS = [
  'Employee #',              // A  — from user profile
  'Branch',                  // B  ★ from user profile
  'Route',                   // C  — ignored / blank
  'Status',                  // D  ★
  'PropertyDescription',     // E  — ignored / blank
  'PropertyType',            // F  ★
  'BusinessName',            // G  ★
  'FirstName',               // H  ★
  'LastName',                // I  ★
  'Salutation',              // J  — ignored / blank
  'Phone',                   // K
  'Type',                    // L  — ignored / blank
  'Email',                   // M
  'StreetNum',               // N
  'StreetName',              // O
  'AddressLine2',            // P
  'City',                    // Q
  'State',                   // R
  'Zip',                     // S  ★
  'Instructions/Comments',   // T  — ignored / blank
  'Prospect Source Category',// U  — ignored / blank
  'Prospect Source',         // V  — ignored / blank
  'CampaignId',              // W  — ignored / blank
];

function buildRow(lead, user) {
  return [
    user.employeeNum,     // A
    user.branchNum,       // B ★
    '',                   // C
    lead.status,          // D ★
    '',                   // E
    lead.propertyType,    // F ★
    lead.businessName,    // G ★
    lead.pocFirst,        // H ★
    lead.pocLast,         // I ★
    '',                   // J
    lead.phone,           // K
    '',                   // L
    lead.email,           // M
    lead.streetNumber,    // N
    lead.streetName,      // O
    lead.addressLine2,    // P
    lead.city,            // Q
    lead.state,           // R
    lead.zip,             // S ★
    '',                   // T
    '',                   // U
    '',                   // V
    '',                   // W
  ];
}

export async function exportLeadsToXLSX(leads, user) {
  const rows = leads.map((l) => buildRow(l, user));
  const ws = utils.aoa_to_sheet([HEADERS, ...rows]);

  // Column widths
  ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(h.length + 2, 12) }));

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Sales Module Import Template');

  // Write as base64
  const b64 = write(wb, { type: 'base64', bookType: 'xlsx' });

  const date = new Date().toISOString().slice(0, 10);
  const filename = `LeadLens_Export_${date}.xlsx`;
  const fileUri = FileSystem.cacheDirectory + filename;

  await FileSystem.writeAsStringAsync(fileUri, b64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save or share your lead export',
      UTI: 'com.microsoft.excel.xlsx',
    });
  } else {
    throw new Error('Sharing not available on this device.');
  }
}
