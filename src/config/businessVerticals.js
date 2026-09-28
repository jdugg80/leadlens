// src/config/businessVerticals.js
//
// SINGLE SOURCE OF TRUTH for "what kind of business is this?".
// Feeds three places that used to keep their own, disagreeing lists:
//   1. the Territory Map filter chips  (LeadFiltersBottomSheet, via FILTER_TYPE_CHIPS)
//   2. Nearby Search result classification (nearbySearch.js -> classifyGooglePlace -> classifyPlace)
//   3. Prospect Around's server-side type filter (prospectVerticals.js -> includedTypes)
//
// Every entry in `types` is a Google Places API (New) "Table A" type, verified against Google's
// published table (last updated 2026-09-24). Table A is the only table usable for filtering
// (includedTypes, max 50 per request); Table B values (food, health, finance, establishment,
// point_of_interest, general_contractor, place_of_worship) are response-only, so they are NEVER
// used to filter and are only used as last-resort classification fallbacks below.
//
// Order matters: when a place has several matching types (and its primary type didn't decide it),
// the first vertical in this list wins.

export const OTHER_VERTICAL = 'Other';
export const ALL_BUSINESSES = 'All Businesses';

export const BUSINESS_VERTICALS = [
  {
    id: 'restaurants',
    name: 'Restaurants & Food Service',
    types: ['restaurant', 'bakery', 'bar', 'bar_and_grill', 'cafe', 'cafeteria', 'coffee_shop', 'deli', 'diner', 'bistro',
      'fast_food_restaurant', 'food_court', 'ice_cream_shop', 'juice_shop', 'meal_delivery', 'meal_takeaway', 'pizza_delivery',
      'pub', 'sandwich_shop', 'snack_bar', 'brewery', 'winery', 'catering_service', 'donut_shop', 'bagel_shop', 'dessert_shop',
      'pastry_shop', 'buffet_restaurant', 'tea_house', 'wine_bar', 'sports_bar', 'cocktail_bar', 'brewpub', 'gastropub', 'beer_garden'],
    // real Table A types that don't need a search filter but should still classify here
    extraClassifyTypes: ['steak_house', 'noodle_shop', 'salad_shop', 'kebab_shop', 'hot_dog_stand', 'hookah_bar', 'irish_pub',
      'lounge_bar', 'acai_shop', 'coffee_stand', 'confectionery', 'food_delivery'],
    nameKeywords: ['restaurant', 'grill', 'grille', 'cafe', 'café', 'coffee', 'pizza', 'pizzeria', 'taqueria', 'taco', 'tacos',
      'burger', 'burgers', 'bbq', 'barbecue', 'bakery', 'donut', 'doughnut', 'sushi', 'steakhouse', 'steak house', 'wings',
      'diner', 'deli', 'sandwich', 'bistro', 'cantina', 'kitchen', 'eatery', 'brewery', 'brewing', 'tavern', 'pub', 'bar',
      'seafood', 'noodle', 'ramen', 'pho', 'ice cream', 'creamery', 'juice', 'smoothie', 'catering', 'chicken', 'whataburger',
      'mcdonald', 'popeyes', 'subway', 'wendy', 'sonic drive', 'dairy queen', 'domino', 'kfc', 'taco bell', 'chick-fil-a', 'ihop', 'denny'],
  },
  {
    id: 'lodging',
    name: 'Hotels & Lodging',
    types: ['hotel', 'motel', 'lodging', 'inn', 'resort_hotel', 'extended_stay_hotel', 'hostel', 'guest_house', 'bed_and_breakfast',
      'campground', 'rv_park', 'private_guest_room', 'cottage', 'camping_cabin', 'farmstay'],
    nameKeywords: ['hotel', 'motel', 'inn', 'suites', 'lodge', 'lodging', 'resort', 'hostel', 'bed & breakfast', 'bed and breakfast',
      'extended stay', 'marriott', 'hilton', 'motel 6', 'best western', 'la quinta', 'days inn', 'super 8', 'comfort inn'],
  },
  {
    id: 'grocery',
    name: 'Grocery & Convenience',
    types: ['supermarket', 'grocery_store', 'convenience_store', 'food_store', 'discount_supermarket', 'hypermarket',
      'asian_grocery_store', 'butcher_shop', 'health_food_store'],
    extraClassifyTypes: ['farmers_market'],
    nameKeywords: ['grocery', 'supermarket', 'supercenter', 'h-e-b', 'heb', 'kroger', 'aldi', 'fiesta mart', 'food mart', 'food store',
      'convenience', '7-eleven', '7 eleven', 'circle k', 'minit mart', 'mini mart', 'quick stop', 'butcher', 'meat market'],
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Veterinary',
    types: ['hospital', 'general_hospital', 'medical_center', 'medical_clinic', 'doctor', 'dentist', 'dental_clinic', 'pharmacy',
      'drugstore', 'physiotherapist', 'chiropractor', 'medical_lab', 'skin_care_clinic', 'wellness_center', 'veterinary_care'],
    fallbackTypes: ['health'], // Table B, generic: only used when nothing more specific matched
    nameKeywords: ['hospital', 'clinic', 'medical', 'dental', 'dentist', 'dentures', 'orthodontics', 'orthodontist', 'pharmacy', 'cvs', 'walgreens',
      'urgent care', 'physician', 'doctor', 'chiropractic', 'chiropractor', 'physical therapy', 'therapy', 'pediatric', 'veterinary', 'veterinarian', 'animal hospital',
      'animal clinic', 'health', 'wellness', 'optical', 'eye care', 'dialysis', 'laboratory', 'patient'],
  },
  {
    id: 'schools',
    name: 'Schools & Childcare',
    types: ['school', 'primary_school', 'secondary_school', 'preschool', 'university', 'educational_institution',
      'academic_department', 'research_institute', 'child_care_agency', 'summer_camp_organizer'],
    nameKeywords: ['school', { re: 'academy(?!\\s+sports)' }, 'elementary', 'university', 'college', 'daycare', 'day care', 'child care',
      'childcare', 'preschool', 'learning center', 'montessori', 'kindercare', 'tutoring', 'isd'],
  },
  {
    id: 'government',
    name: 'Government & Public Services',
    types: ['city_hall', 'courthouse', 'government_office', 'local_government_office', 'post_office', 'police', 'fire_station',
      'embassy', 'library', 'community_center'],
    nameKeywords: ['city of', 'county', 'courthouse', 'post office', 'police', 'fire department', 'fire station', 'library', 'municipal',
      'department of public safety', 'social security', 'sheriff', 'tax office', 'town of', 'city hall'],
  },
  {
    id: 'religious',
    name: 'Religious & Nonprofit',
    types: ['church', 'mosque', 'synagogue', 'hindu_temple', 'buddhist_temple', 'shinto_shrine', 'cemetery', 'funeral_home',
      'non_profit_organization', 'association_or_organization'],
    fallbackTypes: ['place_of_worship'], // Table B, generic
    nameKeywords: ['church', 'baptist', 'methodist', 'catholic', 'lutheran', 'presbyterian', 'pentecostal', 'mosque', 'synagogue',
      'temple', 'ministries', 'ministry', 'chapel', 'cathedral', 'funeral', 'cemetery', 'worship', 'congregation', 'parish',
      'salvation army', 'food bank', 'habitat for humanity'],
  },
  {
    id: 'multifamily',
    name: 'Apartments & Multifamily',
    types: ['apartment_building', 'apartment_complex', 'condominium_complex', 'housing_complex', 'mobile_home_park'],
    // Google has no type for these, so they are only ever found by name
    nameKeywords: ['apartments', 'apartment', 'apts', 'residences', 'villas', 'townhomes', 'townhouses', 'lofts', 'condominiums',
      'condos', 'manor', 'assisted living', 'senior living', 'nursing home', 'nursing center', 'retirement community', 'mobile home'],
  },
  {
    id: 'offices',
    name: 'Offices & Professional Services',
    types: ['corporate_office', 'business_center', 'coworking_space', 'lawyer', 'accounting', 'bank', 'atm', 'insurance_agency',
      'real_estate_agency', 'consultant', 'marketing_consultant', 'employment_agency', 'telecommunications_service_provider',
      'travel_agency', 'tour_agency', 'television_studio'],
    fallbackTypes: ['finance'], // Table B, generic
    nameKeywords: ['law office', 'attorney', 'lawyer', 'insurance', 'realty', 'real estate', 'bank', 'credit union', 'accounting',
      'cpa', 'tax service', 'financial', 'title company', 'mortgage', 'consulting', 'staffing', 'advertising', 'marketing',
      'engineering', 'architect', 'notary', 'coworking'],
  },
  {
    id: 'retail',
    name: 'Retail (non-food)',
    types: ['department_store', 'discount_store', 'warehouse_store', 'shopping_mall', 'clothing_store', 'furniture_store',
      'electronics_store', 'hardware_store', 'home_improvement_store', 'home_goods_store', 'garden_center', 'pet_store',
      'book_store', 'jewelry_store', 'liquor_store', 'gift_shop', 'thrift_store', 'sporting_goods_store', 'toy_store',
      'cell_phone_store', 'cosmetics_store', 'general_store', 'market', 'flea_market', 'shoe_store', 'bicycle_store', 'florist',
      'cake_shop', 'candy_store', 'chocolate_shop', 'store'],
    extraClassifyTypes: ['sportswear_store', 'tea_store', 'womens_clothing_store'],
    nameKeywords: ['store', 'shop', 'outlet', 'boutique', 'mall', 'dollar', 'walmart', 'target', "lowe's", 'home depot', 'hobby lobby',
      "kohl's", 'kohl', 'academy sports', 'best buy', 'ross', 'tj maxx', 'marshalls', 'michaels', 'petco', 'petsmart', 'big lots',
      'tractor supply', 'hardware', 'furniture', 'mattress', 'jewelry', 'florist', 'liquor', "spec's", 'gamestop', 'five below'],
  },
  {
    id: 'automotive',
    name: 'Automotive',
    types: ['car_dealer', 'car_rental', 'car_repair', 'car_wash', 'gas_station', 'auto_parts_store', 'tire_shop', 'truck_dealer',
      'electric_vehicle_charging_station'],
    extraClassifyTypes: ['rest_stop'],
    nameKeywords: ['auto', 'automotive', 'tire', 'tires', 'car wash', 'collision', 'dealership', 'motors', 'toyota', 'ford', 'chevrolet',
      'chevy', 'honda', 'nissan', 'jeep', 'dodge', 'kia', 'hyundai', 'subaru', 'mazda', 'bmw', 'mercedes', 'lexus', 'audi',
      'volkswagen', 'jiffy lube', 'valvoline', "o'reilly", 'autozone', 'napa', 'advance auto', 'pep boys', 'shell', 'exxon',
      'chevron', 'valero', "buc-ee's", "love's", 'gas station', 'truck stop', 'oil change', 'transmission', 'body shop', 'towing'],
  },
  {
    id: 'logistics',
    name: 'Warehousing, Logistics & Transportation',
    types: ['storage', 'moving_company', 'courier_service', 'shipping_service', 'wholesaler', 'supplier', 'building_materials_store',
      'truck_stop', 'transit_depot', 'transportation_service', 'taxi_service', 'airport', 'international_airport', 'bus_station',
      'train_station', 'subway_station', 'transit_station', 'ferry_terminal'],
    nameKeywords: ['warehouse', 'storage', 'logistics', 'freight', 'distribution', 'moving', 'movers', 'trucking', 'shipping', 'courier',
      'fedex', 'cargo', 'wholesale', 'depot'],
  },
  {
    id: 'manufacturing',
    name: 'Manufacturing & Agriculture',
    types: ['manufacturer', 'farm', 'ranch', 'chocolate_factory', 'coffee_roastery', 'vineyard'],
    nameKeywords: ['manufacturing', 'mfg', 'factory', 'plant', 'industries', 'industrial', 'fabrication', 'farm', 'ranch', 'processing',
      'packing', 'foundry', 'chemical'],
  },
  {
    id: 'trades',
    name: 'Trades & Contractors',
    types: ['electrician', 'plumber', 'roofing_contractor', 'locksmith', 'painter'],
    fallbackTypes: ['general_contractor'], // Table B: response-only, so it can never be sent as a search filter
    nameKeywords: ['plumbing', 'plumber', 'electric', 'electrical', 'electrician', 'roofing', 'roofer', 'hvac', 'heating',
      'air conditioning', 'contractor', 'contracting', 'construction', 'painting', 'locksmith', 'landscaping', 'landscape', 'irrigation', 'remodel',
      'builders', 'concrete', 'fence', 'flooring', 'cabinet'],
  },
  {
    id: 'personal',
    name: 'Personal Services & Wellness',
    types: ['hair_salon', 'hair_care', 'beauty_salon', 'nail_salon', 'barber_shop', 'beautician', 'spa', 'massage', 'massage_spa',
      'sauna', 'tanning_studio', 'yoga_studio', 'laundry', 'tailor', 'body_art_service', 'pet_care', 'pet_boarding_service',
      'foot_care', 'makeup_artist'],
    nameKeywords: ['salon', 'spa', 'barber', 'barbershop', 'barber shop', 'nail', 'nails', 'beauty', 'massage', 'laundry', 'laundromat', 'cleaners', 'dry clean',
      'tattoo', 'grooming', 'tanning', 'hair', 'lash', 'waxing', 'tailor'],
  },
  {
    id: 'entertainment',
    name: 'Fitness, Entertainment & Venues',
    types: ['gym', 'fitness_center', 'sports_club', 'sports_complex', 'stadium', 'arena', 'event_venue', 'banquet_hall',
      'wedding_venue', 'convention_center', 'movie_theater', 'casino', 'bowling_alley', 'amusement_park', 'water_park', 'zoo',
      'aquarium', 'museum', 'art_gallery', 'performing_arts_theater', 'concert_hall', 'night_club', 'comedy_club',
      'live_music_venue', 'amusement_center', 'video_arcade', 'golf_course', 'marina', 'sports_school'],
    extraClassifyTypes: ['swimming_pool'],
    nameKeywords: ['gym', 'fitness', 'crossfit', 'yoga', 'pilates', 'stadium', 'theater', 'theatre', 'cinema', 'bowling', 'casino',
      'museum', 'arena', 'event center', 'banquet', 'ballroom', 'venue', 'amusement', 'zoo', 'aquarium', 'golf', 'skating',
      'trampoline', 'arcade', 'escape room'],
  },
];

