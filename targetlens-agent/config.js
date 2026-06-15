/**
 * TargetLens Agent Configuration
 */

const LOOKBACK_BUCKETS = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '120d': 120,
};

const DEFAULT_LOOKBACK = '90d';

const SUPABASE_PROJECT_ID = 'qkbvwryucaakkkqaqvka';

const PROPERTY_TAX_SOURCES = {
  tx: {
    harris: { url: 'https://pdata.hcad.org/data/', county: 'Harris' },
    tarrant: { url: 'https://www.tad.org/', county: 'Tarrant' },
    dallas: { url: 'https://www.dallascad.org/SearchAddr.aspx', county: 'Dallas' },
    travis: { url: 'https://traviscad.org/', county: 'Travis' },
  },
  ma: {
    massgis: { url: 'https://arcgis.com/sharing/rest/content/items/', county: 'All' },
    masslandrecords: { url: 'https://www.masslandrecords.com/', county: 'All' },
  },
};

const MLS_SOURCES = {
  redfin: {
    baseUrl: 'https://www.redfin.com/stingray/api/gis-csv',
    params: { al: 1, status: 9, uipt: '1,2', num_homes: 350 },
  },
  zillow: {
    url: 'https://files.zillowstatic.com/research/public_csvs/recently_sold/recently_sold_zip.csv',
  },
};

const HUD_VACANCY_URL = 'https://www.huduser.gov/apps/public/usps/download';

const MA_USE_CODES = {
  TARGET: ['101', '102'],
  RENTAL: ['103', '104', '105', '106', '107', '108', '109'],
  EXCLUDE: (code) => parseInt(code, 10) >= 300,
};

const INVESTOR_PATTERNS = [
  /LLC/i,
  /L\.L\.C/i,
  /INC\.?$/i,
  /CORP\.?$/i,
  /TRUST/i,
  /HOLDINGS/i,
  /PROPERTIES/i,
  /INVESTMENTS/i,
  /REALTY/i,
  /PARTNERS/i,
];

module.exports = {
  LOOKBACK_BUCKETS,
  DEFAULT_LOOKBACK,
  SUPABASE_PROJECT_ID,
  PROPERTY_TAX_SOURCES,
  MLS_SOURCES,
  HUD_VACANCY_URL,
  MA_USE_CODES,
  INVESTOR_PATTERNS,
};
