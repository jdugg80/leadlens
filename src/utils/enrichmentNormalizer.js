import { fetchPlaceDetails, searchGooglePlacesByText } from './nearbySearch';
import { enrichProspectWithComptroller } from '../services/comptrollerEnrichment';
import { enrichMissingPOC } from './socialEnrichment';
import { searchHealthViolations } from './healthDepartmentService';
import { getPropertyRecord } from './propertyRecordsService';

export function normalizePhone(value) {
  if (!value) return "";

  const digits = String(value).replace(/\D/g, "");

  // Handle 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith("1")) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // Handle 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Handle international numbers from Google (+1 512-555-1212)
  if (String(value).startsWith("+1")) {
    const sub = String(value).replace(/^\+1\s*/, "").replace(/\D/g, "");
    if (sub.length === 10) {
        return `(${sub.slice(0, 3)}) ${sub.slice(3, 6)}-${sub.slice(6)}`;
    }
  }

  return String(value).trim();
}

export function extractBestPhone(...sources) {
  const flatSources = sources.flat().filter(Boolean);

  const possiblePhones = [];

  for (const source of flatSources) {
    // Top level phone fields
    possiblePhones.push(
      source.phone,
      source.phoneNumber,
      source.primaryPhone,
      source.formatted_phone_number,
      source.formattedPhoneNumber,
      source.nationalPhoneNumber,
      source.international_phone_number,
      source.internationalPhoneNumber,
      source.businessPhone,
      source.officePhone
    );

    // Deep nested fields
    possiblePhones.push(
      source.contact?.phone,
      source.details?.phone,
      source.details?.formatted_phone_number,
      source.details?.international_phone_number,
      source.placeDetails?.formatted_phone_number,
      source.placeDetails?.international_phone_number,
      source.placeDetails?.nationalPhoneNumber,
      source.googlePlace?.formatted_phone_number,
      source.googlePlace?.international_phone_number,
      source.googlePlace?.nationalPhoneNumber,
      source.publicRecord?.phone,
      source.comptrollerRecord?.phone,
      source.texasComptroller?.phone,
      source.websiteContact?.phone
    );

    // Raw record fields (from Supabase/LensSignal)
    if (source.raw_record) {
        possiblePhones.push(
            source.raw_record.phone,
            source.raw_record.phone_number,
            source.raw_record.contact_phone,
            source.raw_record.business_phone,
            source.raw_record.phoneNumber
        );
    }

    if (Array.isArray(source.contacts)) {
      source.contacts.forEach(c => {
        possiblePhones.push(c.phone, c.phoneNumber, c.mobile, c.officePhone);
      });
    }

    if (Array.isArray(source.contactCandidates)) {
      source.contactCandidates.forEach(c => {
        possiblePhones.push(c.phone, c.phoneNumber, c.mobile, c.officePhone);
      });
    }
  }

  const found = possiblePhones.find(Boolean);
  return found ? normalizePhone(found) : "";
}

