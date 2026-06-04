export const SCAN_SESSION_STATUS = {
  SCANNING: 'scanning',
  PROCESSING: 'processing',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  DISCARDED: 'discarded',
  FAILED: 'failed',
};

export const SCAN_CARD_STATUS = {
  CAPTURED: 'captured',
  OCR_PENDING: 'ocr_pending',
  OCR_PROCESSING: 'ocr_processing',
  OCR_COMPLETE: 'ocr_complete',
  READY_FOR_REVIEW: 'ready_for_review',
  PARSE_COMPLETE: 'parse_complete',
  NEEDS_REVIEW: 'needs_review',
  ENRICHMENT_PENDING: 'enrichment_pending',
  ENRICHED: 'enriched',
  FAILED_ENRICHMENT: 'failed_enrichment',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

export const SCAN_QUEUE_DEFAULT_CONCURRENCY = 1;
export const SCAN_QUEUE_MAX_CONCURRENCY = 3;

export const SCAN_SOURCES = {
  BUSINESS_CARD_BATCH: 'business_card_batch',
  BUSINESS_CARD_SINGLE: 'business_card_single',
  AI_SCAN: 'ai_scan',
  GALLERY: 'gallery',
};

export const DB_NAME = 'leadlens_scan.db';
