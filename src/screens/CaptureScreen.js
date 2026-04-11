import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Animated,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton } from '../components/UI';
import { extractLeadFromImage } from '../utils/claudeApi';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCANNER_SIZE = SCREEN_WIDTH - 64;

export default function CaptureScreen({ navigation, route }) {
  const { user } = route.params;
  const [mode, setMode] = useState('choose');
  const [permission, requestPermission] = useCameraPermissions();
  const [lead, setLead] = useState({ ...EMPTY_LEAD });
  const cameraRef = useRef(null);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cornerAnim = useRef(new Animated.Value(0)).current;

  const update = (key, val) => setLead((p) => ({ ...p, [key]: val }));

  useEffect(() => {
    if (mode !== 'camera') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(cornerAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(cornerAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => { loop.stop(); pulse.stop(); };
  }, [mode]);

  const scanLineY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCANNER_SIZE - 4],
  });

  const openCamera = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) { Alert.alert('Camera permission required'); return; }
    }
    setMode('camera');
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;
    setMode('processing');
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.85 });
      await processImage(photo.base64, 'image/jpeg', photo.uri);
    } catch (err) {
      Alert.alert('Camera error', err.message);
      setMode('camera');
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo library permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85, base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setMode('processing');
    let b64 = asset.base64;
    if (!b64) b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    await processImage(b64, asset.mimeType || 'image/jpeg', asset.uri);
  };

  const processImage = async (b64, mime, uri) => {
    try {
      const extracted = await extractLeadFromImage(b64, mime);
      navigation.navigate('Review', {
        user,
        lead: { ...EMPTY_LEAD, ...extracted, captureMethod: 'image', imageUri: uri },
        editIdx: null,
      });
    } catch (err) {
      Alert.alert('Extraction issue', err.message || 'Could not read image.');
      navigation.navigate('Review', {
        user,
        lead: { ...EMPTY_LEAD, captureMethod: 'image', imageUri: uri },
        editIdx: null,
      });
    }
  };

  const goManualReview = () =>
    navigation.navigate('Review', { user, lead: { ...lead, captureMethod: 'manual' }, editIdx: null });

  // ── PROCESSING ──
  if (mode === 'processing') {
    return (
      <View style={s.root}>
        <ScreenHeader title="Scanning..." />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={s.loadingText}>AI is reading the image...</Text>
        </View>
      </View>
    );
  }

  // ── CAMERA ──
  if (mode === 'camera') {
    return (
      <View style={[s.root, { backgroundColor: '#000' }]}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View style={s.overlay}>
          <View style={s.overlayBand} />
          <View style={s.overlayMiddle}>
            <View style={s.overlaySide} />
            <View style={[s.scannerWindow, { width: SCANNER_SIZE, height: SCANNER_SIZE }]}>
              {/* Scan line */}
              <Animated.View style={[s.scanLine, { transform: [{ translateY: scanLineY }] }]} />
              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
              ].map((cs, i) => (
                <Animated.View key={i} style={[s.corner, cs, { opacity: cornerAnim }]} />
              ))}
            </View>
            <View style={s.overlaySide} />
          </View>
          <View style={[s.overlayBand, s.bottomBand]}>
            <Text style={s.scanHint}>Point at a business card or storefront</Text>
            <View style={s.shutterRow}>
              <TouchableOpacity style={s.sideBtn} onPress={pickFromGallery}>
                <Text style={s.sideBtnIcon}>🖼️</Text>
                <Text style={s.sideBtnLabel}>Gallery</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.shutterBtn} onPress={takePicture} activeOpacity={0.8}>
                <View style={s.shutterInner} />
              </TouchableOpacity>
              <TouchableOpacity style={s.sideBtn} onPress={() => setMode('choose')}>
                <Text style={s.sideBtnIcon}>✕</Text>
                <Text style={s.sideBtnLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── CHOOSE / MANUAL ──
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="New Prospect" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <Text style={s.sectionLabel}>Capture Method</Text>
        <View style={s.captureRow}>
          <TouchableOpacity style={[s.bigCapBtn, { borderColor: 'rgba(0,201,255,0.4)' }]} onPress={openCamera} activeOpacity={0.7}>
            <Text style={s.bigCapIcon}>📷</Text>
            <Text style={s.bigCapLabel}>Scan</Text>
            <Text style={s.bigCapSub}>Camera or gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.bigCapBtn, { borderColor: 'rgba(255,107,43,0.4)' }]} onPress={() => setMode('manual')} activeOpacity={0.7}>
            <Text style={s.bigCapIcon}>✏️</Text>
            <Text style={s.bigCapLabel}>Manual</Text>
            <Text style={s.bigCapSub}>Type it in</Text>
          </TouchableOpacity>
        </View>

        {mode === 'manual' && (
          <>
            <Text style={s.sectionLabel}>Enter Lead Info</Text>
            <View style={s.formGroup}>
              <FieldInput label="Business Name" placeholder="Acme Corp"
                value={lead.businessName} onChangeText={(v) => update('businessName', v)} />
            </View>
            <View style={[s.row, { marginTop: 10 }]}>
              <FieldInput label="First Name" placeholder="Jane"
                value={lead.pocFirst} onChangeText={(v) => update('pocFirst', v)} />
              <View style={{ width: 10 }} />
              <FieldInput label="Last Name" placeholder="Smith"
                value={lead.pocLast} onChangeText={(v) => update('pocLast', v)} />
            </View>
            <View style={[s.formGroup, { marginTop: 10 }]}>
              <FieldInput label="Phone" placeholder="(555) 555-5555" keyboardType="phone-pad"
                value={lead.phone} onChangeText={(v) => update('phone', v)} />
            </View>
            <View style={[s.formGroup, { marginTop: 10 }]}>
              <FieldInput label="Email" placeholder="contact@biz.com" keyboardType="email-address" autoCapitalize="none"
                value={lead.email} onChangeText={(v) => update('email', v)} />
            </View>
            <View style={[s.row, { marginTop: 10 }]}>
              <View style={{ width: 80 }}>
                <FieldInput label="St #" placeholder="123"
                  value={lead.streetNumber} onChangeText={(v) => update('streetNumber', v)} />
              </View>
              <View style={{ width: 10 }} />
              <FieldInput label="Street Name" placeholder="Main St"
                value={lead.streetName} onChangeText={(v) => update('streetName', v)} />
            </View>
            <View style={[s.row, { marginTop: 10 }]}>
              <FieldInput label="City" placeholder="Houston"
                value={lead.city} onChangeText={(v) => update('city', v)} />
              <View style={{ width: 10 }} />
              <View style={{ width: 60 }}>
                <FieldInput label="State" placeholder="TX" maxLength={2} autoCapitalize="characters"
                  value={lead.state} onChangeText={(v) => update('state', v.toUpperCase())} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ width: 80 }}>
                <FieldInput label="ZIP" placeholder="77001" keyboardType="numeric"
                  value={lead.zip} onChangeText={(v) => update('zip', v)} />
              </View>
            </View>
            <PrimaryButton title="Review Lead →" onPress={goManualReview} style={{ marginTop: 20 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 20,
  },
  captureRow: { flexDirection: 'row', gap: 12 },
  bigCapBtn: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: 16,
    paddingVertical: 28, alignItems: 'center', gap: 8,
  },
  bigCapIcon: { fontSize: 36 },
  bigCapLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  bigCapSub: { fontSize: 11, color: COLORS.muted },
  formGroup: {},
  row: { flexDirection: 'row' },

  // Camera
  overlay: { flex: 1 },
  overlayBand: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)' },
  bottomBand: {
    flex: 0, paddingBottom: 52, paddingTop: 24,
    alignItems: 'center', gap: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  scanHint: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  scannerWindow: { position: 'relative', overflow: 'hidden' },
  scanLine: {
    position: 'absolute', left: 0, right: 0, height: 2,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent, shadowOpacity: 1, shadowRadius: 8, elevation: 6,
  },
  corner: {
    position: 'absolute', width: 22, height: 22,
    borderColor: COLORS.accent,
  },
  shutterRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', width: '80%',
  },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  sideBtn: { alignItems: 'center', gap: 4, width: 60 },
  sideBtnIcon: { fontSize: 26 },
  sideBtnLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
});
