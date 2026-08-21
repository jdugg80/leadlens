import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Field / format constants — ported from src/utils/exportProfiles.js
// ═══════════════════════════════════════════════════════════════════════════════

const STANDARD_COLUMNS = [
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

const STATE_NAME_MAP: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY',
};

const VERTICAL_PATTERNS = [
  { vertical: 'Restaurants', terms: ['restaurant', 'grill', 'bbq', 'cafe', 'taqueria', 'taco', 'pizza', 'burger', 'kitchen', 'eatery', 'bistro', 'diner'] },
  { vertical: 'Food & Beverage Processing', terms: ['food processing', 'bakery', 'meat market', 'catering', 'commissary', 'food plant', 'brewery'] },
  { vertical: 'Retail', terms: ['store', 'shop', 'boutique', 'retail', 'market', 'grocery', 'pharmacy', 'salon'] },
  { vertical: 'Logistics / Distribution', terms: ['distribution', 'logistics', 'freight', 'shipping', 'terminal', 'fulfillment'] },
  { vertical: 'Warehousing', terms: ['warehouse', 'storage', 'cold storage'] },
  { vertical: 'Hotels / Motels / Apartments', terms: ['apartments', 'apartment', 'multifamily', 'leasing office', 'resident', 'townhomes', 'hotel', 'motel', 'inn', 'suites', 'hospitality', 'lodge', 'resort'] },
  { vertical: 'Office Buildings', terms: ['office', 'insurance', 'agency', 'law firm', 'attorney', 'real estate', 'accounting', 'professional', 'hoa', 'community association', 'clubhouse', 'amenity center'] },
  { vertical: 'Medical', terms: ['medical', 'clinic', 'hospital', 'dental', 'dentist', 'orthodont', 'doctor', 'pediatric', 'urgent care', 'surgery'] },
  { vertical: 'Schools / Daycares', terms: ['school', 'daycare', 'academy', 'learning center', 'childcare', 'elementary', 'isd', 'college'] },
  { vertical: 'Government', terms: ['city of', 'town of', 'police', 'fire department', 'municipal', 'county', 'public works', 'government'] },
  { vertical: 'Pest Control', terms: ['pest control', 'exterminator', 'pest management', 'bug', 'termite', 'roach', 'rodent', 'pesticide', 'fumigation', 'mosquito'] },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Normalization helpers — mirror src/utils/leadProcessing.js
// ═══════════════════════════════════════════════════════════════════════════════

function normalizePhone(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return normalizePhone(digits.slice(1));
  }
  if (digits.length !== 10) return String(value || '').trim();
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeEmail(value = '') {
  return String(value || '').trim().toLowerCase();
}

function normalizeState(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (STATE_NAME_MAP[lower]) return STATE_NAME_MAP[lower];
  return trimmed.toUpperCase().slice(0, 2);
}

function normalizeZip(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length > 5) return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  return digits.slice(0, 5);
}

function normalizeName(value = '', fallbackDot = false) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallbackDot ? '.' : '';
  return cleaned;
}

function splitStreetAddress(address = '') {
  const cleaned = String(address || '').trim();
  if (!cleaned) return { streetNumber: '', streetName: '' };
  const match = cleaned.match(/^(\d+[A-Za-z\-]*)\s+(.*)$/);
  if (!match) return { streetNumber: '', streetName: cleaned };
  return { streetNumber: match[1], streetName: match[2] };
}

function classifyVertical(lead: Record<string, unknown>) {
  const haystack = [
    lead.business_name,
    lead.notes,
    lead.street_name,
    lead.city,
    lead.email,
    lead.website,
    lead.source_text,
  ].filter(Boolean).join(' ').toLowerCase();

  let best = { vertical: String(lead.vertical || 'Other'), score: 0 };
  for (const pattern of VERTICAL_PATTERNS) {
    const score = pattern.terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
    if (score > best.score) best = { vertical: pattern.vertical, score };
  }

  const vertical = best.score > 0
    ? best.vertical
    : (lead.vertical && typeof lead.vertical === 'string' && lead.vertical !== 'Other'
      ? lead.vertical
      : 'Other');
  return { vertical, propertyType: 'Commercial' };
}