export const VERTICAL_NAMES = BUSINESS_VERTICALS.map((v) => v.name);

// Chips for the filter sheet: "All Businesses", every vertical, then "Other".
export const FILTER_TYPE_CHIPS = [ALL_BUSINESSES, ...VERTICAL_NAMES, OTHER_VERTICAL];

export function isValidFilterType(name) {
  return FILTER_TYPE_CHIPS.includes(name);
}

// Generic Google types that describe almost anything -- ignored in the specific passes so they
// can't drag a hospital into "Office" (via `health`) or a supermarket into "Restaurants" (via `food`).
const GENERIC_TYPES = new Set(['food', 'health', 'finance', 'store', 'establishment', 'point_of_interest', 'service',
  'place_of_worship', 'general_contractor', 'geocode', 'premise', 'political', 'landmark']);

const isRestaurantType = (t) => t === 'restaurant' || (typeof t === 'string' && t.endsWith('_restaurant'));

// type -> vertical name (first vertical in list order wins on any duplicate)
const TYPE_TO_VERTICAL = (() => {
  const m = new Map();
  BUSINESS_VERTICALS.forEach((v) => {
    [...v.types, ...(v.extraClassifyTypes || [])].forEach((t) => { if (!m.has(t)) m.set(t, v.name); });
  });
  return m;
})();