export function splitPersonName(name) {
  const cleaned = String(name || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return {
      fullName: "",
      firstName: "",
      lastName: "",
    };
  }

  const parts = cleaned.split(" ");

  if (parts.length === 1) {
    return {
      fullName: cleaned,
      firstName: cleaned,
      lastName: "",
    };
  }

  return {
    fullName: cleaned,
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function normalizeContactCandidates(...sources) {
  const flatSources = sources.flat().filter(Boolean);
  const candidates = [];

  for (const source of flatSources) {
    const arrays = [
      source.contacts,
      source.contactCandidates,
      source.possibleContacts,
      source.pocCandidates,
      source.people,
      source.officers,
      source.owners,
      source.managers,
      source.publicRecord?.contacts,
      source.publicRecord?.officers,
      source.publicRecord?.owners,
      source.comptrollerRecord?.contacts,
      source.comptrollerRecord?.officers,
      source.texasComptroller?.contacts,
      source.texasComptroller?.officers,
    ].filter(Array.isArray);

    for (const arr of arrays) {
      arr.forEach((c, index) => {
        candidates.push({
          id: c.id || c.contact_id || c.personId || `contact-${c.name || c.fullName || index}`,
          name:
            c.name ||
            c.fullName ||
            c.pocName ||
            c.person_name ||
            c.ownerName ||
            c.registeredAgentName ||
            c.officerName ||
            "",
          title:
            c.title ||
            c.role ||
            c.position ||
            c.relationship ||
            c.office ||
            "",
          phone: normalizePhone(c.phone || c.phoneNumber || c.mobile || c.officePhone || ""),
          email: c.email || c.emailAddress || "",
          source:
            c.source ||
            c.sourceName ||
            c.url ||
            source.source ||
            source.sourceName ||
            "",
          sourceUrl:
            c.sourceUrl ||
            c.url ||
            source.sourceUrl ||
            source.url ||
            "",
          confidence: c.confidence ?? c.score ?? null,
          raw: c,
        });
      });
    }

    const directNames = [
      {
        name: source.poc || source.pocName,
        title: "Possible Contact",
        source: source.source || "",
      },
      {
        name: source.contactName || source.primaryContact,
        title: "Possible Contact",
        source: source.source || "",
      },
      {
        name: source.ownerName || source.businessRecord?.ownerName || source.publicRecord?.ownerName,
        title: "Owner / Public Record Contact",
        source: source.source || "Public Record",
      },
      {
        name:
          source.registeredAgent ||
          source.registeredAgentName ||
          source.businessRecord?.registeredAgent ||
          source.publicRecord?.registeredAgent ||
          source.comptrollerRecord?.registeredAgent ||
          source.texasComptroller?.registeredAgent,
        title: "Registered Agent / Public Record Contact",
        source: source.source || "Public Record",
      },
      {
        name:
          source.officerName ||
          source.businessRecord?.officerName ||
          source.publicRecord?.officerName ||
          source.comptrollerRecord?.officerName,
        title: "Officer / Public Record Contact",
        source: source.source || "Public Record",
      },
    ];

    directNames
      .filter(item => item.name)
      .forEach(item => {
        candidates.push({
          id: `direct-${item.name}`,
          name: item.name,
          title: item.title,
          phone: "",
          email: "",
          source: item.source,
          sourceUrl: source.sourceUrl || source.url || "",
          confidence: null,
          raw: item,
        });
      });
  }

  const deduped = [];
  const seen = new Set();

  for (const c of candidates) {
    const key = `${String(c.name).toLowerCase()}|${String(c.phone).replace(/\D/g, "")}|${String(c.email).toLowerCase()}`;

    if (!seen.has(key) && (c.name || c.phone || c.email)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  return deduped;
}

export function extractBestPOC(...sources) {
  const candidates = normalizeContactCandidates(...sources);

  if (!candidates.length) return null;

  const preferred =
    candidates.find(c => /owner|manager|registered agent|officer|contact/i.test(c.title || "")) ||
    candidates[0];

  const parsed = splitPersonName(preferred.name);

  return {
    fullName: parsed.fullName,
    firstName: parsed.firstName,
    lastName: parsed.lastName,
    title: preferred.title || "",
    phone: preferred.phone || "",
    email: preferred.email || "",
    source: preferred.source || "",
    sourceUrl: preferred.sourceUrl || "",
    confidence: preferred.confidence ?? null,
    raw: preferred.raw || preferred,
  };
}

export function buildEnrichmentBundle(...sources) {
  const flatSources = sources.flat().filter(Boolean);

  const contacts = normalizeContactCandidates(flatSources);
  const primaryPhone = extractBestPhone(flatSources);
  const primaryPOC = extractBestPOC(flatSources);

  const phoneCandidates = [];
  const emailCandidates = [];

  for (const source of flatSources) {
    const possible = [
      source.phone,
      source.phoneNumber,
      source.primaryPhone,
      source.formatted_phone_number,
      source.formattedPhoneNumber,
      source.nationalPhoneNumber,
      source.international_phone_number,
      source.internationalPhoneNumber,
      source.businessPhone,
      source.officePhone,
      source.placeDetails?.formatted_phone_number,
      source.placeDetails?.international_phone_number,
      source.googlePlace?.formatted_phone_number,
      source.googlePlace?.international_phone_number,
      source.websiteContact?.phone,
      source.publicRecord?.phone,
      source.texasComptroller?.phone,
      source.comptrollerRecord?.phone,
    ].filter(Boolean);

    // Also check raw_record if it exists (from LensSignal)
    if (source.raw_record) {
      if (source.raw_record.phone) possible.push(source.raw_record.phone);
      if (source.raw_record.phone_number) possible.push(source.raw_record.phone_number);
      if (source.raw_record.contact_phone) possible.push(source.raw_record.contact_phone);
    }

    possible.forEach(phone => {
      const normalized = normalizePhone(phone);
      if (normalized) {
        phoneCandidates.push({
          phone: normalized,
          source: source.source || source.sourceName || "Enrichment",
          sourceUrl: source.sourceUrl || source.url || "",
        });
      }
    });

    const possibleEmails = [
      source.email,
      source.emailAddress,
      source.bestEmail,
      ...(source.discoveredEmails || []),
      ...(source.inferredEmails || []),
      ...(source.emailCandidates || []),
    ].filter(Boolean);

    possibleEmails.forEach(email => {
      emailCandidates.push(String(email).toLowerCase().trim());
    });
  }

  const dedupedPhones = [];
  const seenPhones = new Set();

  phoneCandidates.forEach(item => {
    const key = String(item.phone || "").replace(/\D/g, "");

    if (item.phone && !seenPhones.has(key)) {
      seenPhones.add(key);
      dedupedPhones.push(item);
    }
  });

  const finalEmailCandidates = [...new Set(emailCandidates)];

  return {
    primaryPhone,
    primaryPOC,
    contacts,
    pocCandidates: contacts,
    phoneCandidates: dedupedPhones,
    emailCandidates: finalEmailCandidates,
    sources: flatSources
      .map(source => ({
        name: source.source || source.sourceName || source.provider || "",
        url: source.sourceUrl || source.url || "",
        type: source.type || "",
      }))
      .filter(s => s.name || s.url || s.type),
    rawSources: flatSources,
    enrichedAt: new Date().toISOString(),
  };
}


/**
 * Enrichment Orchestrator: Combines Google, Texas Comptroller, and LensSignal/Website data
 * into a single unified bundle and applies it to the business object.
 *
 * @param {object} business - Business data with fields like businessName, city, state, zip, latitude, longitude
 * @param {object} [enrichContext] - Optional enrichment context with photoZip, locationSource, locationConfidence
 */
export async function enrichBusinessWithPublicSources(business, enrichContext = {}) {
  if (!business) return null;
  const sources = [];

  const photoZip = enrichContext.photoZip || business.photo_zip || null;
  const locationSource = enrichContext.locationSource || business.location_source || null;
  const locationConfidence = enrichContext.locationConfidence ?? business.location_confidence ?? null;

  console.log('[LeadLock Enrichment] Starting enrichment with context:', {
    businessName: business.businessName,
    zip: business.zip,
    photoZip,
    locationSource,
    locationConfidence,
  });

  // 1. Current available data
  sources.push({
    ...business,
    source: "Current Data",
    type: "local",
  });

  // 2. Google Places Details (Phone, Website, address components)
  let placeId = business.placeId || business.place_id || business.place_id;
  const businessName = business.businessName || business.establishment_name || business.business_name || business.name || "";

  // If no placeId, attempt to find it via text search
  if (!placeId && businessName.length > 2) {
    try {
      const searchCity = business.city || "";
      const searchState = business.state || "";
      const searchZip = business.zip || photoZip || "";
      const searchPhone = business.phone ? String(business.phone).replace(/\D/g, '') : "";

      // Strategy 1: Business name + zip (most specific)
      let query = `${businessName} ${searchZip}`.trim();
      let searchResults = null;
      if (searchZip) {
        searchResults = await searchGooglePlacesByText({
          query,
          center: business.latitude && business.longitude ? { latitude: business.latitude, longitude: business.longitude } : null,
          radiusMeters: 10000
        });
        console.log(`[LeadLock Enrichment] Strategy 1 (name+zip): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 2: Business name + city + state
      if ((!searchResults || searchResults.length === 0) && (searchCity || searchState)) {
        query = `${businessName} ${searchCity} ${searchState}`.trim();
        searchResults = await searchGooglePlacesByText({
          query,
          center: business.latitude && business.longitude ? { latitude: business.latitude, longitude: business.longitude } : null,
          radiusMeters: 15000
        });
        console.log(`[LeadLock Enrichment] Strategy 2 (name+city+state): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 3: Name + nearby coordinates
      if ((!searchResults || searchResults.length === 0) && business.latitude && business.longitude) {
        query = businessName;
        searchResults = await searchGooglePlacesByText({
          query,
          center: { latitude: business.latitude, longitude: business.longitude },
          radiusMeters: 5000
        });
        console.log(`[LeadLock Enrichment] Strategy 3 (name+nearby): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 4: Fallback to name + phone
      if ((!searchResults || searchResults.length === 0) && searchPhone) {
        query = `${businessName} ${searchPhone}`;
        searchResults = await searchGooglePlacesByText({ query });
        console.log(`[LeadLock Enrichment] Strategy 4 (name+phone): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 5: Name + state (wider net)
      if ((!searchResults || searchResults.length === 0) && searchState) {
        query = `${businessName} ${searchState}`;
        searchResults = await searchGooglePlacesByText({
          query,
          center: business.latitude && business.longitude ? { latitude: business.latitude, longitude: business.longitude } : null,
          radiusMeters: 30000
        });
        console.log(`[LeadLock Enrichment] Strategy 5 (name+state): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 6: Name only (broad fallback)
      if (!searchResults || searchResults.length === 0) {
        searchResults = await searchGooglePlacesByText({ query: businessName });
        console.log(`[LeadLock Enrichment] Strategy 6 (name only): "${query}" → ${searchResults?.length || 0} results`);
      }

      // Strategy 7: OCR text + zip (if available)
      if ((!searchResults || searchResults.length === 0) && business.ocrText && searchZip) {
        const ocrName = String(business.ocrText).split('\n')[0] || business.ocrText.slice(0, 60);
        query = `${ocrName} ${searchZip}`;
        searchResults = await searchGooglePlacesByText({ query });
        console.log(`[LeadLock Enrichment] Strategy 7 (ocr+zip): "${query}" → ${searchResults?.length || 0} results`);
      }

      if (searchResults && searchResults.length > 0) {
        // Find best match (usually the first from Google is best)
        const bestSearchMatch = searchResults[0];
        placeId = bestSearchMatch.placeId || bestSearchMatch.place_id;

        sources.push({
          ...bestSearchMatch,
          source: "Google Search Match",
          type: "place_search_result",
        });
        console.log('[LeadLock Enrichment] Selected candidate:', bestSearchMatch.name, bestSearchMatch.formatted_address);
      }
    } catch (e) {
      console.warn("[PublicEnrichment] Google Search failed:", e.message);
    }
  }

  if (placeId) {
    // Accept all Google Place ID formats:
    // Legacy:  ChIJ... (most common)
    // New API: places/ChIJ... or just a long alphanumeric string
    // OSM:     contains 'osm'
    // Never filter by prefix — if we got an ID from Google search, try it
    try {
      const placeDetails = await fetchPlaceDetails(placeId);
      if (placeDetails) {
        sources.push({
          ...placeDetails,
          source: "Google Places",
          type: "place_details",
        });
      }
    } catch (e) {
      console.warn("[PublicEnrichment] Google Details failed:", e.message);
    }
  }

  // 3. Texas Comptroller Lookup (Public Record)
  if (businessName.length > 2) {
    try {
      const comptrollerResult = await enrichProspectWithComptroller(businessName);
      if (comptrollerResult && comptrollerResult.bestMatch) {
        sources.push({
          ...comptrollerResult.bestMatch,
          source: "Texas Comptroller",
          type: "public_record",
        });
      }
    } catch (e) {
      console.warn("[PublicEnrichment] Comptroller lookup failed:", e.message);
    }
  }

  // 4. LensSignal / Website POC lookup
  try {
    const pocResult = await enrichMissingPOC(business);
    if (pocResult && pocResult.found) {
      if (Array.isArray(pocResult.candidates)) {
        pocResult.candidates.forEach(c => {
           sources.push({
             ...c,
             source: c.source || "ContactSignal",
             type: "enrichment_candidate"
           });
        });
      } else if (pocResult.poc) {
        sources.push({
          ...pocResult.poc,
          source: pocResult.poc.source || "ContactSignal",
          type: "enrichment_candidate"
        });
      }
    }
  } catch (e) {
    console.warn("[PublicEnrichment] ContactSignal lookup failed:", e.message);
  }

  // 5. Health violation / pest risk assessment
  let healthData = null;
  try {
    healthData = await searchHealthViolations(
      businessName,
      business.city || 'Houston',
      business.propertyType || business.businessType || ''
    );
  } catch (e) {
    console.warn("[PublicEnrichment] Health assessment failed:", e.message);
  }

  // 6. Property record / structural risk
  let propertyData = null;
  const addressStr = [
    business.streetNumber, business.streetName,
    business.city, business.state, business.zip
  ].filter(Boolean).join(' ') || business.address || business.streetAddress || '';
  if (addressStr.length > 5) {
    try {
      propertyData = await getPropertyRecord(addressStr);
    } catch (e) {
      console.warn("[PublicEnrichment] Property lookup failed:", e.message);
    }
  }

  const enrichmentBundle = buildEnrichmentBundle(sources);

  // Calculate enrichment confidence score based on sources found
  const sourceTypes = sources.map(s => s.type);
  const hasPlaceDetails = sourceTypes.includes('place_details');
  const hasSearchMatch = sourceTypes.includes('place_search_result');
  const hasPublicRecord = sourceTypes.includes('public_record');
  const hasContacts = sourceTypes.includes('enrichment_candidate');
  let enrichmentScore = 0;
  if (hasPlaceDetails) enrichmentScore += 45;
  if (hasSearchMatch) enrichmentScore += 20;
  if (hasPublicRecord) enrichmentScore += 20;
  if (hasContacts) enrichmentScore += 15;
  if (enrichmentBundle.primaryPhone) enrichmentScore += 10;
  if (enrichmentBundle.emailCandidates && enrichmentBundle.emailCandidates.length > 0) enrichmentScore += 10;
  if (enrichmentBundle.contacts && enrichmentBundle.contacts.length > 0) enrichmentScore += 10;
  enrichmentScore = Math.min(100, enrichmentScore);

  let enrichmentConfidenceLabel = 'Missing';
  if (enrichmentScore >= 85) enrichmentConfidenceLabel = 'High';
  else if (enrichmentScore >= 65) enrichmentConfidenceLabel = 'Medium';
  else if (enrichmentScore >= 35) enrichmentConfidenceLabel = 'Low';

  const enrichmentStatus = enrichmentScore > 0 ? 'complete' : 'none';

  const enrichmentNotes = [];
  if (!hasPlaceDetails) enrichmentNotes.push('No Google Places details found');
  if (!hasPublicRecord) enrichmentNotes.push('No public record match');
  if (!enrichmentBundle.primaryPhone) enrichmentNotes.push('Phone not found');
  if (!enrichmentBundle.emailCandidates || enrichmentBundle.emailCandidates.length === 0) enrichmentNotes.push('Email not found');
  if (!enrichmentBundle.contacts || enrichmentBundle.contacts.length === 0) enrichmentNotes.push('No contacts found');

  // Score the best match against the original prospect
  let businessMatch = null;
  const bestCandidate = sources.find(s => s.type === 'place_details' || s.type === 'place_search_result');
  if (bestCandidate) {
    businessMatch = scoreBusinessMatch(business, bestCandidate, {
      photoLatitude: business.latitude || null,
      photoLongitude: business.longitude || null,
    });
    console.log('[LeadLock Enrichment] Business match score:', businessMatch);
  }

  console.log('[LeadLock Enrichment] Enrichment complete:', {
    businessName: business.businessName,
    candidatesFound: sources.length - 1,
    confidenceScore: enrichmentScore,
    confidenceLabel: enrichmentConfidenceLabel,
    fieldsFilled: ['phone', 'email', 'contacts'].filter(f => enrichmentBundle[f] || (f === 'email' && enrichmentBundle.emailCandidates?.length) || (f === 'contacts' && enrichmentBundle.contacts?.length)),
    businessMatch,
  });

  return {
    ...business,
    enrichment_confidence: enrichmentConfidenceLabel,
    enrichment_confidence_score: enrichmentScore,
    enrichment_status: enrichmentStatus,
    enrichment_notes: enrichmentNotes.join('; ') || null,
    business_match_score: businessMatch?.score ?? null,
    business_match_label: businessMatch?.label ?? null,
    business_match_details: businessMatch?.details ?? [],
    enrichment: {
      ...(business.enrichment || {}),
      ...enrichmentBundle,
      sources: enrichmentBundle.sources,
      rawSources: sources,
      // Health / pest risk
      healthRisk: healthData?.success ? {
        riskScore:   healthData.riskScore,
        riskLevel:   healthData.riskLevel,
        riskFactors: healthData.riskFactors,
        violations:  healthData.violations,
        dataSource:  healthData.dataSource,
      } : null,
      // Property / structural risk
      propertyRisk: propertyData?.success ? {
        riskScore:   propertyData.pestRiskScore,
        riskFactors: propertyData.pestRiskFactors,
        property:    propertyData.property,
        dataSource:  propertyData.dataSource,
      } : null,
      enrichedAt: new Date().toISOString(),
    },
    phone: business.phone || enrichmentBundle.primaryPhone || "",
    email: business.email || (enrichmentBundle.emailCandidates && enrichmentBundle.emailCandidates[0]) || "",
    contactCandidates: enrichmentBundle.contacts || [],
    pocCandidates: enrichmentBundle.pocCandidates || [],
    emailCandidates: enrichmentBundle.emailCandidates || [],
  };
}


/**
 * Address Parsing Logic (Preserved from previous implementation)
 */
export function parseBusinessAddress(input) {
  if (!input) {
    return {
      streetNumber: "",
      streetName: "",
      addressLine2: "",
      city: "",
      state: "",
      zip: "",
      formattedAddress: "",
    };
  }

  const formattedAddress =
    typeof input === "string"
      ? input
      : input.formattedAddress ||
        input.formatted_address ||
        input.address ||
        input.fullAddress ||
        input.placeDetails?.formatted_address ||
        input.googlePlace?.formatted_address ||
        "";

  const components =
    input.addressComponents ||
    input.address_components ||
    input.components ||
    input.placeDetails?.address_components ||
    input.googlePlace?.address_components ||
    [];

  if (Array.isArray(components) && components.length > 0) {
    const getLong = type => {
      const match = components.find(c =>
        Array.isArray(c.types) && c.types.includes(type)
      );

      return match?.long_name || match?.longText || match?.short_name || match?.shortText || "";
    };

    const getShort = type => {
      const match = components.find(c =>
        Array.isArray(c.types) && c.types.includes(type)
      );

      return match?.short_name || match?.shortText || match?.long_name || match?.longText || "";
    };

    const streetNumber = getLong("street_number");
    const route = getLong("route");
    const subpremise = getLong("subpremise");

    const city =
      getLong("locality") ||
      getLong("postal_town") ||
      getLong("sublocality") ||
      getLong("administrative_area_level_2");

    const state = getShort("administrative_area_level_1");
    const zip = getLong("postal_code");

    return {
      streetNumber,
      streetName: route,
      addressLine2: subpremise ? `Ste ${subpremise}`.replace(/^Ste Ste /i, "Ste ") : "",
      city,
      state,
      zip,
      formattedAddress,
    };
  }

  // Fallback for string parsing
  const parts = formattedAddress.split(",").map(p => p.trim()).filter(Boolean);

  let streetPart = parts[0] || "";
  let city = "";
  let state = "";
  let zip = "";

  // Try to find city, state, zip in a comma-separated list
  const stateZipCandidate = parts.find(p => /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(p));
  const stateZipMatch = stateZipCandidate?.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/);

  if (stateZipMatch) {
    state = stateZipMatch[1];
    zip = stateZipMatch[2];

    const stateZipIndex = parts.indexOf(stateZipCandidate);
    if (stateZipIndex > 0) {
      city = parts[stateZipIndex - 1] || "";
    }
  } else if (parts.length === 1) {
    // Single line address like "123 Main St Austin TX 78701"
    const longMatch = formattedAddress.match(/(.*)\s+([A-Za-z\s.]+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (longMatch) {
      streetPart = longMatch[1].trim();
      city = longMatch[2].trim();
      state = longMatch[3];
      zip = longMatch[4];
    }
  }

  let addressLine2 = "";

  const unitFromStreet = streetPart.match(/\b(?:Suite|Ste|Unit|Apt|#)\s*[\w-]+/i);
  if (unitFromStreet) {
    addressLine2 = unitFromStreet[0].replace(/^Suite/i, "Ste").trim();
    streetPart = streetPart.replace(unitFromStreet[0], "").replace(/,\s*$/, "").trim();
  }

  if (!addressLine2 && parts.length > 1) {
    const unitPart = parts.find(p => /^\s*(?:Suite|Ste|Unit|Apt|#)\s*[\w-]+/i.test(p));
    if (unitPart) {
      addressLine2 = unitPart.replace(/^Suite/i, "Ste").trim();
    }
  }

  const streetMatch = streetPart.match(/^(\d+[A-Za-z]?)\s+(.+)$/);

  const streetNumber = streetMatch ? streetMatch[1] : "";
  const streetName = streetMatch ? streetMatch[2] : streetPart;

  return {
    streetNumber,
    streetName,
    addressLine2,
    city: city || input.city || "",
    state: state || input.state || "",
    zip: zip || input.zip || "",
    formattedAddress,
  };
}


/**
 * Score how well an enrichment candidate matches the original prospect.
 * Used to determine if enrichment data should be applied automatically.
 *
 * @param {object} prospect - Original prospect data
 * @param {object} candidate - Enrichment candidate (e.g. Google Places result)
 * @param {object} [options] - Additional scoring options
 * @param {number} [options.photoLatitude] - Photo GPS latitude for distance scoring
 * @param {number} [options.photoLongitude] - Photo GPS longitude for distance scoring
 * @returns {{ score: number, label: string, details: string[] }}
 */
export function scoreBusinessMatch(prospect, candidate, options = {}) {
  let score = 0;
  const details = [];

  const normalize = (v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const digits = (v) => String(v || '').replace(/\D/g, '');

  const prospectName = normalize(prospect.businessName || prospect.name || '');
  const candidateName = normalize(candidate.name || candidate.businessName || candidate.business_name || '');

  // --- Name similarity (up to 35 points) ---
  if (prospectName && candidateName) {
    if (prospectName === candidateName) {
      score += 35;
      details.push('exact name match');
    } else if (candidateName.includes(prospectName) || prospectName.includes(candidateName)) {
      score += 25;
      details.push('partial name match');
    } else {
      // Simple word overlap
      const pWords = prospectName.split(' ');
      const cWords = candidateName.split(' ');
      const overlap = pWords.filter(w => w.length > 2 && cWords.includes(w)).length;
      if (overlap >= 2) {
        score += 20;
        details.push('name word overlap');
      } else if (overlap === 1) {
        score += 10;
        details.push('name single word match');
      }
    }
  }

  // --- Zip/city/state match (up to 20 points) ---
  const prospectZip = digits(prospect.zip || prospect.postal_code || '');
  const candidateZip = digits(candidate.zip || candidate.postal_code || '');
  if (prospectZip && candidateZip && prospectZip === candidateZip) {
    score += 20;
    details.push('zip match');
  } else {
    const prospectCity = normalize(prospect.city || '');
    const prospectState = normalize(prospect.state || '');
    const candidateCity = normalize(candidate.city || '');
    const candidateState = normalize(candidate.state || '');
    let locationScore = 0;
    if (prospectCity && candidateCity && prospectCity === candidateCity) locationScore += 10;
    if (prospectState && candidateState && prospectState === candidateState) locationScore += 10;
    if (locationScore > 0) {
      score += locationScore;
      details.push('city/state match');
    }
  }

  // --- GPS distance match (up to 20 points) ---
  const photoLat = options.photoLatitude || prospect.latitude;
  const photoLon = options.photoLongitude || prospect.longitude;
  const candidateLat = candidate.latitude;
  const candidateLon = candidate.longitude;
  if (photoLat && photoLon && candidateLat && candidateLon) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(candidateLat - photoLat);
    const dLon = toRad(candidateLon - photoLon);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(photoLat)) * Math.cos(toRad(candidateLat)) * Math.sin(dLon / 2) ** 2;
    const distance = 2 * R * Math.asin(Math.sqrt(a));

    if (distance <= 50) {
      score += 20;
      details.push('GPS near-exact (<50m)');
    } else if (distance <= 150) {
      score += 15;
      details.push('GPS very close (<150m)');
    } else if (distance <= 500) {
      score += 10;
      details.push('GPS nearby (<500m)');
    } else if (distance <= 2000) {
      score += 5;
      details.push('GPS in area (<2km)');
    }
  }

  // --- Address match (up to 15 points) ---
  const pStreet = normalize(`${prospect.streetNumber || ''} ${prospect.streetName || ''}`);
  const cStreet = normalize(candidate.streetNumber ? `${candidate.streetNumber} ${candidate.streetName || ''}` : (candidate.address || candidate.formatted_address || ''));
  if (pStreet && cStreet && pStreet.length > 3 && cStreet.length > 3) {
    if (pStreet === cStreet) {
      score += 15;
      details.push('exact address match');
    } else if (cStreet.includes(pStreet) || pStreet.includes(cStreet)) {
      score += 10;
      details.push('partial address match');
    }
  }

  // --- Phone/website match (up to 10 points) ---
  const prospectPhone = digits(prospect.phone || '');
  const candidatePhone = digits(candidate.phone || candidate.formatted_phone_number || '');
  if (prospectPhone && candidatePhone && prospectPhone === candidatePhone) {
    score += 10;
    details.push('phone match');
  } else {
    const pWebsite = normalize(prospect.website || '');
    const cWebsite = normalize(candidate.website || candidate.websiteUri || '');
    if (pWebsite && cWebsite && pWebsite === cWebsite) {
      score += 10;
      details.push('website match');
    }
  }

  score = Math.min(100, Math.max(0, score));
  let label = 'Missing';
  if (score >= 85) label = 'High';
  else if (score >= 65) label = 'Medium';
  else if (score >= 35) label = 'Low';

  return { score, label, details };
}

/**
 * Prospect Update Logic with data protection.
 * Does not overwrite existing good data with weaker enrichment results.
 * Conflicts are stored as suggestions for manual review.
 */
export function buildProspectUpdatesFromLookup(prospect, enrichmentResult) {
  const safeProspect = prospect || {};
  const updates = {};
  let suggestions = {};
  const fieldsFilled = [];
  const fieldsProtected = [];
  const fieldsSkipped = [];

  const parsedAddress = parseBusinessAddress(enrichmentResult);
  const bestPhone = extractBestPhone(enrichmentResult);
  const bestPOC = extractBestPOC(enrichmentResult);
  const contactCandidates = normalizeContactCandidates(enrichmentResult);

  const bestEmail = enrichmentResult.email || (enrichmentResult.emailCandidates && enrichmentResult.emailCandidates[0]) || enrichmentResult.bestEmail || "";

  // Helper: check if existing value is "confirmed" (non-empty and not placeholder)
  const isConfirmed = (val) => {
    if (!val) return false;
    const s = String(val).trim();
    if (!s || s === '.' || s === ',') return false;
    return true;
  };

  const isEmpty = (val) => !val || String(val).trim() === '' || String(val).trim() === '.';

  // Helper: determine if address is "complete" (has street number + street name + city + state)
  const isCompleteAddress = (p) => {
    return isConfirmed(p.streetNumber) && isConfirmed(p.streetName) && isConfirmed(p.city) && isConfirmed(p.state);
  };

  // --- Address fields: don't replace complete address with partial ---
  const existingComplete = isCompleteAddress(safeProspect);
  const incomingHasAddress = parsedAddress.streetNumber || parsedAddress.streetName;

  if (incomingHasAddress && !existingComplete) {
    if (parsedAddress.streetNumber && isEmpty(safeProspect.streetNumber)) {
      updates.streetNumber = parsedAddress.streetNumber;
      fieldsFilled.push('streetNumber');
    } else if (parsedAddress.streetNumber && safeProspect.streetNumber !== parsedAddress.streetNumber) {
      suggestions.streetNumber = parsedAddress.streetNumber;
      fieldsProtected.push('streetNumber');
    }
    if (parsedAddress.streetName && isEmpty(safeProspect.streetName)) {
      updates.streetName = parsedAddress.streetName;
      fieldsFilled.push('streetName');
    } else if (parsedAddress.streetName && safeProspect.streetName !== parsedAddress.streetName) {
      suggestions.streetName = parsedAddress.streetName;
      fieldsProtected.push('streetName');
    }
    if (parsedAddress.addressLine2 && isEmpty(safeProspect.addressLine2)) {
      updates.addressLine2 = parsedAddress.addressLine2;
      fieldsFilled.push('addressLine2');
    }
    if (parsedAddress.city && isEmpty(safeProspect.city)) {
      updates.city = parsedAddress.city;
      fieldsFilled.push('city');
    } else if (parsedAddress.city && safeProspect.city !== parsedAddress.city) {
      suggestions.city = parsedAddress.city;
      fieldsProtected.push('city');
    }
    if (parsedAddress.state && isEmpty(safeProspect.state)) {
      updates.state = parsedAddress.state;
      fieldsFilled.push('state');
    } else if (parsedAddress.state && safeProspect.state !== parsedAddress.state) {
      suggestions.state = parsedAddress.state;
      fieldsProtected.push('state');
    }
    if (parsedAddress.zip && isEmpty(safeProspect.zip)) {
      updates.zip = parsedAddress.zip;
      fieldsFilled.push('zip');
    } else if (parsedAddress.zip && safeProspect.zip !== parsedAddress.zip) {
      suggestions.zip = parsedAddress.zip;
      fieldsProtected.push('zip');
    }
  } else if (incomingHasAddress && existingComplete) {
    fieldsProtected.push('completeAddress');
    suggestions = { ...suggestions, ...parsedAddress };
  }

  // --- Phone: don't replace confirmed phone ---
  if (bestPhone && isEmpty(safeProspect.phone)) {
    updates.phone = bestPhone;
    fieldsFilled.push('phone');
  } else if (bestPhone && safeProspect.phone !== bestPhone) {
    suggestions.phone = bestPhone;
    fieldsProtected.push('phone');
  }

  // --- Email: only fill if missing, never overwrite ---
  if (bestEmail && isEmpty(safeProspect.email)) {
    updates.email = bestEmail;
    fieldsFilled.push('email');
  } else if (bestEmail && safeProspect.email !== bestEmail) {
    suggestions.email = bestEmail;
    fieldsProtected.push('email');
  }

  // --- POC fields: only fill if missing ---
  if (bestPOC?.firstName && isEmpty(safeProspect.pocFirst)) {
    updates.pocFirst = bestPOC.firstName;
    fieldsFilled.push('pocFirst');
  } else if (bestPOC?.firstName && safeProspect.pocFirst !== bestPOC.firstName) {
    suggestions.pocFirst = bestPOC.firstName;
    fieldsProtected.push('pocFirst');
  }
  if (bestPOC?.lastName && isEmpty(safeProspect.pocLast)) {
    updates.pocLast = bestPOC.lastName;
    fieldsFilled.push('pocLast');
  } else if (bestPOC?.lastName && safeProspect.pocLast !== bestPOC.lastName) {
    suggestions.pocLast = bestPOC.lastName;
    fieldsProtected.push('pocLast');
  }
  if (bestPOC?.fullName && isEmpty(safeProspect.pocName)) {
    updates.pocName = bestPOC.fullName;
    fieldsFilled.push('pocName');
  } else if (bestPOC?.fullName && safeProspect.pocName !== bestPOC.fullName) {
    suggestions.pocName = bestPOC.fullName;
    fieldsProtected.push('pocName');
  }

  console.log('[LeadLock Enrichment] Prospect updates:', {
    fieldsFilled,
    fieldsProtected,
    fieldsSkipped: fieldsSkipped.length ? fieldsSkipped : undefined,
    hasSuggestions: Object.keys(suggestions).length > 0,
  });

  // Carry through enrichment confidence metadata from the enrichment result
  const enrichmentConfidence = enrichmentResult.enrichment_confidence || safeProspect.enrichment_confidence || null;
  const enrichmentConfidenceScore = enrichmentResult.enrichment_confidence_score ?? safeProspect.enrichment_confidence_score ?? null;
  const enrichmentStatus = enrichmentResult.enrichment_status || safeProspect.enrichment_status || null;
  const enrichmentNotes = enrichmentResult.enrichment_notes || safeProspect.enrichment_notes || null;
  const businessMatchScore = enrichmentResult.business_match_score ?? safeProspect.business_match_score ?? null;
  const businessMatchLabel = enrichmentResult.business_match_label || safeProspect.business_match_label || null;

  return {
    ...safeProspect,
    ...updates,
    enrichment_confidence: enrichmentConfidence,
    enrichment_confidence_score: enrichmentConfidenceScore,
    enrichment_status: enrichmentStatus,
    enrichment_notes: enrichmentNotes,
    business_match_score: businessMatchScore,
    business_match_label: businessMatchLabel,
    contactCandidates,
    enrichment_suggestions: Object.keys(suggestions).length > 0 ? suggestions : null,
    enrichment: {
      ...(safeProspect.enrichment || {}),
      lastLookupAt: new Date().toISOString(),
      lookupApplied: Object.keys(updates).length > 0,
      fieldsFilled,
      fieldsProtected,
      suggestions: Object.keys(suggestions).length > 0 ? suggestions : null,
      rawLookup: enrichmentResult,
      parsedAddress,
      bestPhone,
      bestPOC,
      contactCandidates,
    },
  };
}
