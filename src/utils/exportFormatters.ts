import { write, utils } from 'xlsx';
import * as FileSystem from 'expo-file-system';
import { normalizeLead } from './leadHelpers';
import { getFreshUserProfile } from './storage';

export type ExportFormat = 'csv' | 'xlsx';

export interface ProspectRecord {
  id?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  streetNumber?: string;
  streetName?: string;
  city?: string;
  state?: string;
  zip?: string;
  status?: string;
  contactPerson?: string;
  address?: string;
  notes?: string;
  captureMethod?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any;
}

export interface ExportOptions {
  format: ExportFormat;
  territory?: string;
  filename?: string;
}

const CSV_HEADERS = [
  'Business Name',
  'Contact Person',
  'Phone',
  'Email',
  'Address',
  'Street Number',
  'Street Name',
  'City',
  'State',
  'Zip',
  'Status',
  'Capture Method',
  'Notes',
  'Employee #',
  'Created At',
  'Updated At',
];

const XLSX_HEADERS = [
  'Business Name',
  'Contact Person',
  'Phone',
  'Email',
  'Address',
  'Street Number',
  'Street Name',
  'City',
  'State',
  'Zip',
  'Status',
  'Capture Method',
  'Notes',
  'Employee #',
  'Created At',
  'Updated At',
];

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function prospectToCsvRow(prospect: ProspectRecord): string {
  const normalized = normalizeLead(prospect);
  const user = getFreshUserProfile();
  const fields = [
    normalized.businessName,
    normalized.contactPerson || '',
    normalized.phone,
    normalized.email,
    normalized.address || [normalized.streetNumber, normalized.streetName, normalized.city, normalized.state].filter(Boolean).join(', '),
    normalized.streetNumber,
    normalized.streetName,
    normalized.city,
    normalized.state,
    normalized.zip,
    normalized.status,
    normalized.captureMethod,
    normalized.notes,
    user?.employeeNum || user?.employeeNumber || '',
    normalized.createdAt,
    normalized.updatedAt,
  ];
  return fields.map(escapeCsvField).join(',');
}

function prospectToXlsxRow(prospect: ProspectRecord): (string | number)[] {
  const normalized = normalizeLead(prospect);
  const user = getFreshUserProfile();
  return [
    normalized.businessName || '',
    normalized.contactPerson || '',
    normalized.phone || '',
    normalized.email || '',
    normalized.address || [normalized.streetNumber, normalized.streetName, normalized.city, normalized.state].filter(Boolean).join(', '),
    normalized.streetNumber || '',
    normalized.streetName || '',
    normalized.city || '',
    normalized.state || '',
    normalized.zip || '',
    normalized.status || '',
    normalized.captureMethod || '',
    normalized.notes || '',
    user?.employeeNum || user?.employeeNumber || '',
    normalized.createdAt || '',
    normalized.updatedAt || '',
  ];
}

export function generateCsv(prospects: ProspectRecord[]): string {
  const headerRow = CSV_HEADERS.join(',');
  const dataRows = prospects.map(prospectToCsvRow);
  const csvContent = [headerRow, ...dataRows].join('\r\n');
  return csvContent;
}

export function generateXlsx(prospects: ProspectRecord[]): string {
  const wb = utils.book_new();
  const rows = [XLSX_HEADERS, ...prospects.map(prospectToXlsxRow)];
  const ws = utils.aoa_to_sheet(rows);

  ws['!cols'] = XLSX_HEADERS.map((h) => ({
    wch: Math.max(h.length + 2, 14),
  }));

  utils.book_append_sheet(wb, ws, 'Prospects');
  return write(wb, { type: 'base64', bookType: 'xlsx' });
}

export function buildExportFilename(
  territory: string = 'all',
  format: ExportFormat
): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeTerritory = territory.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const ext = format === 'csv' ? 'csv' : 'xlsx';
  return `leadlens-prospects-${safeTerritory}-${date}.${ext}`;
}

export async function writeExportFile(
  content: string,
  filename: string,
  isBase64: boolean = false
): Promise<string> {
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;
  const encoding = isBase64
    ? FileSystem.EncodingType.Base64
    : FileSystem.EncodingType.UTF8;
  await FileSystem.writeAsStringAsync(fileUri, content, { encoding });
  return fileUri;
}

export function getMimeType(format: ExportFormat): string {
  return format === 'csv'
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export function getExportContent(
  prospects: ProspectRecord[],
  format: ExportFormat
): { content: string; isBase64: boolean } {
  if (format === 'csv') {
    return { content: generateCsv(prospects), isBase64: false };
  }
  return { content: generateXlsx(prospects), isBase64: true };
}

export function generateExportPayload(
  prospects: ProspectRecord[],
  options: ExportOptions
): { fileUri: string; filename: string; mimeType: string } {
  const filename = options.filename || buildExportFilename(options.territory, options.format);
  const { content, isBase64 } = getExportContent(prospects, options.format);
  const mimeType = getMimeType(options.format);
  const fileUri = `${FileSystem.cacheDirectory}${filename}`;

  return { fileUri, filename, mimeType, _content: content, _isBase64: isBase64 };
}

export async function prepareExportFile(
  prospects: ProspectRecord[],
  options: ExportOptions
): Promise<{ fileUri: string; filename: string; mimeType: string }> {
  const filename = options.filename || buildExportFilename(options.territory, options.format);
  const { content, isBase64 } = getExportContent(prospects, options.format);
  const mimeType = getMimeType(options.format);
  const fileUri = await writeExportFile(content, filename, isBase64);

  return { fileUri, filename, mimeType };
}