function normalizeLead(row: Record<string, unknown>) {
  const lead: Record<string, unknown> = { ...row };

  lead.businessName = String(row.business_name || '').trim();
  lead.pocFirst = normalizeName(row.poc_first, true);
  lead.pocLast = normalizeName(row.poc_last, true);
  lead.phone = normalizePhone(row.phone);
  lead.email = normalizeEmail(row.email);
  lead.website = String(row.website || '').trim();
  lead.notes = String(row.notes || '').trim();
  lead.state = normalizeState(row.state);
  lead.zip = normalizeZip(row.zip);
  lead.streetNumber = String(row.street_number || '').trim();
  lead.streetName = String(row.street_name || '').trim();
  lead.addressLine2 = String(row.address_line_2 || '').trim();
  lead.city = String(row.city || '').trim();
  lead.captureMethod = String(row.capture_method || '').trim();
  lead.repName = String(row.rep_name || '').trim();
  lead.employeeNum = String(row.employee_num || '').trim();
  lead.branchNum = String(row.branch_num || '').trim();
  lead.status = String(row.status || '').trim() || 'New';
  lead.imageUri = String(row.image_uri || '').trim();
  lead.phoneType = 'Work';

  if ((!lead.streetNumber || !lead.streetName) && row.address) {
    const parts = splitStreetAddress(String(row.address));
    lead.streetNumber = lead.streetNumber || parts.streetNumber;
    lead.streetName = lead.streetName || parts.streetName;
  }

  const classification = classifyVertical(row);
  if (!row.vertical || row.vertical === 'Restaurant' || row.vertical === 'Other') {
    lead.vertical = classification.vertical;
  } else {
    lead.vertical = String(row.vertical || '').trim();
  }
  lead.propertyType = String(row.property_type || '').trim() || 'Commercial';

  return lead;
}

function evaluateField(fieldKey: string, lead: Record<string, unknown>, user: Record<string, unknown>) {
  if (!fieldKey || fieldKey === 'skip') return '';

  if (String(fieldKey).startsWith('constant:')) {
    return String(fieldKey).slice('constant:'.length);
  }

  if (String(fieldKey).startsWith('static:')) {
    return String(fieldKey).slice('static:'.length);
  }

  const source = fieldKey in lead
    ? lead[fieldKey]
    : fieldKey in user
      ? user[fieldKey]
      : '';

  if (fieldKey === 'pocFirst' || fieldKey === 'pocLast') {
    return String(source || '').trim() || '.';
  }

  if (fieldKey === 'phoneType') {
    return String(source || '').trim() || 'Work';
  }

  if (fieldKey === 'propertyType') {
    return String(source || '').trim() || 'Commercial';
  }

  return source ?? '';
}

function buildStandardRows(leads: Record<string, unknown>[]) {
  return leads.map((row) => {
    const l = normalizeLead(row);
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

function buildStandardWorkbook(leads: Record<string, unknown>[]) {
  const ws = XLSX.utils.aoa_to_sheet([
    STANDARD_COLUMNS,
    ...buildStandardRows(leads),
  ]);

  ws['!cols'] = STANDARD_COLUMNS.map((h) => ({
    wch: Math.max(14, h.length + 2),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'LeadLens Export');
  return wb;
}

function buildCustomWorkbook(
  leads: Record<string, unknown>[],
  template: Record<string, unknown>,
  baseWorkbook?: XLSX.WorkBook
) {
  const sheetName = String(template.sheet_name || template.name || 'Export');
  const headers = Array.isArray(template.headers) ? template.headers : [];
  const mapping = (template.mapping as Record<string, string>) || {};

  const userProfile = {
    employeeNum: '',
    branchNum: '',
    repName: '',
  };

  const rows = leads.map((row) => {
    const l = normalizeLead(row);
    return headers.map((header) => evaluateField(mapping[header], l, userProfile));
  });

  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows,
  ]);

  ws['!cols'] = headers.map((header) => ({
    wch: Math.max(14, String(header).length + 2),
  }));

  const wb = baseWorkbook || XLSX.utils.book_new();

  // Remove existing sheet with the same name, then append without clobbering other sheets
  wb.SheetNames = wb.SheetNames.filter((name) => name !== sheetName);
  wb.Sheets[sheetName] = ws;
  if (!wb.SheetNames.includes(sheetName)) {
    wb.SheetNames.push(sheetName);
  }

  return wb;
}

function workbookToBuffer(wb: XLSX.WorkBook) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new Uint8Array(buf);
}

function uint8ToBase64(bytes: Uint8Array) {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  return btoa(binary);
}

function buildFileName(baseName: string, dateStr: string) {
  const safeBase = String(baseName || 'LeadLens_Export').replace(/[^a-z0-9_\-]+/gi, '_');
  return `${safeBase}_${dateStr}.xlsx`;
}

function formatDateInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatWeekdayInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).formatToParts(date);
  return parts.find((p) => p.type === 'weekday')?.value || '';
}

