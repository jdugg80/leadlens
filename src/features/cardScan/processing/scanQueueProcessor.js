import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { enrichLead, extractLeadsWithDebugFromImage } from '../../../utils/claudeApi';
import { expandCandidatesFromOcrSummary } from '../../../utils/captureIntelligence';
import { findDuplicateInLeads, normalizeLead } from '../../../utils/leadHelpers';
import {
  getEnrichmentQueueCardsForSession,
  getCardsForSession,
  getQueueCardsForSession,
  updateScanCardFields,
} from '../storage/scanCards';
import { setSessionCounts, updateScanSessionStatus } from '../storage/scanSessions';
import {
  SCAN_CARD_STATUS,
  SCAN_QUEUE_DEFAULT_CONCURRENCY,
  SCAN_QUEUE_MAX_CONCURRENCY,
  SCAN_SESSION_STATUS,
} from '../constants/scanStatuses';
import {
  OCR_IMAGE_OPTIMIZATION_ENABLED,
  SCAN_ENRICHMENT_QUEUE_ENABLED,
} from '../../../config/featureFlags';

const enrichmentInFlightSessions = new Set();

function clampConcurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return SCAN_QUEUE_DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(SCAN_QUEUE_MAX_CONCURRENCY, Math.floor(parsed)));
}

