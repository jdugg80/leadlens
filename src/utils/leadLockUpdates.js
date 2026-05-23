import { calculateLeadViability, hasUsablePhone } from './leadHelpers';
import { fetchPlaceDetails as getGooglePlaceDetails } from './nearbySearch';
import { storageBridge as AsyncStorage } from './storage';
import { upsertProspect } from './backendSync';
import { LEADS_STORAGE_KEY } from '../constants';

export async function applyAddressCandidateToProspect(prospectId, addressCandidate, options = {}) {
  console.log("[LeadLock] Apply address started", { prospectId, addressCandidate });

  // 1. Find the active prospect by prospectId in local queue
  const rawQueue = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
  let queue = [];
  if (rawQueue) {
    try {
      queue = JSON.parse(rawQueue);
    } catch (e) {
      console.warn("Failed to parse queue", e);
    }
  }

  const prospectIndex = queue.findIndex(p => p.id === prospectId);
  const prospect = prospectIndex >= 0 ? queue[prospectIndex] : null;

  if (!prospect) {
    console.warn("[LeadLock] Apply address failed: prospect not found", { prospectId });
    throw new Error("Prospect not found");
  }

  // 2. Normalize the address candidate
  const normalizedAddress = normalizeAddressCandidate(addressCandidate);
  console.log("[LeadLock] Normalized address", normalizedAddress);

  // 3. Merge missing address fields
  let updatedProspect = mergeAddressIntoProspect(prospect, normalizedAddress, {
    allowOverwrite: options.allowOverwrite === true
  });

  // 4. Attempt phone lookup
  if (options.alsoLookupPhone !== false) {
    updatedProspect = await maybeEnrichMissingPhone(updatedProspect, {
      ...addressCandidate,
      ...normalizedAddress
    });
  }

  // 5. Recalculate viability
  const viability = calculateLeadViability(updatedProspect);

  updatedProspect = {
    ...updatedProspect,
    ...viability,
    updatedAt: new Date().toISOString(),
    addressLastVerifiedAt: new Date().toISOString()
  };

  // 6. Save the updated prospect back to local queue
  queue[prospectIndex] = updatedProspect;
  await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(queue));
  console.log("[LeadLock] Local state update success");

  if (__DEV__) {
    console.log("LEADLENS LOOKUP RAW RESULT:", addressCandidate);
    console.log("LEADLENS LOOKUP APPLY TARGET PROSPECT:", prospect);
    console.log("LEADLENS LOOKUP FINAL UPDATED PROSPECT:", updatedProspect);
  }

  // 7. Update Supabase if synced
  if (updatedProspect.remoteId || updatedProspect.supabaseId || updatedProspect.id) {
    try {
      console.log("[LeadLock] Supabase update started");
      // Since upsertProspect typically takes (lead, user, supabaseSettings)
      // we do our best here. The UI will pass user if possible.
      if (options.user) {
         await upsertProspect(updatedProspect, options.user);
         console.log("[LeadLock] Supabase update success");
      } else {
         console.log("[LeadLock] Supabase update skipped because no user context provided to options");
      }
    } catch (err) {
      console.warn("[LeadLock] Supabase update failure", err);
    }
  }

  console.log("[LeadLock] Apply address completed", updatedProspect);
  return updatedProspect;
}

import { parseAddressComponents } from './nearbySearch';

export function normalizeAddressCandidate(candidate) {
  const address = { ...candidate };

  let parsed = {};
  if (Array.isArray(address.addressComponents)) {
    parsed = parseAddressComponents(address.addressComponents);
  }

  return {
    fullAddress: address.fullAddress || address.formatted_address || address.formattedAddress || address.address,
    formattedAddress: address.formattedAddress || address.formatted_address || address.fullAddress || address.address,
    streetNumber: parsed.streetNumber || address.streetNumber,
    streetName: parsed.streetName || address.streetName || address.route || address.streetAddress || address.addressLine1,
    addressLine2: address.addressLine2,
    city: parsed.city || address.city || address.locality,
    state: parsed.state || address.state || address.region,
    zip: parsed.zip || address.zip || address.postalCode || address.postal_code,
    latitude: address.latitude || address.lat || (address.geometry?.location?.lat) || address.coords?.latitude,
    longitude: address.longitude || address.lng || (address.geometry?.location?.lng) || address.coords?.longitude,
    source: address.source || "LeadLock",
    sourceUrl: address.sourceUrl || address.url || null,
    confidenceScore: address.confidenceScore || address.confidence || null,
    placeId: address.placeId || address.place_id || null,
  };
}