const FALLBACK_TO_VERTICAL = (() => {
  const m = new Map();
  BUSINESS_VERTICALS.forEach((v) => (v.fallbackTypes || []).forEach((t) => { if (!m.has(t)) m.set(t, v.name); }));
  m.set('store', 'Retail (non-food)');
  return m;
})();

const RESTAURANTS = BUSINESS_VERTICALS[0].name;

function verticalForType(t) {
  if (!t) return null;
  if (isRestaurantType(t)) return RESTAURANTS;
  if (GENERIC_TYPES.has(t)) return null;
  return TYPE_TO_VERTICAL.get(t) || null;
}

/**
 * Classify a Google place (New API shape: { primaryType, types }) into a vertical name.
 *  1. primary type decides if it maps to a vertical
 *  2. otherwise the first vertical (in list order) matching any non-generic type
 *  3. otherwise generic fallbacks (store, health, finance, place_of_worship, general_contractor)
 *  4. otherwise 'Other'
 */
export function classifyPlace(place) {
  const primary = verticalForType(place?.primaryType);
  if (primary) return primary;
  const types = Array.isArray(place?.types) ? place.types : [];
  let best = null; let bestIdx = Infinity;
  types.forEach((t) => {
    const v = verticalForType(t);
    if (v) {
      const idx = VERTICAL_NAMES.indexOf(v);
      if (idx < bestIdx) { best = v; bestIdx = idx; }
    }
  });
  if (best) return best;
  for (const t of [place?.primaryType, ...types]) {
    if (t && FALLBACK_TO_VERTICAL.has(t)) return FALLBACK_TO_VERTICAL.get(t);
  }
  return OTHER_VERTICAL;
}

