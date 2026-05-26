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

  const openCamera = async (quality = 0.75, skipPermissionRequest = false) => {
    try {
      console.log('[Capture] ===== OPENING CAMERA =====');
      console.log('[Capture] Checking camera permissions...');
      
      try {
        let status = 'granted';
        if (!skipPermissionRequest) {
          const permResult = await ImagePicker.requestCameraPermissionsAsync();
          status = permResult.status;
          console.log('[Capture] Permission response received!');
          console.log('[Capture] Camera permission status:', status, 'canAskAgain:', permResult.canAskAgain);

          if (status !== 'granted') {
            console.log('[Capture] Permission NOT granted');
            if (!permResult.canAskAgain) {
              console.log('[Capture] Showing permanent block alert');
              showThemedAlert(
                'Permission Blocked',
                'Camera access is permanently denied. Please enable it in your device settings to capture prospects.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
              );
            } else {
              console.log('[Capture] Showing permission required alert');
              showThemedAlert('Camera permission required', 'Please grant camera access to take photos.');
            }
            return null;
          }
        } else {
          console.log('[Capture] Skipping permission request (already requested)');
        }

        console.log('[Capture] Permission granted! Launching camera...');
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality,
          allowsEditing: false,
          base64: false,
        });
        console.log('[Capture] Camera result canceled:', result.canceled);
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

  const readAsset = async (uri, mimeType) => {
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

  const processAssets = async (assets, coords, captureMethod) => {
    console.log('[Capture] processAssets called with', assets?.length || 0, 'assets');
    if (!assets?.length) {
      showThemedAlert('No photos', 'Please capture at least one photo.');
      return;
    }

    setProcessing(true);
    setProcessingMsg('Reading photos...');
    try {
      const leads = [];
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        setProcessingMsg(`Processing photo ${i + 1} of ${assets.length}...`);
        await new Promise((r) => setTimeout(r, 0));

        const permanentUri = await persistImage(asset.uri);
        const { b64, mime } = await readAsset(permanentUri, asset.mimeType);

        try {
          const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime);
          const extractedLeads = (debugExtraction.leads?.length
            ? debugExtraction.leads
            : expandCandidatesFromOcrSummary(debugExtraction.ocrSummary, 'storefront')) || [];

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
              }
            }
          }
        } catch (extractErr) {
          console.warn('[Capture] Extraction error for asset', i, ':', extractErr);
        }
      }

      if (!leads.length) {
        showThemedAlert('No prospects found', 'Could not extract any prospect data from the photos.');
        return;
      }

      setProcessingMsg(`${leads.length} prospects ready`);
      await new Promise((r) => setTimeout(r, 120));

      navigation.navigate('BatchReview', {
        user,
        leads,
        sourceLabel: captureMethod === 'image' ? 'Photo import' : 'Business card scan',
      });
    } catch (err) {
      BetaTracker.crash('CaptureScreen', err);
      playErrorSound().catch(() => {});
      showThemedAlert('Extraction error', err.message || 'Could not read image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleIntelliVisionCapture = async () => {
    setProcessingMsg('Getting your location and heading...');
    setProcessing(true);
    try {
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
      console.log(`[Capture] Opening camera for ${label} #${stepNum}...`);
      const asset = await openCamera(quality);
      if (!asset) {
        console.log(`[Capture] Camera returned null for ${label} #${stepNum}`);
        break;
      }
      console.log(`[Capture] Camera returned asset for ${label} #${stepNum}`);
      assets.push(asset);
    }
    console.log(`[Capture] captureMultiplePhotos complete: ${assets.length} assets captured`);
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
    console.log('[Capture] handleCardCapture triggered');
    showThemedAlert('Business Card', 'Choose how you want to scan the card.', [
      {
        text: 'Single-Sided',
        onPress: async () => {
          console.log('[Capture] Single-Sided option selected');
          const assets = await captureMultiplePhotos(0.65, 'card');
          console.log('[Capture] Single-sided assets:', assets?.length || 0);
          if (!assets.length) {
            console.log('[Capture] No assets returned, returning early');
            return;
          }
          console.log('[Capture] Processing single-sided assets');
          await processAssets(assets, null, 'image');
        },
      },
      {
        text: 'Front & Back',
        onPress: async () => {
          console.log('[Capture] Front & Back option selected');
          console.log('[Capture] Requesting camera permissions upfront...');
          
          try {
            const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
            console.log('[Capture] Camera permission status:', status);
            
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
            console.error('[Capture] Permission error:', permErr);
            return;
          }
          
          await new Promise((resolve) => {
            showThemedAlert('Step 1 of 2', 'Take a photo of the FRONT of the card', [
              { text: 'Ready', onPress: resolve }
            ]);
          });
          // Give the modal time to fully close
          await new Promise(r => setTimeout(r, 500));
          console.log('[Capture] Opening camera for front side');
          const front = await openCamera(0.65, true);
          if (!front) {
            console.log('[Capture] Front photo not taken, returning early');
            return;
          }
          console.log('[Capture] Front photo taken, showing step 2');

          await new Promise((resolve) => {
            showThemedAlert('Step 2 of 2', 'Now take a photo of the BACK of the card', [
              { text: 'Ready', onPress: resolve }
            ]);
          });
          // Give the modal time to fully close
          await new Promise(r => setTimeout(r, 500));
          console.log('[Capture] Opening camera for back side');
          const back = await openCamera(0.65, true);
          if (!back) {
            console.log('[Capture] Back photo not taken, returning early');
            return;
          }
          console.log('[Capture] Back photo taken, processing both');

          await processAssets([front, back], null, 'business-card-2-sided');
        },
      },
      { text: 'Cancel', style: 'cancel', onPress: () => console.log('[Capture] Card capture cancelled') },
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
        allowsMultipleSelection: true,
        selectionLimit: 10,
        base64: false,
      });

      console.log('[Capture] Gallery result canceled:', result.canceled);
      if (!result.canceled && result.assets && result.assets.length > 0) {
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
            state: getIndexedValue(row, colIndex, 'state'),
            zip: getIndexedValue(row, colIndex, 'zip'),
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

      navigation.navigate('BatchReview', {
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

  return (
    <View style={s.root}>
      <ThemedAlertHost />
      <ScreenHeader title="Capture" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
        <SectionLabel>Fast Capture</SectionLabel>
        <Card>
          <TouchableOpacity style={[s.actionBtn, s.intellivisionBtn]} onPress={() => navigation.navigate('LeadLockCamera', { user })}>
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
            <Text style={s.actionTitle}>📊 Import Spreadsheet</Text>
            <Text style={s.actionSub}>Excel or CSV - Review in Batch Review before saving</Text>
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