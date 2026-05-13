import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView, Linking,
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
import { loadUserLearningProfile, recordUserActivityEvent } from '../utils/userLearning';
import { normalizeLead, inferVertical, findDuplicateInLeads } from '../utils/leadHelpers';
import TutorialOverlay from '../components/TutorialOverlay';
import { annotateLeadForReview, expandCandidatesFromOcrSummary, buildDuplicateBadge } from '../utils/captureIntelligence';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { LEADS_STORAGE_KEY } from '../constants';
import { playCaptureSound, playErrorSound, playSuccessSound } from '../utils/soundManager';
import * as ImageManipulator from 'expo-image-manipulator';
import { cropImageToLeadLockTarget } from '../utils/leadLockImageCrop';
import { extractSocialLinksFromText, mergeSocialFieldsIntoLead } from '../utils/socialEnrichment';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import { processQueue } from '../utils/taskRunner';
import { enqueueTask, TASK_TYPES } from '../utils/taskQueue';
import BetaTracker from '../../utils/betaTracker';

const SAFE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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
  const match = cleaned.match(/^(\d+)\s+(.*)$/);
  if (!match) return { streetNumber: '', streetName: cleaned };
  return { streetNumber: match[1], streetName: match[2] };
}

function getMappedValue(row, aliases = []) {
  for (const [header, value] of Object.entries(row)) {
    if (aliases.includes(normalizeHeader(header)) && value) return String(value).trim();
  }
  return '';
}