export function mergeAddressIntoProspect(prospect, address, options = {}) {
  const allowOverwrite = options.allowOverwrite === true;

  const applyIfAllowed = (currentValue, newValue) => {
    if (allowOverwrite) return newValue || currentValue;
    return currentValue || newValue || currentValue;
  };

  return {
    ...prospect,

    fullAddress: applyIfAllowed(prospect.fullAddress, address.fullAddress || address.formattedAddress),
    formattedAddress: applyIfAllowed(prospect.formattedAddress, address.formattedAddress || address.fullAddress),

    streetNumber: applyIfAllowed(prospect.streetNumber, address.streetNumber),
    streetName: applyIfAllowed(prospect.streetName, address.streetName),
    addressLine2: applyIfAllowed(prospect.addressLine2, address.addressLine2),

    city: applyIfAllowed(prospect.city, address.city),
    state: applyIfAllowed(prospect.state, address.state),
    zip: applyIfAllowed(prospect.zip, address.zip),

    latitude: applyIfAllowed(prospect.latitude, address.latitude),
    longitude: applyIfAllowed(prospect.longitude, address.longitude),

    addressSource: address.source || prospect.addressSource || "LeadLock",
    addressSourceUrl: address.sourceUrl || prospect.addressSourceUrl || null,
    addressConfidenceScore: address.confidenceScore ?? prospect.addressConfidenceScore ?? null
  };
}

export async function maybeEnrichMissingPhone(prospect, businessMatch) {
  if (hasUsablePhone(prospect)) {
    console.log("[LeadLock] Phone lookup skipped: existing phone is usable");
    return prospect;
  }

  console.log("[LeadLock] Missing phone detected, attempting phone enrichment", {
    businessName: prospect.businessName,
    placeId: businessMatch.placeId || businessMatch.place_id,
    fullAddress: prospect.fullAddress || businessMatch.fullAddress
  });

  const phoneResult = await enrichMissingPhoneFromBusinessMatch(prospect, businessMatch);

  if (!phoneResult || !phoneResult.phone) {
    console.log("[LeadLock] No reliable phone found");
    return prospect;
  }

  if (phoneResult.confidenceLabel === "High" || phoneResult.confidenceScore >= 80) {
    console.log("[LeadLock] phone applied", phoneResult);
    return {
      ...prospect,
      phone: phoneResult.phone,
      businessPhone: phoneResult.phone,
      phoneSource: phoneResult.source || "LeadLock",
      phoneSourceUrl: phoneResult.sourceUrl || null,
      phoneConfidenceScore: phoneResult.confidenceScore || null,
      phoneLastVerifiedAt: new Date().toISOString()
    };
  }

  console.log("[LeadLock] Phone candidate found but not auto-applied", phoneResult);
  return {
    ...prospect,
    phoneCandidates: [
      ...(prospect.phoneCandidates || []),
      phoneResult
    ]
  };
}

export async function enrichMissingPhoneFromBusinessMatch(prospect, businessMatch) {
  // 1. Google Places Details using placeId, if available
  const placeId = businessMatch.placeId || businessMatch.place_id;
  if (placeId) {
    try {
      if (typeof getGooglePlaceDetails === 'function') {
        const details = await getGooglePlaceDetails(placeId);
        if (details && (details.formatted_phone_number || details.international_phone_number)) {
          return {
            phone: details.formatted_phone_number || details.international_phone_number,
            confidenceScore: 90,
            confidenceLabel: 'High',
            source: 'Google Places Details',
            sourceUrl: details.url || null
          };
        }
      }
    } catch (e) {
      console.warn("[LeadLock] Failed to enrich phone from Google Places", e);
    }
  }

  // 2. Existing business profile lookup result
  if (businessMatch.formatted_phone_number || businessMatch.phone) {
    const p = businessMatch.formatted_phone_number || businessMatch.phone;
    return {
      phone: p,
      confidenceScore: 85,
      confidenceLabel: 'High',
      source: 'Business Profile',
      sourceUrl: businessMatch.url || businessMatch.website || null
    };
  }

  return null;
}
