import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Animated, Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, EMPTY_LEAD } from '../constants';
import { extractLeadFromImage } from '../utils/claudeApi';

const { width: SW } = Dimensions.get('window');

const MODES = {
  card: {
    label: 'Card / ID',
    icon: '💳',
    hint: 'Tap shutter when card fills the frame',
    tip: 'Get close. Fill the frame.',
    frameW: SW - 64,
    frameH: (SW - 64) * 0.63,
  },
  storefront: {
    label: 'Storefront',
    icon: '🏪',
    hint: 'Step back, frame the sign, then tap shutter',
    tip: 'Capture the whole sign.',
    frameW: SW - 32,
    frameH: (SW - 32) * 0.56,
  },
  gallery: {
    label: 'Gallery',
    icon: '🖼️',
    hint: 'Choose a photo from your library',
    tip: '',
    frameW: 0,
    frameH: 0,
  },
};

export default function CaptureScreen({ navigation, route }) {
  const { user } = route.params;
  const [permission, requestPermission] = useCameraPermissions();
  const [captureMode, setCaptureMode] = useState('card');
  const [processing, setProcessing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);
  const scanAnim = useRef(new Animated.Value(0)).current;
  const cornerAnim = useRef(new Animated.Value(0)).current;
  const mode = MODES[captureMode];

  useEffect(() => {
    if (captureMode === 'gallery') { pickFromGallery(); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scanAnim, { toValue: 1, duration: 2200, useNativeDriver: true }),
      Animated.timing(scanAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
    ]));
    loop.start();
    const pulse = Animated.loop(Animated.sequence([
      Animated.timing(cornerAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(cornerAnim, { toValue: 0.35, duration: 900, useNativeDriver: true }),
    ]));
    pulse.start();
    return () => { loop.stop(); pulse.stop(); };
  }, [captureMode]);

  const scanLineY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(mode.frameH - 4, 0)] });

  const takePicture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      // Small delay to ensure camera is fully ready
      await new Promise(r => setTimeout(r, 200));
      if (!cameraRef.current) throw new Error('Camera not ready');
      const photo = await cameraRef.current.takePictureAsync({
        base64: false,
        quality: captureMode === 'storefront' ? 0.8 : 0.65,
      });
      setProcessing(true);
      const b64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await processImage(b64, 'image/jpeg', photo.uri);
    } catch (err) {
      Alert.alert('Camera error', err.message);
    } finally {
      setCapturing(false);
    }
  };

  const pickFromGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required'); setCaptureMode('card'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85, base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });
    if (result.canceled) { setCaptureMode('card'); return; }
    const asset = result.assets[0];
    setProcessing(true);
    let b64 = asset.base64;
    if (!b64) b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    const mime = (asset.mimeType || '').toLowerCase();
    const safeMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime) ? mime : 'image/jpeg';
    await processImage(b64, safeMime, asset.uri);
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
    } finally {
      setProcessing(false);
    }
  };

  if (processing) {
    return (
      <View style={[s.root, { backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={{ color: COLORS.muted, fontSize: 13 }}>AI is reading the image...</Text>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={[s.root, { backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 16, padding: 32 }]}>
        <Text style={{ color: COLORS.text, fontSize: 16, fontWeight: '600' }}>Camera access needed</Text>
        <TouchableOpacity style={{ backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }} onPress={requestPermission}>
          <Text style={{ color: '#000', fontWeight: '700' }}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: COLORS.muted }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: '#000' }]}>
      {captureMode !== 'gallery' && (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      )}

      <View style={s.overlay}>
        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.topTip}>{mode.tip}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Frame */}
        <View style={s.frameArea}>
          <View style={s.frameSide} />
          {captureMode !== 'gallery' && (
            <View style={[s.frame, { width: mode.frameW, height: mode.frameH }]}>
              {/* Scan line only for card */}
              {captureMode === 'card' && (
                <Animated.View style={[s.scanLine, { transform: [{ translateY: scanLineY }] }]} />
              )}
              {/* Corner brackets */}
              {[
                { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
                { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
                { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
                { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
              ].map((cs, i) => (
                <Animated.View key={i} style={[s.corner, cs, { opacity: cornerAnim, borderColor: COLORS.accent }]} />
              ))}
            </View>
          )}
          <View style={s.frameSide} />
        </View>

        {/* Bottom controls */}
        <View style={s.bottomBand}>
          <Text style={s.hint}>{mode.hint}</Text>

          {/* Mode tabs */}
          <View style={s.modeTabs}>
            {Object.entries(MODES).map(([key, m]) => (
              <TouchableOpacity
                key={key}
                style={[s.modeTab, captureMode === key && s.modeTabActive]}
                onPress={() => setCaptureMode(key)}
              >
                <Text style={s.modeTabIcon}>{m.icon}</Text>
                <Text style={[s.modeTabLabel, captureMode === key && s.modeTabLabelActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Shutter */}
          {captureMode !== 'gallery' && (
            <TouchableOpacity
              style={[s.shutterBtn, capturing && s.shutterBtnBusy]}
              onPress={takePicture}
              disabled={capturing}
              activeOpacity={0.8}
            >
              <View style={[s.shutterInner, capturing && s.shutterInnerBusy]} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1 },
  topBar: {
    backgroundColor: 'rgba(0,0,0,0.65)', flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 12,
    paddingTop: 52, paddingBottom: 14, justifyContent: 'space-between',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { color: '#fff', fontSize: 26, marginTop: -2 },
  topTip: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  frameArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  frameSide: { flex: 1, alignSelf: 'stretch', backgroundColor: 'rgba(0,0,0,0.65)' },
  frame: { position: 'relative', overflow: 'hidden' },
  scanLine: {
    position: 'absolute', left: 0, right: 0, height: 2,
    backgroundColor: COLORS.accent, shadowColor: COLORS.accent,
    shadowOpacity: 1, shadowRadius: 8, elevation: 6,
  },
  corner: { position: 'absolute', width: 22, height: 22 },
  bottomBand: {
    backgroundColor: 'rgba(0,0,0,0.72)', paddingTop: 16,
    paddingBottom: 44, alignItems: 'center', gap: 16,
  },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', paddingHorizontal: 24 },
  modeTabs: { flexDirection: 'row', gap: 8 },
  modeTab: {
    alignItems: 'center', paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', gap: 3,
  },
  modeTabActive: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.12)' },
  modeTabIcon: { fontSize: 20 },
  modeTabLabel: { fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.5 },
  modeTabLabelActive: { color: COLORS.accent },
  shutterBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  shutterBtnBusy: { borderColor: COLORS.accent },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  shutterInnerBusy: { backgroundColor: COLORS.accent },
});