function formatTimePartsInTz(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
  return { hour: get('hour'), minute: get('minute') };
}

const WEEKDAY_NAME_TO_NUMBER: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

function parseTime(timeStr: string) {
  const [hourStr, minuteStr] = String(timeStr || '00:00').split(':');
  return {
    hour: parseInt(hourStr || '0', 10),
    minute: parseInt(minuteStr || '0', 10),
  };
}

function replaceCountTokens(text: string, count: number) {
  return String(text || '').replaceAll('{count}', String(count));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL') || 'noreply@support.okayestmedia.com';

    if (!supabaseUrl || !supabaseKey || !resendKey) {
      return new Response(
        JSON.stringify({ error: 'Missing required environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date();

    const { data: settingsRows, error: settingsError } = await supabase
      .from('auto_export_settings')
      .select('*')
      .eq('enabled', true);

    if (settingsError) {
      console.error('Failed to load auto export settings:', settingsError);
      throw settingsError;
    }

    const results: Array<Record<string, unknown>> = [];

    for (const settings of settingsRows || []) {
      const userId = settings.user_id as string;
      const timeZone = String(settings.timezone || 'America/Chicago');
      const currentDate = formatDateInTz(now, timeZone);
      const currentWeekday = WEEKDAY_NAME_TO_NUMBER[formatWeekdayInTz(now, timeZone)];
      const currentTime = formatTimePartsInTz(now, timeZone);
      const targetTime = parseTime(settings.time as string);
      const days = Array.isArray(settings.days) ? settings.days : [];

      const isDue =
        days.includes(currentWeekday) &&
        (currentTime.hour > targetTime.hour ||
          (currentTime.hour === targetTime.hour && currentTime.minute >= targetTime.minute)) &&
        String(settings.last_run_date || '') !== currentDate;

      if (!isDue) {
        results.push({ user_id: userId, status: 'skipped', reason: 'not_due' });
        continue;
      }

      // Sales Module is retired
      if (settings.export_format === 'sales_module') {
        const message = 'Sales Module format has been retired — please update your export settings to Standard or Custom';
        await supabase
          .from('auto_export_settings')
          .update({
            last_run_date: currentDate,
            last_status: message,
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'skipped', reason: 'retired_sales_module' });
        continue;
      }

      // Fetch leads
      let query = supabase
        .from('prospects')
        .select('*')
        .eq('user_id', userId)
        .is('exported_at', null);

      if (settings.reviewed_only) {
        query = query.eq('reviewed', true);
      }

      if (settings.exclude_duplicates !== false) {
        query = query.or('duplicate_warning.is.null,duplicate_warning.eq.');
      }

      const { data: leads, error: leadsError } = await query;

      if (leadsError) {
        console.error(`Failed to load leads for ${userId}:`, leadsError);
        await supabase
          .from('auto_export_settings')
          .update({
            last_status: `Lead query failed: ${leadsError.message}`,
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'error', reason: leadsError.message });
        continue;
      }

      const leadRows = (leads || []) as Array<Record<string, unknown>>;

      if (leadRows.length === 0) {
        await supabase
          .from('auto_export_settings')
          .update({
            last_run_date: currentDate,
            last_status: 'No leads to export',
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'skipped', reason: 'no_leads' });
        continue;
      }

      let fileBuffer: Uint8Array;
      let fileName: string;

      try {
        if (settings.export_format === 'custom_template') {
          const templateId = settings.template_id as string | null;
          const templateName = settings.template_name as string | null;

          let templateQuery = supabase
            .from('export_templates')
            .select('*')
            .eq('user_id', userId);

          if (templateId) {
            templateQuery = templateQuery.eq('id', templateId);
          } else if (templateName) {
            templateQuery = templateQuery.eq('name', templateName);
          } else {
            throw new Error('Custom template format selected but no template_id or template_name provided');
          }

          const { data: templates, error: templateError } = await templateQuery;

          if (templateError) {
            throw new Error(`Template lookup failed: ${templateError.message}`);
          }

          if (!templates || templates.length === 0) {
            const message = 'Custom template not found — check Settings';
            await supabase
              .from('auto_export_settings')
              .update({
                last_run_date: currentDate,
                last_status: message,
                updated_at: now.toISOString(),
              })
              .eq('user_id', userId);
            results.push({ user_id: userId, status: 'skipped', reason: 'template_not_found' });
            continue;
          }

          const template = templates[0] as Record<string, unknown>;
          const storagePath = template.template_storage_path as string | null;

          let baseWorkbook: XLSX.WorkBook | undefined;
          if (storagePath) {
            const { data: fileData, error: downloadError } = await supabase.storage
              .from('export-templates')
              .download(storagePath);

            if (downloadError) {
              throw new Error(`Template download failed: ${downloadError.message}`);
            }

            const arrayBuffer = await (fileData as Blob).arrayBuffer();
            const base64 = uint8ToBase64(new Uint8Array(arrayBuffer));
            baseWorkbook = XLSX.read(base64, { type: 'base64' });
          }

          const wb = buildCustomWorkbook(leadRows, template, baseWorkbook);
          const baseName = (template.file_base_name as string) || (template.name as string) || 'LeadLens_Custom_Export';
          fileName = buildFileName(baseName, currentDate);
          fileBuffer = workbookToBuffer(wb);
        } else {
          // universal_excel (Standard) — default fallback
          const wb = buildStandardWorkbook(leadRows);
          fileName = buildFileName('LeadLens_Standard_Export', currentDate);
          fileBuffer = workbookToBuffer(wb);
        }
      } catch (buildErr: unknown) {
        const message = buildErr instanceof Error ? buildErr.message : String(buildErr);
        console.error(`Export build failed for ${userId}:`, message);
        await supabase
          .from('auto_export_settings')
          .update({
            last_status: `Export build failed: ${message}`,
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'error', reason: message });
        continue;
      }

      // Send email
      const recipients = String(settings.recipients || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (recipients.length === 0) {
        await supabase
          .from('auto_export_settings')
          .update({
            last_status: 'No recipients configured — email not sent',
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'skipped', reason: 'no_recipients' });
        continue;
      }

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: recipients,
            subject: replaceCountTokens(String(settings.subject || 'LeadLens Scheduled Export'), leadRows.length),
            html: `<p>${replaceCountTokens(String(settings.body || ''), leadRows.length).replace(/\n/g, '<br>')}</p>`,
            attachments: [
              {
                filename: fileName,
                content: uint8ToBase64(fileBuffer),
              },
            ],
          }),
        });

        if (!emailResponse.ok) {
          const emailError = await emailResponse.text();
          throw new Error(`Resend error: ${emailError}`);
        }

        const emailResult = await emailResponse.json();

        // Mark exported_at if clear_after_send or archive_after_send is true
        if (settings.clear_after_send || settings.archive_after_send) {
          const leadIds = leadRows.map((l) => l.id).filter(Boolean) as string[];
          if (leadIds.length > 0) {
            const { error: updateError } = await supabase
              .from('prospects')
              .update({ exported_at: now.toISOString() })
              .in('id', leadIds)
              .eq('user_id', userId);

            if (updateError) {
              console.error(`Failed to mark exported_at for ${userId}:`, updateError);
            }
          }
        }

        await supabase
          .from('auto_export_settings')
          .update({
            last_run_date: currentDate,
            last_status: `Sent ${leadRows.length} prospect${leadRows.length === 1 ? '' : 's'} to ${recipients.length} recipient(s) (Resend ID: ${emailResult.id})`,
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);

        results.push({
          user_id: userId,
          status: 'sent',
          count: leadRows.length,
          email_id: emailResult.id,
          file_name: fileName,
        });
      } catch (sendErr: unknown) {
        const message = sendErr instanceof Error ? sendErr.message : String(sendErr);
        console.error(`Send failed for ${userId}:`, message);
        await supabase
          .from('auto_export_settings')
          .update({
            last_status: `Send failed: ${message}`,
            updated_at: now.toISOString(),
          })
          .eq('user_id', userId);
        results.push({ user_id: userId, status: 'send_error', reason: message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('scheduled-export-run fatal error:', err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
