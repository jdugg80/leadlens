import { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Linking,
  BackHandler, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { read, utils } from 'xlsx';
import { COLORS, EMPTY_LEAD, STOREFRONT_SCAN_HISTORY_KEY, STOREFRONT_SCAN_LIMIT } from '../constants';
import { ScreenHeader, Card, SectionLabel } from '../components/UI';
import AILoader from '../components/AILoader';
import { extractLeadsWithDebugFromImage, enrichLead, enqueueExtractLeadsFromImage } from '../utils/claudeApi';
import { getCurrentCoords, geocodeBusinessNearby, reverseGeocodeCoords, getCameraHeading } from '../utils/geoEnrich';
import resolveZipFromLeadLockPhoto from '../utils/location/resolveZipFromLeadLockPhoto';
import { loadUserLearningProfile, recordUserActivityEvent } from '../utils/userLearning';
import { normalizeLead, inferVertical, findDuplicateInLeads, normalizeState, normalizeZip } from '../utils/leadHelpers';
import TutorialOverlay from '../components/TutorialOverlay';
import { annotateLeadForReview, expandCandidatesFromOcrSummary, buildDuplicateBadge } from '../utils/captureIntelligence';
import CameraModal from '../components/CameraModal';
import ScanCameraModal from '../components/ScanCameraModal';
import { storage as AsyncStorage } from '../utils/storage';
import { LEADS_STORAGE_KEY } from '../constants';
import { playCaptureSound, playErrorSound, playSuccessSound } from '../utils/soundManager';
import * as ImageManipulator from 'expo-image-manipulator';
import { cropImageToLeadLockTarget } from '../utils/leadLockImageCrop';
import { extractSocialLinksFromText, mergeSocialFieldsIntoLead } from '../utils/socialEnrichment';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import { processQueue } from '../utils/taskRunner';
import { enqueueTask, TASK_TYPES } from '../utils/taskQueue';
import useToast from '../hooks/useToast';
import BetaTracker from '../../utils/betaTracker';
import { initScanDb } from '../features/cardScan/storage/scanDb';
import {
  createScanSession,
  getActiveScanSessions,
  getScanSessionById,
  updateScanSessionStatus,
  incrementSessionCounts,
} from '../features/cardScan/storage/scanSessions';
import {
  createScanCard,
  getQueueCardsForSession,
  updateScanCardStatus,
  getCardsForSession,
} from '../features/cardScan/storage/scanCards';
import { SCAN_SOURCES, SCAN_SESSION_STATUS, SCAN_CARD_STATUS } from '../features/cardScan/constants/scanStatuses';
import { processScanSessionQueue, startSessionEnrichmentQueue } from '../features/cardScan/processing/scanQueueProcessor';
import {
  SCAN_RECOVERY_ENABLED,
  SCAN_QUEUE_PROCESSING_ENABLED,
  SCAN_ENRICHMENT_QUEUE_ENABLED,
} from '../config/featureFlags';

const SAFE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Detects API credit / quota exhaustion errors from Claude or Supabase edge functions
function isAiCreditError(err) {
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  return (
    msg.includes('credit') ||
    msg.includes('quota') ||
    msg.includes('billing') ||
    msg.includes('overloaded') ||
    msg.includes('529') ||
    msg.includes('402') ||
    (err.status === 402) ||
    (err.status === 529)
  );
}

const normalizeHeader = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_ALIASES = {
  businessName:  ['businessname', 'companyname', 'accountname', 'name', 'business'],
  pocFirst:      ['firstname', 'contactfirstname', 'pocfirstname', 'first'],
  pocLast:       ['lastname', 'contactlastname', 'poclastname', 'last'],
  phone:         ['phone', 'companyhqphone', 'companyphone', 'telephone', 'phonenumber'],
  email:         ['email', 'contactemail', 'companyemail', 'emailaddress'],
  website:       ['website', 'companywebsite', 'url', 'web', 'webaddress'],
  streetNumber:  ['streetnum', 'streetnumber', 'housenum', 'housenumber', 'addressnumber'],
  streetName:    ['streetname', 'street', 'road'],
  streetAddress: ['companystreetaddress', 'streetaddress', 'address', 'fulladdress'],
  addressLine2:  ['addressline2', 'address2', 'suite', 'unit', 'apt', 'line2'],
  city:          ['city', 'companycity', 'town'],
  state:         ['state', 'companystate', 'statecode'],
  zip:           ['zip', 'zipcode', 'postalcode', 'companyzipcode'],
  status:        ['status', 'leadstatus', 'prospectstatus'],
  propertyType:  ['propertytype', 'propertydescription', 'type', 'propertyclass'],
  employeeNum:   ['employeenum', 'employeenumber', 'empnum', 'repnum'],
  branchNum:     ['branch', 'branchnum', 'branchnumber', 'branchcode'],
};

function splitStreetAddress(address = '') {
  const cleaned = String(address).trim();
  // Match street number and the rest of the address
  const match = cleaned.match(/^(\d+)\s+(.*)$/);
  if (!match) return { streetNumber: '', streetName: cleaned, addressLine2: '' };

  const streetNumber = match[1];
  let remaining = match[2];

  // Try to extract common address line 2 prefixes
  const line2Regex = /\b(suite|ste\.?|unit|apt|apartment|#)\b\.?\s*([A-Za-z0-9-]+)\b/i;
  const line2Match = remaining.match(line2Regex);

  let addressLine2 = '';
  let streetName = remaining;

  if (line2Match) {
    const label = line2Match[1].toLowerCase();
    const value = line2Match[2];

    // Normalize label
    let normalizedLabel = 'Suite';
    if (label.includes('apt') || label.includes('apartment')) normalizedLabel = 'Apt';
    if (label.includes('unit')) normalizedLabel = 'Unit';
    if (label === '#') normalizedLabel = '#';

    addressLine2 = `${normalizedLabel} ${value}`;
    // Remove the line 2 part from the street name
    streetName = remaining.replace(line2Match[0], '').replace(/,\s*$/, '').replace(/\s+/g, ' ').trim();
  }

  return { streetNumber, streetName, addressLine2 };
}

function getMappedValue(row, aliases = []) {
  for (const [header, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(header)) && value) return String(value).trim();
  }
  return '';
}

// Build a column index from the first row's headers
function buildColumnIndex(firstRow) {
  const index = {};
  for (const header of Object.keys(firstRow)) {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (!(field in index) && aliases.includes(normalized)) {
        index[field] = header;
      }
    }
  }
  return index;
}

function getIndexedValue(row, colIndex, field) {
  const key = colIndex[field];
  if (!key) return '';
  const v = row[key];
  return v != null && v !== '' ? String(v).trim() : '';
}

function findPhoneInRow(row) {
  const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g;
  const candidates = [];

  for (const [key, value] of Object.entries(row)) {
    const strValue = String(value ?? '').trim();
    if (!strValue) continue;

    // 1. Exact digit match (10 or 11 digits)
    const justDigits = strValue.replace(/\D/g, '');
    if (justDigits.length === 10 || (justDigits.length === 11 && justDigits.startsWith('1'))) {
      const normalized = justDigits.length === 11 ? justDigits.slice(1) : justDigits;
      candidates.push({
        original: strValue,
        normalized,
        fieldName: key
      });
      continue;
    }

    // 2. Pattern match for formatted strings
    const matches = strValue.match(phoneRegex);
    if (matches) {
      matches.forEach(m => {
        const digits = m.replace(/\D/g, '');
        if (digits.length >= 10) {
          candidates.push({
            original: m,
            normalized: digits.length === 11 ? digits.slice(1) : digits,
            fieldName: key
          });
        }
      });
    }

    // 3. Fallback for scientific notation or weird Excel number formats
    if (!isNaN(value) && strValue.length > 8 && strValue.length < 15) {
        const d = String(Math.floor(Number(value))).replace(/\D/g, '');
        if (d.length === 10 || (d.length === 11 && d.startsWith('1'))) {
             candidates.push({
                original: d,
                normalized: d.length === 11 ? d.slice(1) : d,
                fieldName: key
            });
        }
    }
  }

  return Array.from(new Map(candidates.map(c => [c.normalized, c])).values());
}

function findEmailInRow(row) {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const candidates = [];

  for (const [key, value] of Object.entries(row)) {
    const strValue = String(value || '');
    const matches = strValue.match(emailRegex);
    if (matches) {
      matches.forEach(m => {
        candidates.push({
          original: m.toLowerCase().trim(),
          fieldName: key
        });
      });
    }
  }

  return Array.from(new Map(candidates.map(c => [c.original, c])).values());
}