// ---- name-based guess (for leads that never had Google types, e.g. camera scans) ----
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAME_MATCHERS = BUSINESS_VERTICALS.map((v) => {
  const parts = (v.nameKeywords || []).map((k) => (typeof k === 'string' ? escapeRe(k.toLowerCase()) : k.re));
  return { name: v.name, re: parts.length ? new RegExp(`(?:^|[^a-z0-9])(?:${parts.join('|')})(?:s|es)?(?![a-z0-9])`, 'i') : null };
});

export function classifyByName(text) {
  const t = String(text || '').toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t) return null;
  for (const m of NAME_MATCHERS) if (m.re && m.re.test(t)) return m.name;
  return null;
}

/**
 * Classify a saved lead. Order: stored businessVertical -> stored Google types -> name guess -> Other.
 * (Saved leads used to be run through the Google-type classifier with no types, so every lead
 *  came back 'Other' and any Business Type chip hid all of them.)
 */
export function classifyLead(lead) {
  if (!lead) return OTHER_VERTICAL;
  if (lead.businessVertical && VERTICAL_NAMES.includes(lead.businessVertical)) return lead.businessVertical;
  const types = Array.isArray(lead.googleTypes) ? lead.googleTypes : (Array.isArray(lead.types) ? lead.types : []);
  if (lead.primaryType || types.length) {
    const v = classifyPlace({ primaryType: lead.primaryType, types });
    if (v !== OTHER_VERTICAL) return v;
  }
  return classifyByName([lead.businessName, lead.name].filter(Boolean).join(' ')) || OTHER_VERTICAL;
}

export default BUSINESS_VERTICALS;
