/**
 * Business Card Data Extraction Service
 * Extracts phone, email, URLs, addresses, and social media from OCR'd business card text
 * Optimized for speed and reliability
 */

// Phone number regex patterns (US + international)
const PHONE_PATTERNS = [
  /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/gi,
  /(\+?[1-9]\d{1,14})/g, // International E.164 format
];

// Email pattern
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

// URL patterns (websites + social media)
const URL_PATTERNS = {
  website: /https?:\/\/[^\s]+|www\.[^\s]+/gi,
  linkedin: /(?:linkedin\.com\/in\/|linkedin\.com\/company\/)[^\s]+/gi,
  twitter: /@[a-zA-Z0-9_]{1,15}/g,
  facebook: /(?:facebook\.com\/|fb\.com\/)[^\s]+/gi,
  instagram: /@[a-zA-Z0-9_.]{1,30}|instagram\.com\/[^\s]+/gi,
  github: /github\.com\/[^\s]+/gi,
};

// Address indicators
const ADDRESS_KEYWORDS = ['st', 'street', 'ave', 'avenue', 'rd', 'road', 'blvd', 'boulevard', 'ln', 'lane', 'dr', 'drive', 'ct', 'court', 'way', 'suite', 'ste', '#'];

/**
 * Extract phone numbers from text
 * @param {string} text - OCR'd text from business card
 * @returns {array} Array of phone numbers found
 */
export function extractPhoneNumbers(text) {
  if (!text) return [];
  
  const phones = new Set();
  
  for (const pattern of PHONE_PATTERNS) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const cleaned = match[0]
        .replace(/[\s.()-]/g, '') // Remove formatting
        .replace(/^1/, ''); // Remove leading 1 for US numbers
      
      if (cleaned.length >= 10) {
        phones.add(cleaned);
      }
    }
  }
  
  return Array.from(phones);
}

/**
 * Extract email addresses from text
 * @param {string} text - OCR'd text
 * @returns {array} Array of emails found
 */
export function extractEmails(text) {
  if (!text) return [];
  
  const emails = new Set();
  let match;
  
  while ((match = EMAIL_PATTERN.exec(text)) !== null) {
    const email = match[0].toLowerCase();
    // Filter out common false positives
    if (!email.includes('..') && !email.endsWith('.')) {
      emails.add(email);
    }
  }
  
  return Array.from(emails);
}

/**
 * Extract websites and social media URLs
 * @param {string} text - OCR'd text
 * @returns {object} { websites, social: { linkedin, twitter, facebook, instagram, github } }
 */
export function extractURLs(text) {
  if (!text) return { websites: [], social: {} };
  
  const websites = new Set();
  const social = {
    linkedin: [],
    twitter: [],
    facebook: [],
    instagram: [],
    github: [],
  };
  
  // Extract websites
  let match;
  while ((match = URL_PATTERNS.website.exec(text)) !== null) {
    websites.add(match[0]);
  }
  
  // Extract social media
  for (const [platform, pattern] of Object.entries(URL_PATTERNS)) {
    if (platform === 'website') continue;
    
    while ((match = pattern.exec(text)) !== null) {
      if (social[platform]) {
        social[platform].push(match[0]);
      }
    }
  }
  
  return {
    websites: Array.from(websites),
    social: {
      linkedin: [...new Set(social.linkedin)],
      twitter: [...new Set(social.twitter)],
      facebook: [...new Set(social.facebook)],
      instagram: [...new Set(social.instagram)],
      github: [...new Set(social.github)],
    },
  };
}

/**
 * Extract potential addresses from text
 * @param {string} text - OCR'd text
 * @returns {array} Array of lines that might be addresses
 */
export function extractAddresses(text) {
  if (!text) return [];
  
  const lines = text.split('\n');
  const addresses = [];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Check if line contains address keywords
    const hasAddressKeyword = ADDRESS_KEYWORDS.some(keyword => lowerLine.includes(keyword));
    
    // Check if line has numbers and text (typical address pattern)
    const hasNumbers = /\d/.test(line);
    const hasText = /[a-zA-Z]/.test(line);
    
    if (hasAddressKeyword && hasNumbers && hasText && line.length > 10) {
      addresses.push(line.trim());
    }
  }
  
  return addresses;
}

/**
 * Extract potential points of contact (names + titles)
 * @param {string} text - OCR'd text
 * @returns {object} { names: [], titles: [] }
 */
export function extractPointsOfContact(text) {
  if (!text) return { names: [], titles: [] };
  
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const names = [];
  const titles = [];
  
  // Common title keywords
  const titleKeywords = [
    'manager', 'director', 'owner', 'operator', 'manager', 'supervisor',
    'president', 'ceo', 'cto', 'cfo', 'vice', 'executive', 'specialist',
    'representative', 'coordinator', 'analyst', 'technician', 'inspector',
    'pest', 'sales', 'account', 'business', 'development', 'partner'
  ];
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Skip if line is email, phone, url, or address
    if (EMAIL_PATTERN.test(line) || /\d{3}[-.\s]?\d{3}/.test(line) || 
        ADDRESS_KEYWORDS.some(kw => lowerLine.includes(kw))) {
      continue;
    }
    
    // If line contains title keyword, it's likely a title
    if (titleKeywords.some(keyword => lowerLine.includes(keyword))) {
      titles.push(line);
    }
    // If line is short and has capital letters, might be a name
    else if (line.length < 40 && /^[A-Z][a-z]+ [A-Z]/.test(line)) {
      names.push(line);
    }
  }
  
  return {
    names: [...new Set(names)],
    titles: [...new Set(titles)],
  };
}

/**
 * Comprehensive business card extraction
 * Returns all extracted data in one call
 * @param {string} ocrText - Full OCR'd text from business card
 * @returns {object} All extracted data
 */
export function extractBusinessCardData(ocrText) {
  if (!ocrText || typeof ocrText !== 'string') {
    return {
      phones: [],
      emails: [],
      websites: [],
      social: {},
      addresses: [],
      contacts: { names: [], titles: [] },
      rawText: ocrText,
    };
  }
  
  const urls = extractURLs(ocrText);
  const contacts = extractPointsOfContact(ocrText);
  
  return {
    phones: extractPhoneNumbers(ocrText),
    emails: extractEmails(ocrText),
    websites: urls.websites,
    social: urls.social,
    addresses: extractAddresses(ocrText),
    contacts: {
      names: contacts.names,
      titles: contacts.titles,
    },
    rawText: ocrText,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Validate and format extracted data
 * @param {object} extractedData - Data from extractBusinessCardData
 * @returns {object} Cleaned and validated data
 */
export function validateExtractedData(extractedData) {
  return {
    ...extractedData,
    phones: extractedData.phones.filter(p => p.length >= 10),
    emails: extractedData.emails.filter(e => e.includes('@')),
    websites: extractedData.websites.filter(w => w.length > 0),
    addresses: extractedData.addresses.filter(a => a.length > 5),
    contacts: {
      names: extractedData.contacts.names.slice(0, 5), // Top 5
      titles: extractedData.contacts.titles.slice(0, 5),
    },
  };
}
