const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = 'PUT_YOUR_KEY_HERE_FOR_NOW';

const EMPTY_RESULT = {
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
  confidence: 'low',
  notes: '',
};

function cleanJsonText(text = '') {
  return text.replace(/```json|```/g, '').trim();
}

function safeParseLead(text = '{}') {
  try {
    const parsed = JSON.parse(cleanJsonText(text));
    return { ...EMPTY_RESULT, ...parsed };
  } catch {
    return { ...EMPTY_RESULT };
  }
}

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value || '';
}

function normalizeState(value = '') {
  return String(value).trim().toUpperCase().slice(0, 2);
}

function normalizeZip(value = '') {
  const match = String(value).match(/\d{5}(?:-\d{4})?/);
  return match ? match[0] : value || '';
}

function cleanString(value = '') {
  return typeof value === 'string' ? value.trim() : '';
}

function confidenceRank(value = 'low') {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function mergeField(primary, secondary) {
  const p = cleanString(primary);
  const s = cleanString(secondary);
  return p || s || '';
}

function mergeNotes(primary, secondary) {
  const notes = [cleanString(primary), cleanString(secondary)].filter(Boolean);
  return [...new Set(notes)].join(' | ');
}

function mergeLeadResults(primary = {}, secondary = {}) {
  return {
    businessName: mergeField(primary.businessName, secondary.businessName),
    pocFirst: mergeField(primary.pocFirst, secondary.pocFirst),
    pocLast: mergeField(primary.pocLast, secondary.pocLast),
    phone: normalizePhone(mergeField(primary.phone, secondary.phone)),
    email: mergeField(primary.email, secondary.email).toLowerCase(),
    streetNumber: mergeField(primary.streetNumber, secondary.streetNumber),
    streetName: mergeField(primary.streetName, secondary.streetName),
    addressLine2: mergeField(primary.addressLine2, secondary.addressLine2),
    city: mergeField(primary.city, secondary.city),
    state: normalizeState(mergeField(primary.state, secondary.state)),
    zip: normalizeZip(mergeField(primary.zip, secondary.zip)),
    confidence:
      confidenceRank(primary.confidence) >= confidenceRank(secondary.confidence)
        ? primary.confidence || 'low'
        : secondary.confidence || 'low',
    notes: mergeNotes(primary.notes, secondary.notes),
  };
}

function missingImportantFields(lead = {}) {
  const important = [
    'businessName',
    'phone',
    'email',
    'streetName',
    'city',
    'state',
    'zip',
  ];
  return important.filter((field) => !cleanString(lead[field]));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFriendlyApiError(status, errBody) {
  if (status === 529) {
    return new Error(
      'Claude is temporarily overloaded. Please wait a few seconds and try again.'
    );
  }

  if (status === 429) {
    return new Error(
      'Claude is rate-limited right now. Please wait a moment and try again.'
    );
  }

  return new Error(`Claude API ${status}: ${errBody}`);
}

async function callClaudeOnce(images, promptText, maxTokens = 1200) {
  const imageBlocks = images.map((img) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimeType || 'image/jpeg',
      data: img.base64,
    },
  }));

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: promptText,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => 'no body');
    throw buildFriendlyApiError(response.status, errBody);
  }

  const data = await response.json();
  const text = data.content?.map((b) => b.text || '').join('') || '{}';
  return safeParseLead(text);
}

async function callClaude(images, promptText, maxTokens = 1200) {
  const retryDelays = [1200, 2500, 4500];

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await callClaudeOnce(images, promptText, maxTokens);
    } catch (err) {
      const msg = String(err?.message || '');

      const retryable =
        msg.includes('temporarily overloaded') ||
        msg.includes('rate-limited right now');

      if (!retryable || attempt === retryDelays.length) {
        throw err;
      }

      await delay(retryDelays[attempt]);
    }
  }

  throw new Error('Claude request failed.');
}

function buildPrimaryPrompt() {
  return `You are a lead extraction and enrichment system.

Analyze all provided images together. These may include:
- the front and back of a business card
- a storefront or sign
- a screenshot containing business/contact information

Your job:
- combine information across all images into ONE lead record
- use the clearest and most complete version of duplicate values
- identify contact first and last names separately when possible
- extract business name, contact details, and address details
- do not invent information
- if uncertain, leave the field blank and mention uncertainty in notes
- normalize phone to (XXX) XXX-XXXX when possible
- use a 2-letter state abbreviation when possible

Return ONLY a raw JSON object with NO markdown, no backticks, and no extra text.

Use exactly these keys:
{
  "businessName": "",
  "pocFirst": "",
  "pocLast": "",
  "phone": "",
  "email": "",
  "streetNumber": "",
  "streetName": "",
  "addressLine2": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": "high|medium|low",
  "notes": ""
}`;
}

function buildSecondaryPrompt(primaryResult) {
  return `You already made an initial extraction, but some important fields may still be missing or unclear.

Initial extraction:
${JSON.stringify(primaryResult, null, 2)}

Look at the same images again and perform a second-pass enrichment.

Focus especially on:
- hidden or small-print phone numbers
- email addresses
- street address details
- city, state, zip
- contact person name and title
- text on the back side of business cards
- partial or split lines that may belong together

Rules:
- do not invent information
- if a field truly is not visible, leave it blank
- prefer improving missing or uncertain fields
- use notes to explain uncertainty or ambiguities
- normalize phone to (XXX) XXX-XXXX when possible
- use 2-letter state abbreviation when possible

Return ONLY a raw JSON object with NO markdown, no backticks, and no extra text.

Use exactly these keys:
{
  "businessName": "",
  "pocFirst": "",
  "pocLast": "",
  "phone": "",
  "email": "",
  "streetNumber": "",
  "streetName": "",
  "addressLine2": "",
  "city": "",
  "state": "",
  "zip": "",
  "confidence": "high|medium|low",
  "notes": ""
}`;
}

export async function extractLeadFromImages(images = []) {
  if (!Array.isArray(images) || images.length === 0) {
    throw new Error('No images were provided for extraction.');
  }

  const primary = await callClaude(images, buildPrimaryPrompt(), 1200);

  const missingFields = missingImportantFields(primary);
  if (missingFields.length === 0) {
    return {
      ...primary,
      phone: normalizePhone(primary.phone),
      state: normalizeState(primary.state),
      zip: normalizeZip(primary.zip),
      email: cleanString(primary.email).toLowerCase(),
    };
  }

  const secondary = await callClaude(images, buildSecondaryPrompt(primary), 1200);
  const merged = mergeLeadResults(primary, secondary);

  if (missingFields.length > 0) {
    const notePrefix = `Second-pass enrichment ran for missing fields: ${missingFields.join(', ')}`;
    merged.notes = mergeNotes(notePrefix, merged.notes);
  }

  return merged;
}

export async function extractLeadFromImage(base64Image, mimeType = 'image/jpeg') {
  return extractLeadFromImages([{ base64: base64Image, mimeType }]);
}