async function persistImageForOcr(uri) {
  if (!uri) return uri;
  // OCR-optimized derivative copy: preserve original quality, use separate URI.
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1800 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  const filename = `leadlens_queue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destDir = `${FileSystem.documentDirectory}card_images/`;
  await FileSystem.makeDirectoryAsync(destDir, { intermediates: true });
  const dest = `${destDir}${filename}`;
  await FileSystem.copyAsync({ from: manipulated.uri, to: dest });
  return dest;
}

async function readAssetBase64(uri, mimeType = 'image/jpeg') {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { b64, mime: mimeType || 'image/jpeg' };
}

async function fileExists(uri) {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !!info?.exists;
  } catch {
    return false;
  }
}

function hasMinimumLeadFields(lead = {}) {
  const businessOrPersonName =
    !!String(lead.businessName || '').trim()
    || !!String(lead.pocFirst || '').trim()
    || !!String(lead.pocLast || '').trim();
  const hasAddress =
    (!!String(lead.streetNumber || '').trim() && !!String(lead.streetName || '').trim())
    || !!String(lead.city || '').trim()
    || !!String(lead.state || '').trim()
    || !!String(lead.zip || '').trim();
  const phoneEmailOrAddress =
    !!String(lead.phone || '').trim()
    || !!String(lead.email || '').trim()
    || hasAddress;
  return businessOrPersonName && phoneEmailOrAddress;
}

function deriveReviewStatus(parsedLeads) {
  if (!Array.isArray(parsedLeads) || !parsedLeads.length) {
    return SCAN_CARD_STATUS.NEEDS_REVIEW;
  }
  const hasUsableLead = parsedLeads.some((lead) => hasMinimumLeadFields(lead));
  return hasUsableLead ? SCAN_CARD_STATUS.READY_FOR_REVIEW : SCAN_CARD_STATUS.NEEDS_REVIEW;
}

function mergeMissingFields(baseLead = {}, enrichedLead = {}) {
  const merged = { ...baseLead };
  Object.keys(enrichedLead || {}).forEach((key) => {
    const currentValue = merged[key];
    const nextValue = enrichedLead[key];
    const hasCurrent = currentValue != null && String(currentValue).trim() !== '';
    const hasNext = nextValue != null && String(nextValue).trim() !== '';
    if (!hasCurrent && hasNext) {
      merged[key] = nextValue;
    }
  });
  return normalizeLead(merged);
}

async function enrichCardParsedPayload(card) {
  if (!card?.parsed_json) {
    return { success: false, error: 'Missing parsed_json payload' };
  }

  let parsedPayload = null;
  try {
    parsedPayload = typeof card.parsed_json === 'string'
      ? JSON.parse(card.parsed_json)
      : card.parsed_json;
  } catch (err) {
    return { success: false, error: 'Invalid parsed_json format' };
  }

  const parsedLeads = Array.isArray(parsedPayload?.leads) ? parsedPayload.leads : [];
  if (!parsedLeads.length) {
    return { success: false, error: 'No parsed leads available for enrichment' };
  }

  try {
    const enrichedLeads = [];
    for (const parsedLead of parsedLeads) {
      const normalized = normalizeLead(parsedLead);
      const enriched = await enrichLead(normalized);
      enrichedLeads.push(mergeMissingFields(normalized, enriched));
    }

    await updateScanCardFields(card.id, {
      status: SCAN_CARD_STATUS.ENRICHED,
      parsed_json: {
        ...parsedPayload,
        leads: enrichedLeads,
        enrichment: {
          status: 'completed',
          updatedAt: new Date().toISOString(),
        },
      },
      error_message: null,
    });

    return {
      success: true,
      leads: enrichedLeads,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || 'Enrichment failed',
    };
  }
}

async function processSingleCard(card, options = {}) {
  const captureMethod = options.captureMethod || 'image';
  await updateScanCardFields(card.id, {
    status: SCAN_CARD_STATUS.OCR_PROCESSING,
    error_message: null,
  });

  try {
    if (!card.original_image_uri) {
      throw new Error('Missing original image URI');
    }

    let ocrImageUri = card.ocr_image_uri || null;
    let sourceUriForOcr = card.original_image_uri;

    if (OCR_IMAGE_OPTIMIZATION_ENABLED) {
      // Reuse previously generated OCR copy when possible to avoid recompressing.
      if (ocrImageUri && await fileExists(ocrImageUri)) {
        sourceUriForOcr = ocrImageUri;
      } else {
        try {
          ocrImageUri = await persistImageForOcr(card.original_image_uri);
          if (ocrImageUri) {
            await updateScanCardFields(card.id, {
              ocr_image_uri: ocrImageUri,
            });
            sourceUriForOcr = ocrImageUri;
          }
        } catch (ocrCopyErr) {
          // OCR copy generation must not block processing; fallback to original.
          console.warn('[scanQueue] OCR copy generation failed, using original image:', ocrCopyErr?.message || ocrCopyErr);
          sourceUriForOcr = card.original_image_uri;
        }
      }
    }

    const { b64, mime } = await readAssetBase64(sourceUriForOcr, 'image/jpeg');
    const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime, {
      coords: options.coords || null,
      captureMethod,
    });
    const rawOcrText = String(debugExtraction?.ocrSummary || '');

    await updateScanCardFields(card.id, {
      status: SCAN_CARD_STATUS.OCR_COMPLETE,
      raw_ocr_text: rawOcrText,
      ocr_image_uri: ocrImageUri || card.ocr_image_uri || null,
      error_message: null,
    });

    let extractedLeads = Array.isArray(debugExtraction?.leads) && debugExtraction.leads.length
      ? debugExtraction.leads
      : expandCandidatesFromOcrSummary(rawOcrText, 'business_card');

    if ((!Array.isArray(extractedLeads) || extractedLeads.length === 0) && rawOcrText.trim()) {
      const firstLine = rawOcrText
        .split(/\n|\||•|·/)
        .map((line) => String(line || '').trim())
        .find(Boolean) || 'Business Card Lead';

      extractedLeads = [{
        businessName: firstLine,
        notes: 'OCR fallback candidate from business card queue',
        confidence: 'low',
      }];
    }

    const parsedLeads = extractedLeads
      .map((lead) => normalizeLead(lead))
      .map((lead) => ({
        ...lead,
        captureMethod,
        imageUri: sourceUriForOcr,
      }));

    const reviewStatus = deriveReviewStatus(parsedLeads);
    await updateScanCardFields(card.id, {
      status: reviewStatus,
      parsed_json: {
        leads: parsedLeads,
        ocrSummary: rawOcrText,
        parsedAt: new Date().toISOString(),
      },
      error_message: null,
    });

    return {
      cardId: card.id,
      success: true,
      parseStatus: reviewStatus,
      leads: parsedLeads,
    };
  } catch (err) {
    const message = err?.message || 'Card OCR failed';
    await updateScanCardFields(card.id, {
      status: SCAN_CARD_STATUS.FAILED,
      error_message: message,
    });
    return {
      cardId: card.id,
      success: false,
      error: message,
      leads: [],
    };
  }
}

async function syncSessionCounts(sessionId) {
  const cards = await getCardsForSession(sessionId);
  const totalCards = cards.length;
  const processedCount = cards.filter((card) => (
    card.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
    || card.status === SCAN_CARD_STATUS.PARSE_COMPLETE
    || card.status === SCAN_CARD_STATUS.NEEDS_REVIEW
    || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
    || card.status === SCAN_CARD_STATUS.ENRICHED
    || card.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
    || card.status === SCAN_CARD_STATUS.COMPLETED
  )).length;
  const failedCount = cards.filter((card) => (
    card.status === SCAN_CARD_STATUS.FAILED
    || card.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
  )).length;
  const completedOrFailed = cards.filter((card) => (
    card.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
    || card.status === SCAN_CARD_STATUS.PARSE_COMPLETE
    || card.status === SCAN_CARD_STATUS.NEEDS_REVIEW
    || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
    || card.status === SCAN_CARD_STATUS.ENRICHED
    || card.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
    || card.status === SCAN_CARD_STATUS.COMPLETED
    || card.status === SCAN_CARD_STATUS.FAILED
  ));
  const lastProcessedIndex = completedOrFailed.length
    ? Math.max(...completedOrFailed.map((card) => Number(card.card_index) || 0))
    : 0;

  await setSessionCounts(sessionId, {
    total_cards: totalCards,
    processed_count: processedCount,
    failed_count: failedCount,
    last_processed_index: lastProcessedIndex,
  });

  const hasPending = cards.some((card) => (
    card.status === SCAN_CARD_STATUS.CAPTURED
    || card.status === SCAN_CARD_STATUS.OCR_PENDING
    || card.status === SCAN_CARD_STATUS.OCR_PROCESSING
    || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
    || card.status === SCAN_CARD_STATUS.PENDING
  ));
  const hasFailed = failedCount > 0;

  if (hasPending) {
    await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.PAUSED);
  } else if (hasFailed) {
    await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.FAILED);
  } else {
    await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.COMPLETED);
  }

  return {
    totalCards,
    processedCount,
    failedCount,
  };
}

export async function collectSessionLeads(sessionId) {
  const cards = await getCardsForSession(sessionId);
  const leads = [];

  for (const card of cards) {
    if (!card.parsed_json) continue;
    try {
      const parsed = typeof card.parsed_json === 'string'
        ? JSON.parse(card.parsed_json)
        : card.parsed_json;
      const parsedLeads = Array.isArray(parsed?.leads) ? parsed.leads : [];
      for (const lead of parsedLeads) {
        const normalized = normalizeLead({ ...lead, imageUri: lead.imageUri || card.ocr_image_uri || card.original_image_uri });
        const duplicate = findDuplicateInLeads(normalized, leads);
        if (duplicate) {
          const idx = duplicate.index;
          leads[idx] = {
            ...leads[idx],
            ...normalized,
            notes: [leads[idx].notes, normalized.notes].filter(Boolean).join(' | '),
          };
        } else {
          leads.push(normalized);
        }
      }
    } catch (err) {
      // Keep moving even if one parsed_json payload is invalid
    }
  }

  return leads;
}

export async function processScanSessionQueue(options = {}) {
  const {
    sessionId,
    includeFailed = false,
    retryFailed = false,
    concurrency = SCAN_QUEUE_DEFAULT_CONCURRENCY,
    captureMethod = 'image',
    coords = null,
    onProgress = null,
  } = options;

  if (!sessionId) {
    throw new Error('sessionId is required');
  }

  const workerCount = clampConcurrency(concurrency);
  const queueCards = await getQueueCardsForSession(sessionId, {
    includeFailed: includeFailed || retryFailed,
  });

  if (!queueCards.length) {
    const counts = await syncSessionCounts(sessionId);
    const leads = await collectSessionLeads(sessionId);
    return {
      sessionId,
      queued: 0,
      processed: 0,
      failed: 0,
      counts,
      leads,
    };
  }

  await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.PROCESSING);

  const cardQueue = [...queueCards];
  const results = [];

  const worker = async () => {
    while (cardQueue.length) {
      const card = cardQueue.shift();
      if (!card) continue;
      const result = await processSingleCard(card, { captureMethod, coords });
      results.push(result);
      if (typeof onProgress === 'function') {
        onProgress({
          cardId: result.cardId,
          success: result.success,
          remaining: cardQueue.length,
          total: queueCards.length,
        });
      }
    }
  };

  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  const processed = results.filter((r) => r.success).length;
  const failed = results.length - processed;
  const counts = await syncSessionCounts(sessionId);
  const leads = await collectSessionLeads(sessionId);

  return {
    sessionId,
    queued: queueCards.length,
    processed,
    failed,
    counts,
    leads,
    results,
  };
}

export async function processSessionEnrichmentQueue(options = {}) {
  const { sessionId, onProgress = null } = options;
  if (!sessionId) {
    throw new Error('sessionId is required');
  }
  if (!SCAN_ENRICHMENT_QUEUE_ENABLED) {
    return {
      sessionId,
      queued: 0,
      enriched: 0,
      failed: 0,
      counts: await syncSessionCounts(sessionId),
    };
  }

  await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.PROCESSING);

  const cards = await getEnrichmentQueueCardsForSession(sessionId);
  if (!cards.length) {
    const counts = await syncSessionCounts(sessionId);
    return {
      sessionId,
      queued: 0,
      enriched: 0,
      failed: 0,
      counts,
    };
  }

  const results = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    await updateScanCardFields(card.id, {
      status: SCAN_CARD_STATUS.ENRICHMENT_PENDING,
      error_message: null,
    });

    const enriched = await enrichCardParsedPayload(card);
    if (!enriched.success) {
      await updateScanCardFields(card.id, {
        status: SCAN_CARD_STATUS.FAILED_ENRICHMENT,
        error_message: enriched.error || 'Enrichment failed',
      });
    }

    results.push({
      cardId: card.id,
      success: enriched.success,
      error: enriched.error || null,
    });

    if (typeof onProgress === 'function') {
      onProgress({
        current: i + 1,
        total: cards.length,
        success: enriched.success,
        cardId: card.id,
      });
    }
  }

  const counts = await syncSessionCounts(sessionId);
  return {
    sessionId,
    queued: cards.length,
    enriched: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    counts,
    results,
  };
}

export function startSessionEnrichmentQueue(options = {}) {
  const { sessionId } = options;
  if (!SCAN_ENRICHMENT_QUEUE_ENABLED) return;
  if (!sessionId) return;
  if (enrichmentInFlightSessions.has(sessionId)) return;

  enrichmentInFlightSessions.add(sessionId);
  processSessionEnrichmentQueue(options)
    .catch((err) => {
      console.warn('[scanQueue] Background enrichment queue failed:', err);
    })
    .finally(() => {
      enrichmentInFlightSessions.delete(sessionId);
    });
}