function mergeTwoSidedValue(current, next, fallback = '') {
  const currentText = String(current || '').trim();
  if (currentText && currentText !== '.') return current;

  const nextText = String(next || '').trim();
  if (nextText && nextText !== '.') return next;

  return fallback;
}

function mergeTwoSidedCardLeads(leads = []) {
  const merged = leads.reduce((acc, lead) => {
    const next = normalizeLead(lead);

    return {
      ...acc,
      businessName: acc.businessName || next.businessName || '',
      pocFirst: mergeTwoSidedValue(acc.pocFirst, next.pocFirst, '.'),
      pocLast: mergeTwoSidedValue(acc.pocLast, next.pocLast, '.'),
      phone: acc.phone || next.phone || '',
      email: acc.email || next.email || '',
      streetNumber: acc.streetNumber || next.streetNumber || '',
      streetName: acc.streetName || next.streetName || '',
      addressLine2: acc.addressLine2 || next.addressLine2 || '',
      city: acc.city || next.city || '',
      state: acc.state || next.state || '',
      zip: acc.zip || next.zip || '',
      website: acc.website || next.website || '',
      facebookUrl: acc.facebookUrl || next.facebookUrl || '',
      instagramUrl: acc.instagramUrl || next.instagramUrl || '',
      linkedinUrl: acc.linkedinUrl || next.linkedinUrl || '',
      tiktokUrl: acc.tiktokUrl || next.tiktokUrl || '',
      youtubeUrl: acc.youtubeUrl || next.youtubeUrl || '',
      xUrl: acc.xUrl || next.xUrl || '',
      socialConfidence: acc.socialConfidence !== 'none' ? acc.socialConfidence : (next.socialConfidence || 'none'),
      socialSource: acc.socialSource || next.socialSource || '',
      notes: [acc.notes, next.notes].filter(Boolean).join(' | '),
      reviewLabels: Array.from(
        new Set([...(acc.reviewLabels || []), ...(next.reviewLabels || [])])
      ),
      reviewWarnings: Array.from(
        new Set([...(acc.reviewWarnings || []), ...(next.reviewWarnings || [])])
      ),
      captureMethod: 'business-card-2-sided',
      propertyType: 'Commercial',
      reviewed: false,
    };
  }, { ...EMPTY_LEAD });

  const inferred = inferVertical(merged);
  return {
    ...merged,
    ...inferred,
  };
}