// Build a column index from the first row's headers — O(columns × total_aliases) once,
// then every per-row field lookup is O(1) instead of O(columns × aliases).
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
  // Broadened regex to catch more variations (dots, dashes, extensions, parentheses, etc)
  const phoneRegex = /(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})\b/g;
  const candidates = [];

  for (const [key, value] of Object.entries(row)) {
    // Some spreadsheet libraries return numbers directly
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

  // Unique by normalized number
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

  // Unique by lowercase email
  return Array.from(new Map(candidates.map(c => [c.original, c])).values());
}
function mergeTwoSidedCardLeads(leads = []) {
  const merged = leads.reduce((acc, lead) => {
    const next = normalizeLead(lead);

    return {
      ...acc,
      businessName: acc.businessName || next.businessName || '',
      pocFirst: acc.pocFirst || next.pocFirst || '.',
      pocLast: acc.pocLast || next.pocLast || '.',
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

  const { user } = route.params;
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  const openCamera = async (quality = 0.75) => {
    try {
      console.log('[Capture] Checking camera permissions...');
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      console.log('[Capture] Camera permission status:', status, 'canAskAgain:', canAskAgain);

      if (status !== 'granted') {
        if (!canAskAgain) {
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

      console.log('[Capture] Launching camera...');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality,
        allowsEditing: false,
        base64: false,
      });
      console.log('[Capture] Camera result canceled:', result.canceled);
      return result.canceled ? null : result.assets[0];
    } catch (err) {
    BetaTracker.crash('CaptureScreen', err);
      console.error('[Capture] openCamera error:', err);
      showThemedAlert('Camera Error', 'Could not open the system camera.');
      return null;
    }
  };

  // Copy captured image to permanent app storage so it survives cache clears
  const persistImage = async (uri) => {
    try {
      if (!uri) return uri;
      // Auto-resize and compress before saving
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
    } catch {
      return uri;
    }
  };

  const readAsset = async (asset) => {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = SAFE_MIMES.includes((asset.mimeType || '').toLowerCase()) ? asset.mimeType : 'image/jpeg';
    return { b64, mime };
  };

  const processAssets = async (assets, coords = null, sourceType = 'image') => {
    setProcessing(true);
    try {
      const queueRaw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
      let queue = [];
      try {
        queue = queueRaw ? JSON.parse(queueRaw) : [];
        if (!Array.isArray(queue)) queue = [];
      } catch (e) {
    BetaTracker.crash('CaptureScreen', e);
        console.warn('[CaptureScreen] Failed to parse leads queue:', e);
        queue = [];
      }

      const historyRaw = await AsyncStorage.getItem(STOREFRONT_SCAN_HISTORY_KEY);
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const collected = [];
      const reverseGeo = sourceType === 'storefront' && coords ? await reverseGeocodeCoords(coords) : null;

      for (let i = 0; i < assets.length; i += 1) {
        setProcessingMsg(assets.length > 1 ? `Reading image ${i + 1} of ${assets.length}...` : 'AI is reading the image...');

        const currentAsset = assets[i];

        // Background-safe: Persist the image first
        const permanentImageUri = await persistImage(currentAsset.uri);

        // Enqueue extraction task (as a backup if foreground fails)
        await enqueueExtractLeadsFromImage(permanentImageUri, 'image/jpeg');
        processQueue().catch(() => {});

        recordUserActivityEvent('prospect_capture_started', {
          source_type: sourceType,
          is_multi: assets.length > 1
        }).catch(() => {});

        const { b64, mime } = await readAsset({ ...currentAsset, uri: permanentImageUri });
        const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime);
        const extractedLeads = (debugExtraction.leads?.length ? debugExtraction.leads : expandCandidatesFromOcrSummary(debugExtraction.ocrSummary, sourceType)) || [];

        for (const rawLead of extractedLeads) {
          let permanentUri = permanentImageUri;
          if (rawLead.boundingBox) {
            try {
              const cropResult = await cropImageToLeadLockTarget(permanentImageUri, rawLead.boundingBox, {
                paddingRatio: 0.1,
                maxWidth: 1600,
                compress: 0.85
              });
              if (cropResult?.uri) {
                permanentUri = await persistImage(cropResult.uri);
              }
            } catch (err) {
    BetaTracker.crash('CaptureScreen', err);
              console.log('Auto-crop failed, using full image:', err);
            }
          }

          let normalized = annotateLeadForReview({ ...EMPTY_LEAD, ...rawLead, captureMethod: sourceType, imageUri: permanentUri, propertyType: 'Commercial', ocrSummary: debugExtraction.ocrSummary || '' }, sourceType);
          normalized = mergeSocialFieldsIntoLead(
            normalized,
            extractSocialLinksFromText([debugExtraction.ocrSummary, normalized.notes, normalized.website].filter(Boolean).join(' '))
          );
          normalized.locationSource = sourceType === 'storefront' ? 'ocr-only' : normalized.locationSource;

          if (sourceType === 'storefront' && coords) {
            const nearbyMatch = normalized.businessName ? await geocodeBusinessNearby(normalized.businessName, coords) : null;
            if (nearbyMatch) {
              normalized = annotateLeadForReview({
                ...normalized,
                streetNumber: nearbyMatch.streetNumber || normalized.streetNumber,
                streetName: nearbyMatch.streetName || normalized.streetName,
                addressLine2: normalized.addressLine2,
                city: nearbyMatch.city || normalized.city || reverseGeo?.city || '',
                state: nearbyMatch.state || reverseGeo?.state || normalized.state,
                zip: nearbyMatch.zip || reverseGeo?.zip || normalized.zip,
                locationSource: 'nearby-business-match',
                locationConfidence: nearbyMatch._matchConfidence || 'medium',
                matchedDisplayName: nearbyMatch._geoDisplayName || '',
                notes: [normalized.notes, `Storefront geo match: ${nearbyMatch._geoDisplayName || nearbyMatch._geoSource || 'OpenStreetMap'}`].filter(Boolean).join(' | '),
              });
            } else if (reverseGeo) {
              normalized = annotateLeadForReview({
                ...normalized,
                city: normalized.city || reverseGeo.city,
                state: reverseGeo.state || normalized.state,
                zip: normalized.zip || reverseGeo.zip,
                locationSource: 'reverse-geocode',
                locationConfidence: reverseGeo._matchConfidence || 'medium',
                matchedDisplayName: reverseGeo._geoDisplayName || '',
                notes: [normalized.notes, 'Storefront location inferred from device GPS'].filter(Boolean).join(' | '),
              });
            }
          }

          const missing = ['phone', 'email'].some((key) => !normalized[key]);
          if (missing && normalized.businessName) {
            normalized = annotateLeadForReview(await enrichLead(normalized), sourceType);
          }

          if (sourceType === 'storefront' && coords) {
            normalized.captureLat = coords.latitude;
            normalized.captureLng = coords.longitude;
            normalized.ocrSummary = debugExtraction.ocrSummary || '';
            normalized.state = reverseGeo?.state || normalized.state;
            normalized.storefrontCapturedAt = new Date().toISOString();
            normalized = annotateLeadForReview(normalized, sourceType);
            if (!normalized.streetNumber && !normalized.streetName) {
              normalized.locationNeedsReview = true;
              normalized.locationConfidence = normalized.locationConfidence || 'low';
              normalized.notes = [normalized.notes, 'Storefront address needs review'].filter(Boolean).join(' | ');
            }
          }

          const inferred = inferVertical(normalized);
          normalized.vertical = inferred.vertical;
          normalized.propertyType = 'Commercial';
          normalized.reviewed = false;
          const duplicate = findDuplicateInLeads(normalized, [...queue, ...collected]);
          if (duplicate) {
            normalized.duplicateWarning = buildDuplicateBadge(duplicate);
            normalized.reviewLabels = Array.from(new Set([...(normalized.reviewLabels || []), 'Possible duplicate']));
          }
          collected.push(normalized);
        }

        if (sourceType === 'storefront') {
          history.unshift({
            id: `scan_${Date.now()}_${i}`,
            imageUri: assets[i].uri,
            capturedAt: new Date().toISOString(),
            captureLat: coords?.latitude || null,
            captureLng: coords?.longitude || null,
            reverseGeo,
            ocrSummary: debugExtraction.ocrSummary || '',
            resultCount: extractedLeads.length,
            sourceType,
            matchedAddress: [collected[collected.length - 1]?.streetNumber, collected[collected.length - 1]?.streetName].filter(Boolean).join(' '),
            state: collected[collected.length - 1]?.state || reverseGeo?.state || '',
            locationConfidence: collected[collected.length - 1]?.locationConfidence || 'low',
          });
        }
      }

      if (sourceType === 'storefront') {
        await AsyncStorage.setItem(STOREFRONT_SCAN_HISTORY_KEY, JSON.stringify(history.slice(0, STOREFRONT_SCAN_LIMIT || 25)));
      }

     if (!collected.length) {
  throw new Error('No prospects were detected in that image.');
}

if (sourceType === 'business-card-2-sided') {
  const mergedLead = mergeTwoSidedCardLeads(collected);
  navigation.navigate('Review', {
    user,
    lead: mergedLead,
    editIdx: null,
  });
  return;
}

if (collected.length === 1) {
  navigation.navigate('Review', { user, lead: collected[0], editIdx: null });
  return;
}

navigation.navigate('BatchReview', {
  user,
  leads: collected,
  sourceLabel:
    assets.length > 1
      ? 'Multi-image capture'
      : sourceType === 'storefront'
      ? 'Storefront scan'
      : 'Single image scan',
});
    } catch (err) {
    BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      showThemedAlert('Extraction issue', err.message || 'Could not read image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleIntelliVisionCapture = async () => {
    setProcessingMsg('Getting your location and heading...');
    setProcessing(true);
    try {
      // Capture GPS and compass heading simultaneously
      const [coords, heading] = await Promise.all([
        getCurrentCoords(),
        getCameraHeading(),
      ]);
      setProcessing(false);

      const asset = await openCamera(0.85);
      if (!asset) return;

      setProcessing(true);
      setProcessingMsg('AI is reading the image...');
      const permanentUri = await persistImage(asset.uri);
      const { b64, mime } = await readAsset(asset);
      const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime);
      const extractedLeads = (debugExtraction.leads?.length
        ? debugExtraction.leads
        : expandCandidatesFromOcrSummary(debugExtraction.ocrSummary, 'geotarget')) || [];

      setProcessing(false);

      navigation.navigate('IntelliVisionReview', {
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

  const captureMultiplePhotos = async (quality = 0.75, label = 'photo') => {
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
      }
      const asset = await openCamera(quality);
      if (!asset) break;
      assets.push(asset);
    }
    return assets;
  };

  const handleSingleCapture = async (isStorefront = false) => {
    console.log('[Capture] handleSingleCapture started, isStorefront:', isStorefront);
    let coords = null;
    if (isStorefront) {
      setProcessingMsg('Getting your location...');
      coords = await getCurrentCoords();
      console.log('[Capture] Coords received:', !!coords);
    }
    const assets = await captureMultiplePhotos(isStorefront ? 0.8 : 0.7);
    console.log('[Capture] Assets captured:', assets?.length || 0);
    if (!assets?.length) return;
    await processAssets(assets, coords, isStorefront ? 'storefront' : 'image');
  };

  const handleCardCapture = async () => {
  showThemedAlert('Business Card', 'Choose how you want to scan the card.', [
    {
      text: 'Single-Sided',
      onPress: async () => {
        const assets = await captureMultiplePhotos(0.65, 'card');
        if (!assets.length) return;
        await processAssets(assets, null, 'image');
      },
    },
    {
      text: 'Front & Back',
      onPress: async () => {
        showThemedAlert('Step 1 of 2', 'Take a photo of the FRONT of the card');
        const front = await openCamera(0.65);
        if (!front) return;

        showThemedAlert('Step 2 of 2', 'Now take a photo of the BACK of the card');
        const back = await openCamera(0.65);
        if (!back) return;

        await processAssets([front, back], null, 'business-card-2-sided');
      },
    },
    { text: 'Cancel', style: 'cancel' },
  ]);
};

  const openGallery = async () => {
    try {
      console.log('[Capture] Checking gallery permissions...');
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('[Capture] Gallery permission status:', status, 'canAskAgain:', canAskAgain);

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

      console.log('[Capture] Launching image library...');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
        base64: false,
      });

      console.log('[Capture] Gallery result canceled:', result.canceled);
      if (!result.canceled) {
        await processAssets([result.assets[0]], null, 'image');
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
      await new Promise((r) => setTimeout(r, 0)); // yield to UI before heavy work

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      setProcessingMsg('Parsing spreadsheet…');
      await new Promise((r) => setTimeout(r, 0));

      const wb = read(b64, { type: 'base64', cellDates: true, cellNF: false, cellHTML: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) {
        showThemedAlert('No prospects found', 'The spreadsheet did not contain recognizable prospect rows.');
        return;
      }

      // Build column index once from the first row — all subsequent lookups are O(1)
      const colIndex = buildColumnIndex(rows[0]);

      // Process rows in chunks of 100 — yields to UI between each chunk
      // so progress messages render and the app stays responsive
      const CHUNK = 100;
      const leads = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, rows.length);
        setProcessingMsg(`Processing ${end} of ${rows.length} rows…`);
        await new Promise((r) => setTimeout(r, 0));

        const chunk = rows.slice(i, end);
        for (const row of chunk) {
          // Find all possible phone numbers and emails in the row regardless of header
          const phoneCandidates = findPhoneInRow(row);
          const emailCandidates = findEmailInRow(row);

          // Prefer separate street columns; fall back to splitting a combined address
          const rawStreetNum  = getIndexedValue(row, colIndex, 'streetNumber');
          const rawStreetName = getIndexedValue(row, colIndex, 'streetName');
          const rawStreetFull = getIndexedValue(row, colIndex, 'streetAddress');
          const split = (rawStreetNum || rawStreetName)
            ? { streetNumber: rawStreetNum, streetName: rawStreetName }
            : splitStreetAddress(rawStreetFull);

          const base = normalizeLead({
            ...EMPTY_LEAD,
            businessName:  getIndexedValue(row, colIndex, 'businessName'),
            pocFirst:      getIndexedValue(row, colIndex, 'pocFirst'),
            pocLast:       getIndexedValue(row, colIndex, 'pocLast'),
            phone:         getIndexedValue(row, colIndex, 'phone') || (phoneCandidates.length > 0 ? phoneCandidates[0].original : ''),
            email:         getIndexedValue(row, colIndex, 'email') || (emailCandidates.length > 0 ? emailCandidates[0].original : ''),
            website:       getIndexedValue(row, colIndex, 'website'),
            streetNumber:  split.streetNumber,
            streetName:    split.streetName,
            addressLine2:  getIndexedValue(row, colIndex, 'addressLine2'),
            city:          getIndexedValue(row, colIndex, 'city'),
            state:         getIndexedValue(row, colIndex, 'state'),
            zip:           getIndexedValue(row, colIndex, 'zip'),
            status:        getIndexedValue(row, colIndex, 'status'),
            propertyType:  getIndexedValue(row, colIndex, 'propertyType'),
            employeeNum:   getIndexedValue(row, colIndex, 'employeeNum'),
            branchNum:     getIndexedValue(row, colIndex, 'branchNum'),
            captureMethod: 'excel-import',
          });

          if (phoneCandidates.length > 1) {
            base.phoneCandidates = phoneCandidates.map(c => c.original);
            base.reviewWarnings = [...(base.reviewWarnings || []), `Multiple phone numbers found in import`].filter((v, i, a) => a.indexOf(v) === i);
          }

          if (emailCandidates.length > 1) {
            base.emailCandidates = emailCandidates.map(c => c.original);
            base.reviewWarnings = [...(base.reviewWarnings || []), `Multiple email addresses found in import`].filter((v, i, a) => a.indexOf(v) === i);
          }

          const inferred = inferVertical(base);
          if (base.businessName || base.phone || base.email) {
            leads.push({ ...base, ...inferred, reviewed: false });
          }
        }
      }

      if (!leads.length) {
        showThemedAlert('No prospects found', 'The spreadsheet did not contain recognizable prospect rows.');
        return;
      }

      setProcessingMsg(`${leads.length} prospects ready`);
      await new Promise((r) => setTimeout(r, 120)); // brief pause so user sees final count

      navigation.navigate('BatchReview', {
        user,
        leads,
        sourceLabel: 'Excel import',
      });
    } catch (err) {
    BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      showThemedAlert('Import failed', err.message || 'Could not read the spreadsheet.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={s.root}>
      <ThemedAlertHost />
      <ScreenHeader title="Capture" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
        <SectionLabel>Fast Capture</SectionLabel>
        <Card>
          <TouchableOpacity style={[s.actionBtn, s.intellivisionBtn]} onPress={() => navigation.navigate('IntelliVisionCamera', { user })}>
            <View style={s.intellivisionHeader}>
              <Text style={s.intellivisionIcon}>⚡</Text>
              <View>
                <Text style={[s.actionTitle, { color: COLORS.accent }]}>LeadLock™</Text>
                <Text style={s.intellivisionBadge}>GPS · Compass · AI · Zoom Offset</Text>
              </View>
            </View>
            <Text style={s.actionSub}>Live camera with crosshair targeting. Captures GPS + compass heading + zoom distance offset for precise storefront and remote business identification.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handleCardCapture}>
            <Text style={s.actionTitle}>📇 Business Card Scan</Text>
            <Text style={s.actionSub}>Single card or front/back capture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => handleSingleCapture(false)}>
            <Text style={s.actionTitle}>📷 General Photo Scan</Text>
            <Text style={s.actionSub}>Supports one or more prospects in a single image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={openGallery}>
            <Text style={s.actionTitle}>🖼️ Choose From Gallery</Text>
            <Text style={s.actionSub}>Import an existing photo or screenshot</Text>
          </TouchableOpacity>
        </Card>

        <SectionLabel>Imports</SectionLabel>
        <Card>
          <TouchableOpacity style={s.actionBtn} onPress={handleExcelImport}>
            <Text style={s.actionTitle}>Import Spreadsheet</Text>
            <Text style={s.actionSub}>Review imported rows in Batch Review before saving</Text>
          </TouchableOpacity>
        </Card>
      </ScrollView>

      {processing && (
        <View style={s.loaderOverlay}>
          <AILoader />
          <ActivityIndicator size="large" color={COLORS.accent} style={{ marginTop: 14 }} />
          <Text style={s.loaderText}>{processingMsg || 'Working...'}</Text>
        </View>
      )}
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
});