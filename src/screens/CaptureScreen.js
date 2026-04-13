import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { read, utils } from 'xlsx';
import { COLORS, EMPTY_LEAD, STATUS_OPTIONS, PROPERTY_TYPES } from '../constants';
import { ScreenHeader } from '../components/UI';
import { extractLeadFromImage, enrichLead } from '../utils/claudeApi';
import { getCurrentCoords, geocodeBusinessNearby } from '../utils/geoEnrich';

const SAFE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export default function CaptureScreen({ navigation, route }) {
  const { user } = route.params;
  const [processing, setProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  // ── Camera helpers ──
  const openCamera = async (quality = 0.75) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission required'); return null; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality, allowsEditing: false, base64: false,
    });
    return result.canceled ? null : result.assets[0];
  };

  const readAsset = async (asset) => {
    const b64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const mime = SAFE_MIMES.includes((asset.mimeType || '').toLowerCase())
      ? asset.mimeType : 'image/jpeg';
    return { b64, mime };
  };

  // ── Single photo capture ──
  const handleSingleCapture = async (quality, isStorefront = false) => {
    // For storefront: grab GPS before opening camera
    let coords = null;
    if (isStorefront) {
      setProcessingMsg('Getting your location...');
      coords = await getCurrentCoords();
    }
    const asset = await openCamera(quality);
    if (!asset) return;
    await processAssets([asset], isStorefront ? coords : null);
  };

  // ── Front + back card capture ──
  const handleCardCapture = async () => {
    Alert.alert(
      'Business Card',
      'Does the card have information on both sides?',
      [
        { text: 'Front only', onPress: async () => { const a = await openCamera(0.65); if (a) await processAssets([a]); } },
        { text: 'Front & Back', onPress: handleFrontBack },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleFrontBack = async () => {
    Alert.alert('Step 1 of 2', 'Take a photo of the FRONT of the card');
    const front = await openCamera(0.65);
    if (!front) return;
    Alert.alert('Step 2 of 2', 'Now take a photo of the BACK of the card');
    const back = await openCamera(0.65);
    if (!back) return;
    await processAssets([front, back]);
  };

  // ── Gallery ──
  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo library permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85, allowsEditing: false, base64: false,
    });
    if (!result.canceled) await processAssets([result.assets[0]]);
  };

  // ── Process one or two images ──
  const processAssets = async (assets, coords = null) => {
    setProcessing(true);
    try {
      let merged = {};

      for (let i = 0; i < assets.length; i++) {
        setProcessingMsg(assets.length > 1
          ? `Reading ${i === 0 ? 'front' : 'back'} of card...`
          : 'AI is reading the image...');
        const { b64, mime } = await readAsset(assets[i]);
        const extracted = await extractLeadFromImage(b64, mime);
        for (const [k, v] of Object.entries(extracted)) {
          if (v && !merged[k]) merged[k] = v;
        }
      }

      // Geo enrichment for storefront — fill missing address using GPS + business name
      if (coords && merged.businessName) {
        setProcessingMsg('Finding address from location...');
        const geoData = await geocodeBusinessNearby(merged.businessName, coords);
        if (geoData) {
          // Only fill fields that are missing from photo extraction
          for (const [k, v] of Object.entries(geoData)) {
            if (v && !merged[k] && k !== '_geoSource') merged[k] = v;
          }
        }
      }

      // AI enrichment pass for any remaining missing fields
      const hasMissing = ['pocFirst', 'pocLast', 'phone', 'email', 'streetNumber', 'city'].some(k => !merged[k]);
      if (hasMissing && merged.businessName) {
        setProcessingMsg('Enriching missing fields...');
        merged = await enrichLead(merged);
      }

      navigation.navigate('Review', {
        user,
        lead: { ...EMPTY_LEAD, ...merged, captureMethod: 'image', imageUri: assets[0].uri },
        editIdx: null,
      });
    } catch (err) {
      Alert.alert('Extraction issue', err.message || 'Could not read image.');
      navigation.navigate('Review', {
        user,
        lead: { ...EMPTY_LEAD, captureMethod: 'image', imageUri: assets[0].uri },
        editIdx: null,
      });
    } finally {
      setProcessing(false);
    }
  };

  // ── Excel import ──
  const handleExcelImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setProcessing(true);
      setProcessingMsg('Reading Excel file...');

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { Alert.alert('No data found in file'); setProcessing(false); return; }

      // Map Excel columns to lead fields (flexible header matching)
      const col = (row, ...keys) => {
        for (const k of keys) {
          const found = Object.keys(row).find(h => h.toLowerCase().includes(k.toLowerCase()));
          if (found && row[found]) return String(row[found]).trim();
        }
        return '';
      };

      const leads = rows.map(row => ({
        ...EMPTY_LEAD,
        businessName: col(row, 'business', 'company', 'name'),
        pocFirst: col(row, 'first'),
        pocLast: col(row, 'last'),
        phone: col(row, 'phone', 'tel'),
        email: col(row, 'email'),
        streetNumber: col(row, 'streetnum', 'street num', 'st #'),
        streetName: col(row, 'streetname', 'street name', 'address', 'street'),
        addressLine2: col(row, 'line2', 'address2', 'suite'),
        city: col(row, 'city'),
        state: col(row, 'state'),
        zip: col(row, 'zip', 'postal'),
        status: col(row, 'status') || 'Suspect',
        propertyType: col(row, 'property', 'type') || 'Commercial',
        captureMethod: 'excel',
        repName: user.repName,
        employeeNum: user.employeeNum,
        branchNum: user.branchNum,
      }));

      setProcessing(false);
      Alert.alert(
        `Import ${leads.length} leads?`,
        `Found ${leads.length} rows in the file. Add them all to your queue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: `Import ${leads.length}`,
            onPress: async () => {
              const raw = await AsyncStorage.getItem('@leadlens_leads');
              const existing = raw ? JSON.parse(raw) : [];
              await AsyncStorage.setItem('@leadlens_leads', JSON.stringify([...existing, ...leads]));
              navigation.navigate('Dashboard', { user });
            },
          },
        ]
      );
    } catch (err) {
      setProcessing(false);
      Alert.alert('Import failed', err.message || 'Could not read Excel file.');
    }
  };

  if (processing) {
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>{processingMsg}</Text>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScreenHeader title="Capture Lead" onBack={() => navigation.goBack()} />
      <View style={s.wrap}>

        <Text style={s.label}>CAMERA CAPTURE</Text>

        <TouchableOpacity style={s.btn} onPress={handleCardCapture} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(0,201,255,0.12)' }]}>
            <Text style={s.iconText}>💳</Text>
          </View>
          <View style={s.txt}>
            <Text style={s.title}>Business Card / ID</Text>
            <Text style={s.sub}>Single or front + back — option to capture both sides</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={() => handleSingleCapture(0.8, true)} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(255,107,43,0.12)' }]}>
            <Text style={s.iconText}>🏪</Text>
          </View>
          <View style={s.txt}>
            <Text style={s.title}>Storefront / Sign</Text>
            <Text style={s.sub}>Step back and capture the whole sign · Uses GPS to confirm address</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={s.btn} onPress={openGallery} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(0,229,160,0.12)' }]}>
            <Text style={s.iconText}>🖼️</Text>
          </View>
          <View style={s.txt}>
            <Text style={s.title}>Gallery / Screenshot</Text>
            <Text style={s.sub}>Import a saved photo or screenshot</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>

        <Text style={[s.label, { marginTop: 20 }]}>FILE IMPORT</Text>

        <TouchableOpacity style={s.btn} onPress={handleExcelImport} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(0,229,160,0.12)' }]}>
            <Text style={s.iconText}>📊</Text>
          </View>
          <View style={s.txt}>
            <Text style={s.title}>Import from Excel</Text>
            <Text style={s.sub}>Import leads from a .xlsx spreadsheet file</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>

        <View style={s.tipCard}>
          <Text style={s.tipText}>
            💡 AI will automatically try to enrich missing contact info after scanning
          </Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  label: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  btn: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center',
    gap: 14, marginBottom: 8,
  },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 26 },
  txt: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.muted, marginTop: 3, lineHeight: 16 },
  arrow: { fontSize: 22, color: COLORS.muted },
  tipCard: {
    backgroundColor: 'rgba(0,201,255,0.05)', borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.15)', borderRadius: 12, padding: 14, marginTop: 8,
  },
  tipText: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },
});