export default function CaptureScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('CaptureScreen');
  }, []);

  useEffect(() => {
    initScanDb().catch((err) => {
      console.warn('[Capture] Failed to initialize scan DB:', err);
    });
  }, []);

  const { user } = route.params;
  const { showToast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [cameraModalConfig, setCameraModalConfig] = useState({ mode: 'portrait', title: '', subtitle: '' });
  const cameraModalCallback = useRef(null);
  const [scanCameraOpen, setScanCameraOpen] = useState(false);
  const scanCameraResolve = useRef(null);

  // Open custom camera modal with bounding box overlay
  // Prevent concurrent scan executions
  const scanInProgress = useRef(false);
  const currentCardScanSessionId = useRef(null);

  // ─── Leave-navigation guard state ───────────────────────────────────────
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [discardStep, setDiscardStep] = useState(false);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [recoverySession, setRecoverySession] = useState(null);
  const [recoveryCards, setRecoveryCards] = useState([]);
  const [recoveryReviewVisible, setRecoveryReviewVisible] = useState(false);
  const [recoveryReviewSummary, setRecoveryReviewSummary] = useState(null);
  const pendingLeaveEvent = useRef(null);
  const isBlockingRef = useRef(false);
  isBlockingRef.current = processing || scanInProgress.current;

  function clearScanBlockingState({ clearSession = true } = {}) {
    if (clearSession) currentCardScanSessionId.current = null;
    scanInProgress.current = false;
    isBlockingRef.current = false;
    setProcessing(false);
  }

  const refreshUnfinishedSessions = useCallback(async () => {
    if (!SCAN_RECOVERY_ENABLED) {
      setRecoverySession(null);
      setRecoveryCards([]);
      setRecoveryModalVisible(false);
      return;
    }
    try {
      const activeSessions = await getActiveScanSessions();
      if (!activeSessions?.length) {
        setRecoverySession(null);
        setRecoveryCards([]);
        setRecoveryModalVisible(false);
        return;
      }
      const session = activeSessions[0];
      const cards = await getCardsForSession(session.id);
      setRecoverySession(session);
      setRecoveryCards(cards || []);
      setRecoveryModalVisible(true);
    } catch (err) {
      console.warn('[Capture] Failed to load unfinished scan sessions:', err);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshUnfinishedSessions();
    }, [refreshUnfinishedSessions])
  );

  useEffect(() => {
    if (!SCAN_RECOVERY_ENABLED) return undefined;
    if (!recoveryModalVisible) return undefined;
    const timer = setInterval(() => {
      refreshUnfinishedSessions();
    }, 2500);
    return () => clearInterval(timer);
  }, [recoveryModalVisible, refreshUnfinishedSessions]);

  // ─── BackHandler for Android hardware back button ──────────────────────
  useEffect(() => {
    const onBackPress = () => {
      if (leaveModalVisible) {
        if (discardStep) {
          setDiscardStep(false);
        } else {
          setLeaveModalVisible(false);
          pendingLeaveEvent.current = null;
        }
        return true;
      }
      if (isBlockingRef.current) {
        setLeaveModalVisible(true);
        return true;
      }
      return false;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [leaveModalVisible, discardStep]);

  // ─── Prevent navigation-stack removal while scan/process is active ────
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isBlockingRef.current) return;
      e.preventDefault();
      pendingLeaveEvent.current = e;
      setLeaveModalVisible(true);
    });
    return unsubscribe;
  }, [navigation]);

  const logScanSessionSnapshot = useCallback(async (sessionId, reason = 'snapshot') => {
    if (!sessionId) return;
    try {
      const [session, cards] = await Promise.all([
        getScanSessionById(sessionId),
        getCardsForSession(sessionId),
      ]);
      const cardSummary = (cards || []).map((card) => ({
        id: card.id,
        card_index: card.card_index,
        status: card.status,
        original_image_uri: card.original_image_uri,
        updated_at: card.updated_at,
      }));
      console.log(`[Capture][ScanSessionDebug] ${reason} session:`, session);
      console.log(`[Capture][ScanSessionDebug] ${reason} cards(${cardSummary.length}):`, cardSummary);
    } catch (err) {
      console.warn('[Capture] Could not log scan session snapshot:', err);
    }
  }, []);

  const handleRecoveryDiscardBatch = useCallback(() => {
    if (!recoverySession?.id) return;
    Alert.alert(
      'Discard Unfinished Batch',
      'Are you sure you want to discard this unfinished batch? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            try {
              await updateScanSessionStatus(recoverySession.id, SCAN_SESSION_STATUS.DISCARDED);
              setRecoveryModalVisible(false);
              setRecoveryReviewVisible(false);
              setRecoverySession(null);
              setRecoveryCards([]);
            } catch (err) {
              console.warn('[Capture] Failed discarding recovery batch:', err);
            }
          },
        },
      ]
    );
  }, [recoverySession]);

  const handleRecoveryReviewCompleted = useCallback(() => {
    const cards = recoveryCards || [];
    const ocrComplete = cards.filter((card) => {
      if (
        card.status === SCAN_CARD_STATUS.OCR_COMPLETE
        || card.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
        || card.status === SCAN_CARD_STATUS.PARSE_COMPLETE
        || card.status === SCAN_CARD_STATUS.NEEDS_REVIEW
        || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
        || card.status === SCAN_CARD_STATUS.ENRICHED
        || card.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
        || card.status === SCAN_CARD_STATUS.COMPLETED
      ) return true;
      return !!card.raw_ocr_text || !!card.parsed_json;
    }).length;
    const parseComplete = cards.filter((card) => (
      card.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
      || card.status === SCAN_CARD_STATUS.PARSE_COMPLETE
      || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
      || card.status === SCAN_CARD_STATUS.ENRICHED
      || (card.status === SCAN_CARD_STATUS.COMPLETED && !!card.parsed_json)
    )).length;
    const readyForReview = cards.filter((card) => (
      card.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
      || card.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
      || card.status === SCAN_CARD_STATUS.ENRICHED
    )).length;
    const needsReview = cards.filter((card) => (
      card.status === SCAN_CARD_STATUS.NEEDS_REVIEW
      || card.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
      || card.status === SCAN_CARD_STATUS.FAILED
      || (!card.parsed_json && card.status !== SCAN_CARD_STATUS.OCR_PROCESSING)
    )).length;
    setRecoveryReviewSummary({
      total: cards.length,
      ocrComplete,
      parseComplete,
      readyForReview,
      needsReview,
    });
    setRecoveryReviewVisible(true);
  }, [recoveryCards]);

  const handleRecoveryResumeProcessing = useCallback(async () => {
    if (!recoverySession?.id) return;
    try {
      setRecoveryModalVisible(false);
      setProcessing(true);
      setProcessingMsg('Resuming unfinished cards...');
      let leads = [];
      const recoveryCaptureMethod = recoverySession?.source === SCAN_SOURCES.BUSINESS_CARD_BATCH
        ? 'business-card'
        : 'image';

      if (SCAN_QUEUE_PROCESSING_ENABLED) {
        const queueResult = await processScanSessionQueue({
          sessionId: recoverySession.id,
          includeFailed: true,
          retryFailed: true,
          captureMethod: recoveryCaptureMethod,
          concurrency: 1,
          onProgress: ({ total, remaining }) => {
            const done = Math.max(0, total - remaining);
            setProcessingMsg(`Resuming card ${done} of ${total}...`);
          },
        });
        leads = Array.isArray(queueResult?.leads) ? queueResult.leads : [];
      } else {
        const resumableCards = await getQueueCardsForSession(recoverySession.id, { includeFailed: true });
        const cardsWithUri = (resumableCards || [])
          .filter((card) => !!card.original_image_uri);
        const assets = cardsWithUri
          .map((card) => ({
            uri: card.original_image_uri,
            mimeType: 'image/jpeg',
          }));
        const cardRecordIds = cardsWithUri.map((card) => card.id);
        if (assets.length) {
          setProcessingMsg(`Resuming card queue (${assets.length} card${assets.length === 1 ? '' : 's'})...`);
          leads = await processAssets(assets, null, recoveryCaptureMethod, {
            scanSessionId: recoverySession.id,
            cardRecordIds,
            returnLeadsOnly: true,
          });
        }
      }

      if (!leads.length) {
        await refreshUnfinishedSessions();
        showThemedAlert('Nothing to Resume', 'No recoverable card output was found after processing.');
        return;
      }

      if (SCAN_ENRICHMENT_QUEUE_ENABLED) {
        startSessionEnrichmentQueue({ sessionId: recoverySession.id });
      }

      clearScanBlockingState({ clearSession: false });
      navigation.push('BatchReview', {
        user,
        leads,
        sourceLabel: `Recovered Batch — ${leads.length} prospect${leads.length === 1 ? '' : 's'} ready`,
      });
    } catch (err) {
      console.warn('[Capture] Failed resuming recovery batch:', err);
      await updateScanSessionStatus(recoverySession.id, SCAN_SESSION_STATUS.FAILED).catch((sessionErr) =>
        console.warn('[Capture] Failed to mark recovery session failed:', sessionErr)
      );
      setRecoveryModalVisible(true);
    } finally {
      setProcessing(false);
    }
  }, [navigation, recoverySession, refreshUnfinishedSessions, user]);

  // Opens in-app camera (CameraView) — returns a URI via promise
  const openScanCamera = () => new Promise((resolve) => {
    scanCameraResolve.current = resolve;
    setScanCameraOpen(true);
  });

  // ─── Single unified scan handler ───────────────────────────────────────────
  const handleScan = async () => {
    if (scanInProgress.current) return;
    // Clear any stuck state
    if (processing) { setProcessing(false); setProcessingMsg(''); }
    scanInProgress.current = true;
    // GPS runs in parallel while user takes photo — ready by processing time
    // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
    const coordsPromise = Promise.race([
      getCurrentCoords(),
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ]).catch(() => null);

    const assets = [];
    let keepScanning = true;

    while (keepScanning) {
      // Use in-app CameraView — no external intent, no Android activity issues
      const capture = await openScanCamera();

      if (!capture) {
        if (!assets.length) { scanInProgress.current = false; return; }
        break;
      }

      // capture is { uri, base64 } — store both so processAssets can skip file reading
      assets.push(capture);

      // Wait for ScanCameraModal to fully close before showing Alert
      // Android drops Alerts fired while a Modal is still animating out
      await new Promise(r => setTimeout(r, 450));

      await new Promise((resolve) => {
        Alert.alert(
          `Photo ${assets.length} captured`,
          'Add another photo?',
          [
            { text: 'Yes, add another', onPress: () => { keepScanning = true; resolve(); } },
            { text: 'No, process now', style: 'cancel', onPress: () => { keepScanning = false; resolve(); } },
          ]
        );
      });

      if (!keepScanning) break;
    }

    if (!assets.length) { scanInProgress.current = false; return; }

    // Race GPS against a 4s timeout — never let GPS block processing
    const coords = await Promise.race([
      coordsPromise,
      new Promise(r => setTimeout(() => r(null), 4000)),
    ]);

    setProcessing(true);
    setProcessingMsg(assets.length > 1
      ? `Reading ${assets.length} photos with AI...`
      : 'AI is reading your photo...');

    try {
      await processAssets(assets, coords, 'ai-scan');
    } catch (err) {
      console.error('[Capture] handleScan error:', err);
      BetaTracker.crash('CaptureScreen', err);
      showToast(`Scan Error: ${err.message || 'Could not process photos.'}`, 'error');
      setProcessing(false);
    } finally {
      scanInProgress.current = false;
    }
  };
  const handleCameraCapture = async (photo) => {
    try {
      // Safety check: ensure callback exists and only call once
      if (!cameraModalCallback.current) {
        console.warn('[Capture] No camera modal callback registered');
        return;
      }
      
      const callback = cameraModalCallback.current;
      cameraModalCallback.current = null; // Clear immediately to prevent double-call
      
      if (callback && typeof callback === 'function') {
        await callback(photo);
      } else {
        console.error('[Capture] Callback is not a function:', typeof callback);
      }
    } catch (err) {
      console.error('[Capture] Camera capture error:', err);
    }
  };

  // Promise-based camera opener using CameraModal instead of ImagePicker
  const openCameraWithModal = (config) => {
    return new Promise((resolve) => {
      // Set the callback BEFORE opening the modal, and do NOT pass it through
      // openCustomCamera (which would overwrite it with an empty function).
      cameraModalCallback.current = async (photo) => {
        if (!photo) { resolve(null); return; }
        try {
          const filename = `leadlens_${config.mode}_${Date.now()}.jpg`;
          const dest = `${FileSystem.documentDirectory}camera_captures/${filename}`;
          await FileSystem.makeDirectoryAsync(
            `${FileSystem.documentDirectory}camera_captures/`,
            { intermediates: true }
          );
          await FileSystem.writeAsStringAsync(dest, photo.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          resolve({ uri: dest });
        } catch (err) {
          console.error('[Capture] Error in openCameraWithModal:', err);
          resolve(null);
        }
      };
      // Open the modal directly — do NOT call openCustomCamera here or it
      // will overwrite cameraModalCallback.current with an empty function.
      setCameraModalConfig(config);
      setCameraModalVisible(true);
    });
  };

  const openCamera = async (quality = 0.75, skipPermissionRequest = false) => {
    try {
      try {
        let status = 'granted';
        if (!skipPermissionRequest) {
          let permResult = await ImagePicker.getCameraPermissionsAsync();
          if (permResult?.status !== 'granted') {
            permResult = await ImagePicker.requestCameraPermissionsAsync();
          }
          status = permResult.status;

          if (status !== 'granted') {
            if (!permResult.canAskAgain) {
              showThemedAlert(
                'Permission Blocked',
                'Camera access is permanently denied. Please enable it in your device settings to capture prospects.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
              );
            } else {
              showThemedAlert('Camera permission required', 'Please grant camera access to take photos.');
            }
            return null;
          }
        } else {
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality,
          allowsEditing: false,
          base64: false,
        });
        return result.canceled ? null : result.assets[0];
      } catch (permErr) {
        console.error('[Capture] Permission check error:', permErr);
        console.error('[Capture] Error message:', permErr.message);
        throw permErr;
      }
    } catch (err) {
      console.error('[Capture] FATAL openCamera error:', err);
      console.error('[Capture] Error stack:', err.stack);
      BetaTracker.crash('CaptureScreen', err);
      console.error('[Capture] openCamera error:', err);
      showThemedAlert('Camera Error', 'Could not open the system camera. Error: ' + err.message);
      return null;
    }
  };

  const persistImage = async (uri) => {
    try {
      if (!uri) return uri;
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      const filename = `leadlens_card_${Date.now()}.jpg`;
      const dest = `${FileSystem.documentDirectory}card_images/${filename}`;
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}card_images/`,
        { intermediates: true }
      );
      await FileSystem.copyAsync({ from: manipulated.uri, to: dest });
      return dest;
    } catch (err) {
      console.error('[Capture] persistImage error:', err);
      return uri;
    }
  };

  const readAsset = async (uri, mimeType, precomputedBase64 = null) => {
    // Use pre-computed base64 if available (e.g. from ScanCameraModal)
    // This avoids re-reading temp files that may have been cleaned up
    if (precomputedBase64) {
      return { b64: precomputedBase64, mime: mimeType || 'image/jpeg' };
    }
    try {
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return { b64, mime: mimeType || 'image/jpeg' };
    } catch (err) {
      console.error('[Capture] readAsset error:', err);
      return { b64: '', mime: 'image/jpeg' };
    }
  };

  const processAssets = async (assets, coords, captureMethod, options = null) => {
    console.log('[Capture] processAssets called with', assets?.length || 0, 'assets');
    if (!assets?.length) {
      showThemedAlert('No photos', 'Please capture at least one photo.');
      if (options?.returnLeadsOnly) return [];
      return;
    }

    const captureMethodKey = String(captureMethod || '').toLowerCase();
    const isBusinessCardCapture = captureMethodKey.includes('business-card') || captureMethodKey.includes('business_card');

    setProcessing(true);
    setProcessingMsg('Reading photos...');
    try {
      const leads = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const cardRecordId = options?.cardRecordIds?.[i] || null;
        setProcessingMsg(`Processing photo ${i + 1} of ${assets.length}...`);
        await new Promise((r) => setTimeout(r, 0));

        if (cardRecordId) {
          try {
            await updateScanCardStatus(cardRecordId, SCAN_CARD_STATUS.OCR_PENDING);
          } catch (cardStatusErr) {
            console.warn('[Capture] Failed to set card OCR_PENDING:', cardStatusErr);
          }
        }

        const permanentUri = await persistImage(asset.uri);
        const { b64, mime } = await readAsset(permanentUri, asset.mimeType, asset.base64);

        // Resolve photo location from EXIF GPS if available, or fall back to live coords
        let resolvedLocation = null;
        try {
          resolvedLocation = await resolveZipFromLeadLockPhoto({
            liveGps: coords ? { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy, timestamp: Date.now() } : null,
            photoExif: asset.exif || null,
            businessAddressZip: null,
            allowDeviceFallback: captureMethod === 'image',
          });
          console.log('[Capture] Resolved location for asset', i, ':', resolvedLocation?.source, resolvedLocation?.zip);
        } catch (locErr) {
          console.warn('[Capture] Location resolution failed for asset', i, ':', locErr);
        }

        try {
          const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime, { coords, captureMethod });
          let extractedLeads = (debugExtraction.leads?.length
            ? debugExtraction.leads
            : expandCandidatesFromOcrSummary(debugExtraction.ocrSummary, isBusinessCardCapture ? 'business_card' : 'storefront')) || [];

          if ((!Array.isArray(extractedLeads) || extractedLeads.length === 0) && String(debugExtraction?.ocrSummary || '').trim()) {
            const firstLine = String(debugExtraction.ocrSummary)
              .split(/\n|\||•|·/)
              .map((line) => String(line || '').trim())
              .find(Boolean) || 'Business Card Lead';
            extractedLeads = [{
              businessName: firstLine,
              notes: 'OCR fallback candidate',
              confidence: 'low',
            }];
          }

          if (extractedLeads.length) {
            setProcessingMsg(`Found ${extractedLeads.length} prospect${extractedLeads.length !== 1 ? 's' : ''} in photo ${i + 1}`);
            for (let lead of extractedLeads) {
              lead = normalizeLead(lead);
              lead.captureMethod = captureMethod;
              lead.imageUri = permanentUri;

              if (coords) {
                lead.latitude = coords.latitude;
                lead.longitude = coords.longitude;
              }

              // Attach resolved location data
              if (resolvedLocation) {
                lead.zip = resolvedLocation.zip || lead.zip || null;
                lead.photo_zip = resolvedLocation.zip || null;
                lead.latitude = resolvedLocation.latitude || lead.latitude || null;
                lead.longitude = resolvedLocation.longitude || lead.longitude || null;
                lead.location_source = resolvedLocation.source || 'unknown';
                lead.location_confidence = resolvedLocation.confidence ?? null;
                lead.location_warning = resolvedLocation.warning || null;
                lead.gps_accuracy_meters = resolvedLocation.gpsAccuracyMeters || null;
                lead.captured_at = resolvedLocation.capturedAt || new Date().toISOString();
              }

              const duplicateResult = findDuplicateInLeads(lead, leads);
              if (duplicateResult) {
                const duplicateIdx = duplicateResult.index;
                console.log('[Capture] Duplicate detected, merging into lead at index', duplicateIdx);
                leads[duplicateIdx] = {
                  ...leads[duplicateIdx],
                  ...lead,
                  notes: [leads[duplicateIdx].notes, lead.notes].filter(Boolean).join(' | '),
                };
              } else {
                leads.push(lead);
                BetaTracker.track('feature_use', { feature: 'Capture', action: 'prospect_captured', screen: 'CaptureScreen' });
              }
            }
          }
          if (cardRecordId) {
            try {
              await updateScanCardStatus(cardRecordId, SCAN_CARD_STATUS.COMPLETED);
            } catch (cardStatusErr) {
              console.warn('[Capture] Failed to set card COMPLETED:', cardStatusErr);
            }
          }
        } catch (extractErr) {
          console.warn('[Capture] Extraction error for asset', i, ':', extractErr);
          if (cardRecordId) {
            try {
              await updateScanCardStatus(cardRecordId, SCAN_CARD_STATUS.FAILED);
            } catch (cardStatusErr) {
              console.warn('[Capture] Failed to set card FAILED:', cardStatusErr);
            }
          }
          // ── AI credit / quota exhaustion — route to manual entry ──────────
          if (isAiCreditError(extractErr)) {
            setProcessing(false);
            scanInProgress.current = false;
            showThemedAlert(
              'AI assist unavailable',
              'Fill in what you can — your photo has been saved and you can re-scan later.',
              [
                { text: 'Enter Manually', onPress: () => {
                  navigation.navigate('ManualEntry', {
                    user,
                    prefill: { imageUri: permanentUri },
                    sourceLabel: 'Manual entry',
                  });
                }},
                { text: 'Cancel', style: 'cancel' },
              ]
            );
            if (options?.returnLeadsOnly) return [];
            return;
          }
        }
      }

      if (!leads.length) {
        showThemedAlert('No prospects found', 'Could not extract any prospect data from the photos.');
        if (options?.returnLeadsOnly) return [];
        return;
      }

      setProcessingMsg(`${leads.length} prospects ready`);
      await new Promise((r) => setTimeout(r, 120));

      if (options?.returnLeadsOnly) {
        return leads;
      }

      clearScanBlockingState({ clearSession: false });
      navigation.push('BatchReview', {
        user,
        leads,
        sourceLabel: captureMethod === 'gallery' ? 'Gallery import' : `AI Scan — ${leads.length} prospect${leads.length !== 1 ? 's' : ''} found`,
      });
    } catch (err) {
      BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      if (isAiCreditError(err)) {
        showThemedAlert(
          'AI assist unavailable',
          'Fill in what you can — enter prospect details manually.',
          [
            { text: 'Enter Manually', onPress: () => {
              navigation.navigate('ManualEntry', {
                user,
                prefill: {},
                sourceLabel: 'Manual entry',
              });
            }},
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      } else {
        showThemedAlert('Extraction error', err.message || 'Could not read image.');
      }
      if (options?.returnLeadsOnly) return [];
    } finally {
      setProcessing(false);
    }
  };

  // ─── Leave-navigation guard handlers ───────────────────────────────────
  const handleContinueScanning = useCallback(() => {
    pendingLeaveEvent.current = null;
    setLeaveModalVisible(false);
  }, []);

  const handlePauseResume = useCallback(() => {
    if (!SCAN_RECOVERY_ENABLED) {
      pendingLeaveEvent.current = null;
      setLeaveModalVisible(false);
      showThemedAlert('Paused', 'Scan recovery is currently disabled by feature flag. Continue scanning or discard this batch.');
      return;
    }
    const sessionId = currentCardScanSessionId.current;
    if (sessionId) {
      updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.PAUSED).catch((err) => {
        console.warn('[Capture] Failed to pause active scan session:', err);
      });
    }
    pendingLeaveEvent.current = null;
    setLeaveModalVisible(false);
    showThemedAlert('Paused', sessionId
      ? 'This scan batch was marked as paused. You can resume it from recovery.'
      : 'No active persistent session was found. Resume support for this scan type is coming in the next phase.');
  }, []);

  const handleConfirmDiscard = useCallback(() => {
    scanInProgress.current = false;
    isBlockingRef.current = false;
    setProcessing(false);
    setProcessingMsg('');
    setDiscardStep(false);
    setLeaveModalVisible(false);
    const event = pendingLeaveEvent.current;
    pendingLeaveEvent.current = null;
    if (event) {
      navigation.dispatch(event.data.action);
    }
  }, [navigation]);

  const handleIntelliVisionCapture = async () => {
    setProcessingMsg('Getting your location and heading...');
    setProcessing(true);
    try {
      // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
      const [coords, heading] = await Promise.all([
        Promise.race([
          getCurrentCoords(),
          new Promise(resolve => setTimeout(() => resolve(null), 5000)),
        ]).catch(() => null),
        getCameraHeading(),
      ]);
      setProcessing(false);

      const asset = await openCamera(0.85);
      if (!asset) return;

      setProcessing(true);
      setProcessingMsg('AI is reading the image...');
      const permanentUri = await persistImage(asset.uri);
      const { b64, mime } = await readAsset(permanentUri, asset.mimeType);
      const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime);
      const extractedLeads = (debugExtraction.leads?.length
        ? debugExtraction.leads
        : expandCandidatesFromOcrSummary(debugExtraction.ocrSummary, 'geotarget')) || [];

      setProcessing(false);

      navigation.navigate('LeadLockReview', {
        user,
        lead: extractedLeads[0] || { ...EMPTY_LEAD },
        allLeads: extractedLeads.length > 1 ? extractedLeads : null,
        coords,
        heading,
        imageUri: permanentUri,
      });
    } catch (err) {
      BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      showThemedAlert('LeadLock error', err.message || 'Could not start LeadLock™.');
    } finally {
      setProcessing(false);
    }
  };

  const captureMultiplePhotos = async (quality = 0.75, label = 'photo', skipPermission = false) => {
    const assets = [];
    let keepGoing = true;
    while (keepGoing) {
      const stepNum = assets.length + 1;
      if (assets.length > 0) {
        await new Promise((resolve) => {
          showThemedAlert(
            `Photo ${assets.length} captured`,
            'Do you have more photos to add?',
            [
              { text: 'Yes, add another', onPress: () => { keepGoing = true; resolve(); } },
              { text: 'No, process now', style: 'cancel', onPress: () => { keepGoing = false; resolve(); } },
            ]
          );
        });
        if (!keepGoing) break;
        // Wait for alert to fully dismiss before re-opening camera
        await new Promise(r => setTimeout(r, 500));
      }
      const asset = await openCamera(quality, skipPermission);
      if (!asset) {
        break;
      }
      assets.push(asset);
    }
    return assets;
  };

  const handleSingleCapture = async (isStorefront = false) => {
    let coords = null;
    if (isStorefront) {
      coords = await Promise.race([
        getCurrentCoords(),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
    }
    
    try {
      
      // Use modal-based camera with multi-capture support
      const assets = [];
      let keepCapturing = true;
      let captureCount = 0;
      
      while (keepCapturing) {
        captureCount++;
        await new Promise(r => setTimeout(r, 300));
        
        const asset = await openCameraWithModal({
          mode: 'portrait',
          title: 'General Photo Scan',
          subtitle: captureCount === 1 ? 'Capture a photo' : `Capture photo ${captureCount}`
        });
        
        if (!asset) {
          if (captureCount === 1) {
            // User cancelled on first capture
            setProcessing(false);
            return;
          }
          break;
        }
        
        assets.push(asset);
        
        // Ask after EVERY capture whether to add another
        await new Promise((resolve) => {
          showThemedAlert(
            `Photo ${captureCount} captured`,
            'Do you have more photos to add?',
            [
              { text: 'Yes, add another', onPress: () => { keepCapturing = true; resolve(); } },
              { text: 'No, process now', style: 'cancel', onPress: () => { keepCapturing = false; resolve(); } },
            ]
          );
        });
        if (!keepCapturing) break;
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (!assets.length) {
        return;
      }
      
      setProcessing(true);
      setProcessingMsg('Processing photos...');
      await processAssets(assets, coords, isStorefront ? 'storefront' : 'image');
    } catch (err) {
      console.error('[Capture] handleSingleCapture error:', err);
      BetaTracker.crash('CaptureScreen', err);
      showThemedAlert('Capture Error', err.message || 'Could not complete capture.');
      setProcessing(false);
    }
  };

  const handleCardCapture = async () => {
    // Request camera permissions BEFORE showing the alert modal.
    // On Android, calling requestCameraPermissionsAsync() while a modal is
    // still dismissing causes the permission dialog to hang silently.
    try {
      let permResult = await ImagePicker.getCameraPermissionsAsync();
      if (permResult?.status !== 'granted') {
        permResult = await ImagePicker.requestCameraPermissionsAsync();
      }
      const { status, canAskAgain } = permResult;
      if (status !== 'granted') {
        if (!canAskAgain) {
          showThemedAlert(
            'Permission Blocked',
            'Camera access is permanently denied. Please enable it in your device settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        } else {
          showThemedAlert('Camera permission required', 'Please grant camera access to take photos.');
        }
        return;
      }
    } catch (permErr) {
      console.error('[Capture] Permission error in handleCardCapture:', permErr);
      return;
    }

    showThemedAlert('Business Card', 'Choose how you want to scan the card.', [
      {
        text: 'Single-Sided',
        onPress: async () => {
          scanInProgress.current = true;
          let sessionId = null;
          try {
            await new Promise(r => setTimeout(r, 500));
            try {
              sessionId = await createScanSession({ source: SCAN_SOURCES.BUSINESS_CARD_BATCH });
              currentCardScanSessionId.current = sessionId;
            } catch (sessionErr) {
              console.warn('[Capture] Could not create scan session:', sessionErr);
            }
            const assets = [];
            let keepScanning = true;

            while (keepScanning) {
              const asset = await openCameraWithModal({
                mode: 'portrait',
                title: assets.length === 0 ? 'Business Card' : `Business Card ${assets.length + 1}`,
                subtitle: 'Position card in frame'
              });

              if (!asset) break;
              assets.push(asset);
              if (sessionId) {
                const cardIndex = assets.length - 1;
                try {
                  const cardId = await createScanCard({
                    sessionId,
                    cardIndex,
                    originalImageUri: asset.uri,
                    ocrImageUri: null,
                    status: SCAN_CARD_STATUS.CAPTURED,
                  });
                  await updateScanCardStatus(cardId, SCAN_CARD_STATUS.OCR_PENDING);
                  await incrementSessionCounts(sessionId, {
                    total_cards: 1,
                    last_processed_index: cardIndex,
                  });
                  await logScanSessionSnapshot(sessionId, `single-sided captured card ${cardIndex + 1}`);
                } catch (cardSaveErr) {
                  console.warn('[Capture] Failed to persist captured card:', cardSaveErr);
                }
              }

              // Ask after each card if there are more to scan
              await new Promise((resolve) => {
                showThemedAlert(
                  `Card ${assets.length} captured`,
                  'Scan another card?',
                  [
                    { text: 'Yes, scan another', onPress: () => { keepScanning = true; resolve(); } },
                    { text: 'No, process now', style: 'cancel', onPress: () => { keepScanning = false; resolve(); } },
                  ]
                );
              });
              if (!keepScanning) break;
              await new Promise(r => setTimeout(r, 500));
            }

            if (!assets.length) {
              if (sessionId) {
                await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.DISCARDED);
                await logScanSessionSnapshot(sessionId, 'single-sided discarded before processing');
                currentCardScanSessionId.current = null;
              }
              return;
            }
            setProcessing(true);
            setProcessingMsg(assets.length > 1 ? `Reading ${assets.length} cards...` : 'Reading card...');
            if (!sessionId || !SCAN_QUEUE_PROCESSING_ENABLED) {
              const leads = await processAssets(assets, null, 'business-card', {
                returnLeadsOnly: true,
              });
              if (sessionId) {
                await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.COMPLETED).catch((sessionErr) =>
                  console.warn('[Capture] Failed to mark scan session completed:', sessionErr)
                );
              }
              if (leads?.length) {
                clearScanBlockingState();
                navigation.push('BatchReview', {
                  user,
                  leads,
                  sourceLabel: `Business Card Batch — ${leads.length} prospect${leads.length === 1 ? '' : 's'} found`,
                });
              }
              return;
            }
            const queueResult = await processScanSessionQueue({
              sessionId,
              includeFailed: false,
              captureMethod: 'business-card',
              concurrency: 1,
              onProgress: ({ total, remaining }) => {
                const done = Math.max(0, total - remaining);
                setProcessingMsg(`Processing card ${done} of ${total}...`);
              },
            });
            const leads = queueResult?.leads || [];
            if (!leads.length) {
              showThemedAlert('No prospects found', 'Could not extract any prospect data from the cards.');
            } else {
              if (SCAN_ENRICHMENT_QUEUE_ENABLED) {
                startSessionEnrichmentQueue({ sessionId });
              }
              clearScanBlockingState();
              navigation.push('BatchReview', {
                user,
                leads,
                sourceLabel: `Business Card Batch — ${leads.length} prospect${leads.length === 1 ? '' : 's'} found`,
              });
            }
            if (sessionId) {
              await logScanSessionSnapshot(sessionId, 'single-sided completed');
              currentCardScanSessionId.current = null;
            }
          } catch (err) {
            console.error('[Capture] Single-sided capture error:', err);
            BetaTracker.crash('CaptureScreen', err);
            showThemedAlert('Capture Error', err.message || 'Could not capture business card.');
            if (sessionId) {
              await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.FAILED);
              await logScanSessionSnapshot(sessionId, 'single-sided failed');
              currentCardScanSessionId.current = null;
            }
          } finally {
            setProcessing(false);
            scanInProgress.current = false;
          }
        },
      },
      {
        text: 'Front & Back',
        onPress: async () => {
          scanInProgress.current = true;
          let sessionId = null;
          try {
            try {
              sessionId = await createScanSession({ source: SCAN_SOURCES.BUSINESS_CARD_BATCH });
              currentCardScanSessionId.current = sessionId;
            } catch (sessionErr) {
              console.warn('[Capture] Could not create front/back scan session:', sessionErr);
            }
            
            await new Promise((resolve) => {
              showThemedAlert('Step 1 of 2', 'Take a photo of the FRONT of the card', [
                { text: 'Ready', onPress: resolve }
              ]);
            });
            // Give the modal time to fully close
            await new Promise(r => setTimeout(r, 500));
            
            const front = await openCameraWithModal({
              mode: 'portrait',
              title: 'Business Card - Front',
              subtitle: 'Position front of card in frame'
            });
            
            if (!front) {
              if (sessionId) {
                await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.DISCARDED);
                await logScanSessionSnapshot(sessionId, 'front-back discarded before front capture');
                currentCardScanSessionId.current = null;
              }
              return;
            }
            if (sessionId) {
              try {
                const frontCardId = await createScanCard({
                  sessionId,
                  cardIndex: 0,
                  originalImageUri: front.uri,
                  ocrImageUri: null,
                  status: SCAN_CARD_STATUS.CAPTURED,
                });
                await updateScanCardStatus(frontCardId, SCAN_CARD_STATUS.OCR_PENDING);
                await incrementSessionCounts(sessionId, {
                  total_cards: 1,
                  last_processed_index: 0,
                });
                await logScanSessionSnapshot(sessionId, 'front-back captured front card');
              } catch (cardSaveErr) {
                console.warn('[Capture] Failed to persist front card:', cardSaveErr);
              }
            }

            await new Promise((resolve) => {
              showThemedAlert('Step 2 of 2', 'Now take a photo of the BACK of the card', [
                { text: 'Ready', onPress: resolve }
              ]);
            });
            // Give the modal time to fully close
            await new Promise(r => setTimeout(r, 500));
            
            const back = await openCameraWithModal({
              mode: 'portrait',
              title: 'Business Card - Back',
              subtitle: 'Position back of card in frame'
            });
            
            if (!back) {
              if (sessionId) {
                await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.DISCARDED);
                await logScanSessionSnapshot(sessionId, 'front-back discarded before back capture');
                currentCardScanSessionId.current = null;
              }
              return;
            }
            if (sessionId) {
              try {
                const backCardId = await createScanCard({
                  sessionId,
                  cardIndex: 1,
                  originalImageUri: back.uri,
                  ocrImageUri: null,
                  status: SCAN_CARD_STATUS.CAPTURED,
                });
                await updateScanCardStatus(backCardId, SCAN_CARD_STATUS.OCR_PENDING);
                await incrementSessionCounts(sessionId, {
                  total_cards: 1,
                  last_processed_index: 1,
                });
                await logScanSessionSnapshot(sessionId, 'front-back captured back card');
              } catch (cardSaveErr) {
                console.warn('[Capture] Failed to persist back card:', cardSaveErr);
              }
            }

            const frontBackCaptureMethod = 'business-card-2-sided';
            setProcessing(true);
            setProcessingMsg('Processing both sides...');
            if (!sessionId || !SCAN_QUEUE_PROCESSING_ENABLED) {
              const extractedLeads = await processAssets([front, back], null, frontBackCaptureMethod, {
                returnLeadsOnly: true,
              });
              const leads = frontBackCaptureMethod === 'business-card-2-sided' && extractedLeads?.length
                ? [mergeTwoSidedCardLeads(extractedLeads)]
                : (extractedLeads || []);
              if (sessionId) {
                await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.COMPLETED).catch((sessionErr) =>
                  console.warn('[Capture] Failed to mark scan session completed:', sessionErr)
                );
              }
              if (leads.length) {
                clearScanBlockingState();
                navigation.push('BatchReview', {
                  user,
                  leads,
                  sourceLabel: 'Business Card Front & Back — 1 prospect found',
                });
              }
              return;
            }
            const queueResult = await processScanSessionQueue({
              sessionId,
              includeFailed: false,
              captureMethod: frontBackCaptureMethod,
              concurrency: 1,
              onProgress: ({ total, remaining }) => {
                const done = Math.max(0, total - remaining);
                setProcessingMsg(`Processing card ${done} of ${total}...`);
              },
            });
            const extractedLeads = queueResult?.leads || [];
            const leads = frontBackCaptureMethod === 'business-card-2-sided' && extractedLeads.length
              ? [mergeTwoSidedCardLeads(extractedLeads)]
              : extractedLeads;
            if (!leads.length) {
              showThemedAlert('No prospects found', 'Could not extract any prospect data from the cards.');
            } else {
              if (SCAN_ENRICHMENT_QUEUE_ENABLED) {
                startSessionEnrichmentQueue({ sessionId });
              }
              clearScanBlockingState();
              navigation.push('BatchReview', {
                user,
                leads,
                sourceLabel: 'Business Card Front & Back — 1 prospect found',
              });
            }
            if (sessionId) {
              await logScanSessionSnapshot(sessionId, 'front-back completed');
              currentCardScanSessionId.current = null;
            }
          } catch (err) {
            console.error('[Capture] Front & Back capture error:', err);
            BetaTracker.crash('CaptureScreen', err);
            showThemedAlert('Capture Error', err.message || 'Could not capture business card.');
            if (sessionId) {
              await updateScanSessionStatus(sessionId, SCAN_SESSION_STATUS.FAILED);
              await logScanSessionSnapshot(sessionId, 'front-back failed');
              currentCardScanSessionId.current = null;
            }
          } finally {
            setProcessing(false);
            scanInProgress.current = false;
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openGallery = async () => {
    try {
      let permResult = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (permResult?.status !== 'granted') {
        permResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      const { status, canAskAgain } = permResult;

      if (status !== 'granted') {
        if (!canAskAgain) {
          showThemedAlert(
            'Permission Blocked',
            'Photo library access is permanently denied. Please enable it in your device settings to import prospects.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
        } else {
          showThemedAlert('Permission required', 'Please grant photo library access to choose images.');
        }
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        base64: false,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Extract EXIF GPS data from gallery images for location resolution
        for (const asset of result.assets) {
          if (asset.exif) {
          }
        }
        await processAssets(result.assets, null, 'image');
      }
    } catch (err) {
      BetaTracker.crash('CaptureScreen', err);
      console.error('[Capture] openGallery error:', err);
      showThemedAlert('Gallery Error', 'Could not open the photo library.');
    }
  };

  const handleExcelImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setProcessing(true);
      setProcessingMsg('Reading file…');
      await new Promise((r) => setTimeout(r, 0));

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setProcessingMsg('Parsing spreadsheet…');
      await new Promise((r) => setTimeout(r, 0));

      let wb, ws, rows;
      try {
        wb = read(b64, { type: 'base64', cellDates: true, cellNF: false, cellHTML: false });
        if (!wb || !wb.SheetNames || !wb.SheetNames.length) {
          showThemedAlert('Invalid file', 'The file does not appear to be a valid spreadsheet.');
          return;
        }
        ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          showThemedAlert('Empty spreadsheet', 'The spreadsheet has no data to import.');
          return;
        }
        rows = utils.sheet_to_json(ws, { defval: '' });
      } catch (parseErr) {
        console.error('[Capture] Parse error:', parseErr);
        showThemedAlert('Parse error', 'Could not read the spreadsheet file. Ensure it is a valid Excel file.');
        return;
      }

      if (!rows.length) {
        showThemedAlert('No prospects found', 'The spreadsheet did not contain recognizable prospect rows.');
        return;
      }

      const colIndex = buildColumnIndex(rows[0]);

      const CHUNK = 100;
      const leads = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, rows.length);
        setProcessingMsg(`Processing ${end} of ${rows.length} rows…`);
        await new Promise((r) => setTimeout(r, 0));

        const chunk = rows.slice(i, end);
        for (const row of chunk) {
          const phoneCandidates = findPhoneInRow(row);
          const emailCandidates = findEmailInRow(row);

          const phone = phoneCandidates[0]?.normalized || '';
          const email = emailCandidates[0]?.original || '';

          const streetAddress = getIndexedValue(row, colIndex, 'streetAddress');
          const { streetNumber, streetName, addressLine2 } = streetAddress
            ? splitStreetAddress(streetAddress)
            : {
                streetNumber: getIndexedValue(row, colIndex, 'streetNumber'),
                streetName: getIndexedValue(row, colIndex, 'streetName'),
                addressLine2: getIndexedValue(row, colIndex, 'addressLine2'),
              };

          const lead = {
            ...EMPTY_LEAD,
            businessName: getIndexedValue(row, colIndex, 'businessName'),
            pocFirst: getIndexedValue(row, colIndex, 'pocFirst'),
            pocLast: getIndexedValue(row, colIndex, 'pocLast'),
            phone,
            email,
            website: getIndexedValue(row, colIndex, 'website'),
            streetNumber,
            streetName,
            addressLine2,
            city: getIndexedValue(row, colIndex, 'city'),
            state: normalizeState(getIndexedValue(row, colIndex, 'state')),
            zip: normalizeZip(getIndexedValue(row, colIndex, 'zip')),
            propertyType: getIndexedValue(row, colIndex, 'propertyType') || 'Commercial',
            captureMethod: 'spreadsheet-import',
            reviewed: false,
          };

          leads.push(lead);
        }
      }

      if (!leads.length) {
        showThemedAlert('No valid prospects', 'Could not extract any valid prospect rows from the spreadsheet.');
        return;
      }

      setProcessingMsg(`${leads.length} prospects ready`);
      await new Promise((r) => setTimeout(r, 120));

      clearScanBlockingState({ clearSession: false });
      navigation.push('BatchReview', {
        user,
        leads,
        sourceLabel: 'Excel import',
      });
    } catch (err) {
      BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      const errorMsg = err?.message || 'Could not read the spreadsheet.';
      showThemedAlert('Import failed', errorMsg);
      console.error('[Capture] handleExcelImport error:', err);
    } finally {
      setProcessing(false);
    }
  };

  const recoveryTotalCards = recoverySession?.total_cards ?? recoveryCards.length ?? 0;
  const recoveryProcessedCards = recoverySession?.processed_count ?? recoveryCards.filter((c) => (
    c.status === SCAN_CARD_STATUS.READY_FOR_REVIEW
    || c.status === SCAN_CARD_STATUS.PARSE_COMPLETE
    || c.status === SCAN_CARD_STATUS.NEEDS_REVIEW
    || c.status === SCAN_CARD_STATUS.ENRICHMENT_PENDING
    || c.status === SCAN_CARD_STATUS.ENRICHED
    || c.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
    || c.status === SCAN_CARD_STATUS.COMPLETED
  )).length;
  const recoveryFailedCards = recoverySession?.failed_count ?? recoveryCards.filter((c) => (
    c.status === SCAN_CARD_STATUS.FAILED
    || c.status === SCAN_CARD_STATUS.FAILED_ENRICHMENT
  )).length;
  const recoveryRemainingCards = Math.max(0, recoveryTotalCards - recoveryProcessedCards - recoveryFailedCards);
  const recoveryQueueCounts = recoveryCards.reduce((acc, card) => {
    const key = String(card?.status || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const recoveryQueueRows = [
    { key: SCAN_CARD_STATUS.CAPTURED, label: 'Captured' },
    { key: SCAN_CARD_STATUS.OCR_PENDING, label: 'OCR Pending' },
    { key: SCAN_CARD_STATUS.OCR_PROCESSING, label: 'OCR Processing' },
    { key: SCAN_CARD_STATUS.OCR_COMPLETE, label: 'OCR Complete' },
    { key: SCAN_CARD_STATUS.READY_FOR_REVIEW, label: 'Ready for Review' },
    { key: SCAN_CARD_STATUS.NEEDS_REVIEW, label: 'Needs Review' },
    { key: SCAN_CARD_STATUS.ENRICHMENT_PENDING, label: 'Enrichment Pending' },
    { key: SCAN_CARD_STATUS.ENRICHED, label: 'Enriched' },
    { key: SCAN_CARD_STATUS.FAILED_ENRICHMENT, label: 'Failed Enrichment' },
    { key: SCAN_CARD_STATUS.PARSE_COMPLETE, label: 'Parse Complete (Legacy)' },
    { key: SCAN_CARD_STATUS.FAILED, label: 'Failed' },
    { key: SCAN_CARD_STATUS.COMPLETED, label: 'Completed (Legacy)' },
  ];
  const recoveryQueueColorMap = {
    [SCAN_CARD_STATUS.CAPTURED]: COLORS.chrome,
    [SCAN_CARD_STATUS.OCR_PENDING]: COLORS.warning,
    [SCAN_CARD_STATUS.OCR_PROCESSING]: COLORS.accent,
    [SCAN_CARD_STATUS.OCR_COMPLETE]: COLORS.success,
    [SCAN_CARD_STATUS.READY_FOR_REVIEW]: COLORS.success,
    [SCAN_CARD_STATUS.PARSE_COMPLETE]: COLORS.success,
    [SCAN_CARD_STATUS.NEEDS_REVIEW]: COLORS.warning,
    [SCAN_CARD_STATUS.ENRICHMENT_PENDING]: COLORS.accent,
    [SCAN_CARD_STATUS.ENRICHED]: COLORS.success,
    [SCAN_CARD_STATUS.FAILED_ENRICHMENT]: COLORS.danger,
    [SCAN_CARD_STATUS.FAILED]: COLORS.danger,
    [SCAN_CARD_STATUS.COMPLETED]: COLORS.label,
  };
  const recoveryQueueRowsWithColor = recoveryQueueRows.map((row) => ({
    ...row,
    count: recoveryQueueCounts[row.key] || 0,
    color: recoveryQueueColorMap[row.key] || COLORS.textDim,
  }));

  return (
    <View style={s.root}>
      <ThemedAlertHost />
      <ScreenHeader title="Capture" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
        <SectionLabel>Fast Capture</SectionLabel>
        <Card>
          <TouchableOpacity style={[s.actionBtn, s.scanBtn]} onPress={() => navigation.navigate('PhotoIngest', { user })}>
            <View style={s.intellivisionHeader}>
              <Text style={s.intellivisionIcon}>📷</Text>
              <View>
                <Text style={[s.actionTitle, { color: COLORS.accent }]}>AI Scan</Text>
                <Text style={s.intellivisionBadge}>All-Around Prospect Capture</Text>
              </View>
            </View>
            <Text style={s.actionSub}>Point at anything — business cards, storefronts, signage, or a strip mall. AI identifies what it is, extracts all contact info, and fills in missing details automatically. Add multiple photos in one scan.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={handleCardCapture}>
            <Text style={s.actionTitle}>📇 Business Card Batch</Text>
            <Text style={s.actionSub}>Capture cards now, then process from persistent queue</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, s.intellivisionBtn]} onPress={() => navigation.navigate('LeadLockCamera', { user })}>
            <View style={s.intellivisionHeader}>
              <Text style={s.intellivisionIcon}>⚡</Text>
              <View>
                <Text style={[s.actionTitle, { color: COLORS.accent }]}>LeadLock™</Text>
                <Text style={s.intellivisionBadge}> Long-Range AI Assisted Capture</Text>
              </View>
            </View>
            <Text style={s.actionSub}>Precision targeting mode. Use when you can't get close — captures GPS, compass heading, and zoom offset to identify distant storefronts and businesses across a parking lot.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={openGallery}>
            <Text style={s.actionTitle}>🖼️ Choose From Gallery</Text>
            <Text style={s.actionSub}>Import an existing photo or screenshot</Text>
          </TouchableOpacity>
        </Card>

        <SectionLabel>Imports</SectionLabel>
        <Card>
          <TouchableOpacity style={s.actionBtn} onPress={handleExcelImport}>
            <Text style={s.actionTitle}>📊 Import Spreadsheet</Text>
            <Text style={s.actionSub}>Excel or CSV - Review in Batch Review before saving</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {processing && (
        <View style={s.loaderOverlay} pointerEvents="none">
          <AILoader />
          <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 14 }} />
          <Text style={s.loaderText}>{processingMsg || 'Working...'}</Text>
        </View>
      )}

      {/* In-app scan camera — uses CameraView, no Android intent issues */}
      <ScanCameraModal
        visible={scanCameraOpen}
        onCapture={(capture) => {
          setScanCameraOpen(false);
          if (scanCameraResolve.current) {
            const resolve = scanCameraResolve.current;
            scanCameraResolve.current = null;
            resolve(capture); // { uri, base64 }
          }
        }}
        onClose={() => {
          setScanCameraOpen(false);
          if (scanCameraResolve.current) {
            const resolve = scanCameraResolve.current;
            scanCameraResolve.current = null;
            resolve(null);
          }
        }}
      />

      <CameraModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onCapture={handleCameraCapture}
        title={cameraModalConfig.title}
        subtitle={cameraModalConfig.subtitle}
        mode={cameraModalConfig.mode}
        quality={0.85}
      />

      <Modal
        visible={SCAN_RECOVERY_ENABLED && recoveryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryModalVisible(false)}
      >
        <View style={s.leaveOverlay}>
          <View style={s.leaveModal}>
            <Text style={s.leaveTitle}>Unfinished Scan Found</Text>
            <Text style={s.leaveBody}>
              Resume your previous business-card batch or review what was already processed.
            </Text>

            <View style={s.recoveryStatsWrap}>
              <Text style={s.recoveryStatLine}>Total Cards: {recoveryTotalCards}</Text>
              <Text style={s.recoveryStatLine}>Processed Cards: {recoveryProcessedCards}</Text>
              <Text style={s.recoveryStatLine}>Failed Cards: {recoveryFailedCards}</Text>
              <Text style={s.recoveryStatLine}>Remaining Cards: {recoveryRemainingCards}</Text>
            </View>

            <View style={s.recoveryQueuePanel}>
              <Text style={s.recoveryQueueTitle}>Queue Status (Live)</Text>
              {recoveryQueueRowsWithColor.map((row) => (
                <Text key={row.key} style={[s.recoveryQueueLine, { color: row.count > 0 ? row.color : COLORS.muted }]}>
                  {row.label}: {row.count}
                </Text>
              ))}
              <TouchableOpacity
                style={s.recoveryRefreshBtn}
                onPress={refreshUnfinishedSessions}
              >
                <Text style={s.recoveryRefreshBtnText}>Refresh Queue Snapshot</Text>
              </TouchableOpacity>
            </View>

            <View style={s.leaveActions}>
              <TouchableOpacity
                style={[s.leaveBtn, s.leaveBtnPrimary]}
                onPress={handleRecoveryResumeProcessing}
              >
                <Text style={s.leaveBtnTextPrimary}>Resume Processing</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.leaveBtn, s.leaveBtnSecondary]}
                onPress={handleRecoveryReviewCompleted}
              >
                <Text style={s.leaveBtnTextSecondary}>Review Completed Cards</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.leaveBtn, s.leaveBtnDanger]}
                onPress={handleRecoveryDiscardBatch}
              >
                <Text style={s.leaveBtnTextDanger}>Discard Batch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={SCAN_RECOVERY_ENABLED && recoveryReviewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryReviewVisible(false)}
      >
        <View style={s.leaveOverlay}>
          <View style={s.leaveModal}>
            <Text style={s.leaveTitle}>Completed Card Review</Text>
            <Text style={s.leaveBody}>Current OCR/parse readiness breakdown for this unfinished batch.</Text>
            <View style={s.recoveryStatsWrap}>
              <Text style={s.recoveryStatLine}>OCR Complete: {recoveryReviewSummary?.ocrComplete ?? 0}</Text>
              <Text style={s.recoveryStatLine}>Parse Complete: {recoveryReviewSummary?.parseComplete ?? 0}</Text>
              <Text style={s.recoveryStatLine}>Ready for Review: {recoveryReviewSummary?.readyForReview ?? 0}</Text>
              <Text style={s.recoveryStatLine}>Needs Review: {recoveryReviewSummary?.needsReview ?? 0}</Text>
            </View>
            <TouchableOpacity
              style={[s.leaveBtn, s.leaveBtnSecondary]}
              onPress={() => setRecoveryReviewVisible(false)}
            >
              <Text style={s.leaveBtnTextSecondary}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ─── Leave-navigation confirmation modal ──────────────────────── */}
      <Modal
        visible={leaveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (discardStep) {
            setDiscardStep(false);
          } else {
            setLeaveModalVisible(false);
            pendingLeaveEvent.current = null;
          }
        }}
      >
        <View style={s.leaveOverlay}>
          <View style={s.leaveModal}>
            {discardStep ? (
              <>
                <Text style={s.leaveTitle}>Discard Batch?</Text>
                <Text style={s.leaveBody}>All captured data will be lost. This cannot be undone.</Text>
                <View style={s.leaveActions}>
                  <TouchableOpacity
                    style={[s.leaveBtn, s.leaveBtnSecondary]}
                    onPress={() => setDiscardStep(false)}
                  >
                    <Text style={s.leaveBtnTextSecondary}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.leaveBtn, s.leaveBtnDanger]}
                    onPress={handleConfirmDiscard}
                  >
                    <Text style={s.leaveBtnTextDanger}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={s.leaveTitle}>Leave Scanner?</Text>
                <Text style={s.leaveBody}>You have an active scan or processing batch.</Text>
                <View style={s.leaveActions}>
                  <TouchableOpacity
                    style={[s.leaveBtn, s.leaveBtnPrimary]}
                    onPress={handleContinueScanning}
                  >
                    <Text style={s.leaveBtnTextPrimary}>Continue Scanning</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.leaveBtn, s.leaveBtnSecondary]}
                    onPress={handlePauseResume}
                  >
                    <Text style={s.leaveBtnTextSecondary}>Pause and Resume Later</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.leaveBtn, s.leaveBtnDanger]}
                    onPress={() => setDiscardStep(true)}
                  >
                    <Text style={s.leaveBtnTextDanger}>Discard Batch</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  actionBtn: {
    borderWidth: 1, borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface2,
    borderRadius: 14, padding: 16, marginBottom: 10,
    position: 'relative', overflow: 'hidden',
  },
  geoTargetBtn: {
    borderColor: 'rgba(0,229,160,0.4)',
    backgroundColor: 'rgba(0,229,160,0.05)',
  },
  intellivisionBtn: {
    borderColor: 'rgba(0,201,255,0.45)',
    backgroundColor: 'rgba(0,201,255,0.05)',
  },
  scanBtn: {
    borderColor: 'rgba(0,201,255,0.3)',
    backgroundColor: 'rgba(0,201,255,0.03)',
  },
  intellivisionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  intellivisionIcon: { fontSize: 28 },
  intellivisionBadge: {
    fontSize: 9, color: COLORS.accent, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase',
  },
  actionTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  actionSub: { color: COLORS.muted, fontSize: 12, marginTop: 5, lineHeight: 17 },

  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,15,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loaderText: {
    color: COLORS.textDim, marginTop: 14,
    textAlign: 'center', fontSize: 13, lineHeight: 20,
  },

  // ─── Leave-navigation modal ──────────────────────────────────────────
  leaveOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  leaveModal: {
    backgroundColor: COLORS.surface2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  leaveTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  leaveBody: {
    color: COLORS.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  recoveryStatsWrap: {
    backgroundColor: COLORS.surface3,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  recoveryStatLine: {
    color: COLORS.text,
    fontSize: 12,
  },
  recoveryQueuePanel: {
    backgroundColor: 'rgba(0,201,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  recoveryQueueTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  recoveryQueueLine: {
    color: COLORS.text,
    fontSize: 12,
  },
  recoveryRefreshBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
  },
  recoveryRefreshBtnText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  leaveActions: {
    gap: 10,
  },
  leaveBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  leaveBtnPrimary: {
    backgroundColor: COLORS.accentDim,
  },
  leaveBtnTextPrimary: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  leaveBtnSecondary: {
    backgroundColor: COLORS.chromeDim,
  },
  leaveBtnTextSecondary: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '700',
  },
  leaveBtnDanger: {
    backgroundColor: COLORS.accent2Dim,
  },
  leaveBtnTextDanger: {
    color: COLORS.accent2,
    fontSize: 14,
    fontWeight: '700',
  },
});
