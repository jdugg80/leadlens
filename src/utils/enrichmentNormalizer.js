import { fetchPlaceDetails, searchGooglePlacesByText } from './nearbySearch';
import { enrichProspectWithComptroller } from '../services/comptrollerEnrichment';
import { enrichMissingPOC } from './socialEnrichment';

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
 */
export async function enrichBusinessWithPublicSources(business) {
  if (!business) return null;
  const sources = [];

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
      const searchPhone = business.phone ? String(business.phone).replace(/\D/g, '') : "";

      // Try name + city first
      let query = `${businessName} ${searchCity} ${searchState}`.trim();
      let searchResults = await searchGooglePlacesByText({
        query,
        center: business.latitude && business.longitude ? { latitude: business.latitude, longitude: business.longitude } : null,
        radiusMeters: 15000
      });

      // Strategy 2: Fallback to name + phone if Strategy 1 yields nothing
      if ((!searchResults || searchResults.length === 0) && searchPhone) {
        query = `${businessName} ${searchPhone}`;
        searchResults = await searchGooglePlacesByText({ query });
      }

      // Strategy 3: Fallback to just name + state (wider net)
      if ((!searchResults || searchResults.length === 0) && searchState) {
        query = `${businessName} ${searchState}`;
        searchResults = await searchGooglePlacesByText({
          query,
          center: business.latitude && business.longitude ? { latitude: business.latitude, longitude: business.longitude } : null,
          radiusMeters: 30000
        });
      }

      // Strategy 4: Name only (ultimate fallback)
      if (!searchResults || searchResults.length === 0) {
        searchResults = await searchGooglePlacesByText({ query: businessName });
      }

      // Strategy 5: Broad keyword search (e.g. "Acme Corp in Houston")
      if ((!searchResults || searchResults.length === 0) && businessName.length > 2) {
        const broadQuery = `${businessName}${searchCity ? ' in ' + searchCity : ''}${searchState ? ', ' + searchState : ''}`;
        searchResults = await searchGooglePlacesByText({ query: broadQuery });
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
      }
    } catch (e) {
      console.warn("[PublicEnrichment] Google Search failed:", e.message);
    }
  }

  if (placeId && (placeId.startsWith('ChI') || placeId.includes('osm'))) { // Check for Google Place ID or OSM ID format
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

  const enrichmentBundle = buildEnrichmentBundle(sources);

  if (__DEV__) {
    console.log("PUBLIC ENRICHMENT INPUT BUSINESS:", business);
    console.log("PUBLIC ENRICHMENT SOURCES:", sources);
    console.log("PUBLIC ENRICHMENT BUNDLE:", enrichmentBundle);
  }

  return {
    ...business,
    enrichment: {
      ...(business.enrichment || {}),
      ...enrichmentBundle,
      sources: enrichmentBundle.sources,
      rawSources: sources,
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
 * Prospect Update Logic (Preserved from previous implementation)
 */
export function buildProspectUpdatesFromLookup(prospect, enrichmentResult) {
  const safeProspect = prospect || {};
  const updates = {};

  const parsedAddress = parseBusinessAddress(enrichmentResult);
  const bestPhone = extractBestPhone(enrichmentResult);
  const bestPOC = extractBestPOC(enrichmentResult);
  const contactCandidates = normalizeContactCandidates(enrichmentResult);

  if (parsedAddress.streetNumber) updates.streetNumber = parsedAddress.streetNumber;
  if (parsedAddress.streetName) updates.streetName = parsedAddress.streetName;
  if (parsedAddress.addressLine2) updates.addressLine2 = parsedAddress.addressLine2;
  if (parsedAddress.city) updates.city = parsedAddress.city;
  if (parsedAddress.state) updates.state = parsedAddress.state;
  if (parsedAddress.zip) updates.zip = parsedAddress.zip;
  if (parsedAddress.formattedAddress) updates.formattedAddress = parsedAddress.formattedAddress;

  if (bestPhone) {
    updates.phone = bestPhone;
  }

  const bestEmail = enrichmentResult.email || (enrichmentResult.emailCandidates && enrichmentResult.emailCandidates[0]) || enrichmentResult.bestEmail || "";
  if (bestEmail && !safeProspect.email) {
    updates.email = bestEmail;
  }

  if (bestPOC?.firstName) {
    updates.pocFirst = bestPOC.firstName;
  }

  if (bestPOC?.lastName) {
    updates.pocLast = bestPOC.lastName;
  }

  if (bestPOC?.fullName) {
    updates.pocName = bestPOC.fullName;
  }

  return {
    ...safeProspect,
    ...updates,
    contactCandidates,
    enrichment: {
      ...(safeProspect.enrichment || {}),
      lastLookupAt: new Date().toISOString(),
      lookupApplied: true,
      rawLookup: enrichmentResult,
      parsedAddress,
      bestPhone,
      bestPOC,
      contactCandidates,
    },
  };
}
