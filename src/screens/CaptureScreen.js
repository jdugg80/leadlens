import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { read, utils } from 'xlsx';
import { COLORS, EMPTY_LEAD, STOREFRONT_SCAN_HISTORY_KEY, STOREFRONT_SCAN_LIMIT } from '../constants';
import { ScreenHeader, Card, SectionLabel } from '../components/UI';
import AILoader from '../components/AILoader';
import { extractLeadsWithDebugFromImage, enrichLead } from '../utils/claudeApi';
import { getCurrentCoords, geocodeBusinessNearby, reverseGeocodeCoords } from '../utils/geoEnrich';
import { findDuplicateInLeads, inferVertical, normalizeLead } from '../utils/leadHelpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LEADS_STORAGE_KEY } from '../constants';

const SAFE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const normalizeHeader = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_ALIASES = {
  businessName: ['businessname', 'companyname', 'accountname', 'name'],
  pocFirst: ['firstname', 'contactfirstname', 'pocfirstname'],
  pocLast: ['lastname', 'contactlastname', 'poclastname'],
  phone: ['phone', 'companyhqphone', 'companyphone', 'telephone'],
  email: ['email', 'contactemail', 'companyemail'],
  streetAddress: ['companystreetaddress', 'streetaddress', 'address'],
  city: ['companycity', 'city'],
  state: ['companystate', 'state'],
  zip: ['companyzipcode', 'zipcode', 'zip', 'postalcode'],
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

export default function CaptureScreen({ navigation, route }) {
  const { user } = route.params;
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  const openCamera = async (quality = 0.75) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission required');
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality,
      allowsEditing: false,
      base64: false,
    });
    return result.canceled ? null : result.assets[0];
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
      const queue = queueRaw ? JSON.parse(queueRaw) : [];
      const historyRaw = await AsyncStorage.getItem(STOREFRONT_SCAN_HISTORY_KEY);
      const history = historyRaw ? JSON.parse(historyRaw) : [];
      const collected = [];
      const reverseGeo = sourceType === 'storefront' && coords ? await reverseGeocodeCoords(coords) : null;

      for (let i = 0; i < assets.length; i += 1) {
        setProcessingMsg(assets.length > 1 ? `Reading image ${i + 1} of ${assets.length}...` : 'AI is reading the image...');
        const { b64, mime } = await readAsset(assets[i]);
        const debugExtraction = await extractLeadsWithDebugFromImage(b64, mime);
        const extractedLeads = debugExtraction.leads || [];

        for (const rawLead of extractedLeads) {
          let normalized = normalizeLead({ ...EMPTY_LEAD, ...rawLead, captureMethod: sourceType, imageUri: assets[i].uri, propertyType: 'Commercial' });
          normalized.locationSource = sourceType === 'storefront' ? 'ocr-only' : normalized.locationSource;

          if (sourceType === 'storefront' && coords) {
            const nearbyMatch = normalized.businessName ? await geocodeBusinessNearby(normalized.businessName, coords) : null;
            if (nearbyMatch) {
              normalized = normalizeLead({
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
              normalized = normalizeLead({
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
            normalized = normalizeLead(await enrichLead(normalized));
          }

          if (sourceType === 'storefront' && coords) {
            normalized.captureLat = coords.latitude;
            normalized.captureLng = coords.longitude;
            normalized.ocrSummary = debugExtraction.ocrSummary || '';
            normalized.state = reverseGeo?.state || normalized.state;
            normalized.storefrontCapturedAt = new Date().toISOString();
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
            normalized.duplicateWarning = `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}`;
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

      if (collected.length === 1) {
        navigation.navigate('Review', { user, lead: collected[0], editIdx: null });
        return;
      }

      navigation.navigate('BatchReview', {
        user,
        leads: collected,
        sourceLabel: assets.length > 1 ? 'Multi-image capture' : (sourceType === 'storefront' ? 'Storefront scan' : 'Single image scan'),
      });
    } catch (err) {
      Alert.alert('Extraction issue', err.message || 'Could not read image.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSingleCapture = async (isStorefront = false) => {
    let coords = null;
    if (isStorefront) {
      setProcessingMsg('Getting your location...');
      coords = await getCurrentCoords();
    }
    const asset = await openCamera(isStorefront ? 0.8 : 0.7);
    if (!asset) return;
    await processAssets([asset], coords, isStorefront ? 'storefront' : 'image');
  };

  const handleCardCapture = async () => {
    Alert.alert('Business Card', 'Does the card have information on both sides?', [
      { text: 'Front only', onPress: async () => { const front = await openCamera(0.65); if (front) await processAssets([front]); } },
      {
        text: 'Front & Back', onPress: async () => {
          Alert.alert('Step 1 of 2', 'Take a photo of the FRONT of the card');
          const front = await openCamera(0.65);
          if (!front) return;
          Alert.alert('Step 2 of 2', 'Now take a photo of the BACK of the card');
          const back = await openCamera(0.65);
          if (!back) return;
          await processAssets([front, back]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library permission required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      base64: false,
    });
    if (!result.canceled) await processAssets([result.assets[0]], null, 'image');
  };

  const handleExcelImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      setProcessing(true);
      setProcessingMsg('Reading Excel file...');
      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { defval: '' });
      const leads = rows.map((row) => {
        const split = splitStreetAddress(getMappedValue(row, HEADER_ALIASES.streetAddress));
        const base = normalizeLead({
          ...EMPTY_LEAD,
          businessName: getMappedValue(row, HEADER_ALIASES.businessName),
          pocFirst: getMappedValue(row, HEADER_ALIASES.pocFirst),
          pocLast: getMappedValue(row, HEADER_ALIASES.pocLast),
          phone: getMappedValue(row, HEADER_ALIASES.phone),
          email: getMappedValue(row, HEADER_ALIASES.email),
          streetNumber: split.streetNumber,
          streetName: split.streetName,
          city: getMappedValue(row, HEADER_ALIASES.city),
          state: getMappedValue(row, HEADER_ALIASES.state),
          zip: getMappedValue(row, HEADER_ALIASES.zip),
          captureMethod: 'excel-import',
        });
        const inferred = inferVertical(base);
        return { ...base, ...inferred, reviewed: false };
      }).filter((lead) => lead.businessName || lead.phone || lead.email);

      if (!leads.length) {
        Alert.alert('No leads found', 'The spreadsheet did not contain recognizable prospect rows.');
        return;
      }

      navigation.navigate('BatchReview', {
        user,
        leads,
        sourceLabel: 'Excel import',
      });
    } catch (err) {
      Alert.alert('Import failed', err.message || 'Could not read the spreadsheet.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Capture" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
        <SectionLabel>Fast Capture</SectionLabel>
        <Card>
          <TouchableOpacity style={s.actionBtn} onPress={handleCardCapture}>
            <Text style={s.actionTitle}>Business Card Scan</Text>
            <Text style={s.actionSub}>Single card or front/back capture</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => handleSingleCapture(true)}>
            <Text style={s.actionTitle}>Storefront Scan</Text>
            <Text style={s.actionSub}>Captures GPS, keeps storefront scan evidence, and validates state/address from location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => handleSingleCapture(false)}>
            <Text style={s.actionTitle}>General Photo Scan</Text>
            <Text style={s.actionSub}>Supports one or more prospects in a single image</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={openGallery}>
            <Text style={s.actionTitle}>Choose From Gallery</Text>
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
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  actionTitle: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  actionSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13,15,20,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loaderText: { color: COLORS.text, marginTop: 12, textAlign: 'center' },
});
