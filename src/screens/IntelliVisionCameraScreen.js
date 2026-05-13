import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Dimensions, PanResponder, Linking,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS } from '../constants';
import { getCurrentCoords, getCameraHeading } from '../utils/geoEnrich';
import { LEADLOCK_ZOOM_LEVELS, getDynamicLeadLockZoomConfig } from '../config/leadLockZoomOffsets';
import { buildLeadLockTarget } from '../utils/leadLockTargeting';
import LeadLockTargetOverlay from '../components/LeadLockTargetOverlay';
import * as FileSystem from 'expo-file-system';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const ZOOM_PRESETS = LEADLOCK_ZOOM_LEVELS;

export default function IntelliVisionCameraScreen({ navigation, route }) {
  const { user = {} } = route?.params || {};
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [dynamicZoomLevel, setDynamicZoomLevel] = useState(1);
  const [cameraZoomValue, setCameraZoomValue] = useState(0);
  const [heading, setHeading] = useState(null);
  const [coords, setCoords] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [locationReady, setLocationReady] = useState(false);
  const [targetBox, setTargetBox] = useState(null);
  const [targetBoxSize, setTargetBoxSize] = useState('medium');
  const [zoomTrackWidth, setZoomTrackWidth] = useState(0);
  const zoomTrackWidthRef = useRef(0);
  const dynamicZoomLevelRef = useRef(1);
  const cameraZoomValueRef = useRef(0);
  const lastCameraZoomCommitRef = useRef(0);
  const cameraZoomCommitTimerRef = useRef(null);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;
  const headingAnim = useRef(new Animated.Value(0)).current;

  const handleRequestPermission = async () => {
    try {
      console.log('[LeadLock] Requesting camera permission...');
      const result = await requestPermission();
      console.log('[LeadLock] Permission result:', result);

      if (!result.granted && !result.canAskAgain) {
        showThemedAlert(
          'Permission Blocked',
          'Camera access is permanently denied. Please enable it in your device settings to use LeadLock™.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (err) {
      console.error('[LeadLock] Permission error:', err);
      showThemedAlert('Error', 'Could not request camera permissions.');
    }
  };

  const commitCameraZoomValue = useCallback((displayZoom, immediate = false) => {
    const zoomConfig = getDynamicLeadLockZoomConfig(displayZoom);
    const nextCameraZoom = Math.max(0, Math.min(1, Number(zoomConfig.value || 0)));

    // Avoid hammering CameraView with tiny zoom changes. That is what causes the preview jump.
    if (Math.abs(cameraZoomValueRef.current - nextCameraZoom) < 0.008) {
      return;
    }

    const applyZoom = () => {
      cameraZoomValueRef.current = nextCameraZoom;
      lastCameraZoomCommitRef.current = Date.now();
      setCameraZoomValue(nextCameraZoom);
    };

    if (cameraZoomCommitTimerRef.current) {
      clearTimeout(cameraZoomCommitTimerRef.current);
      cameraZoomCommitTimerRef.current = null;
    }

    const elapsed = Date.now() - lastCameraZoomCommitRef.current;

    if (immediate || elapsed >= 90) {
      applyZoom();
      return;
    }

    cameraZoomCommitTimerRef.current = setTimeout(applyZoom, 90 - elapsed);
  }, []);

  const setLeadLockDisplayZoom = useCallback((nextZoom, options = {}) => {
    const roundedZoom = Math.max(1, Math.min(20, Math.round(Number(nextZoom || 1) * 10) / 10));

    if (Math.abs(dynamicZoomLevelRef.current - roundedZoom) < 0.05) {
      return;
    }

    dynamicZoomLevelRef.current = roundedZoom;
    setDynamicZoomLevel(roundedZoom);
    commitCameraZoomValue(roundedZoom, Boolean(options.immediate));
  }, [commitCameraZoomValue]);

  const updateDynamicZoomFromX = useCallback((x, options = {}) => {
    const width = zoomTrackWidthRef.current || zoomTrackWidth || 1;
    const clampedX = Math.max(0, Math.min(width, Number(x) || 0));
    const progress = clampedX / width;
    const nextZoom = 1 + progress * 19;
    setLeadLockDisplayZoom(nextZoom, options);
  }, [setLeadLockDisplayZoom, zoomTrackWidth]);

  const zoomPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => updateDynamicZoomFromX(event.nativeEvent.locationX, { immediate: true }),
      onPanResponderMove: (event) => updateDynamicZoomFromX(event.nativeEvent.locationX),
      onPanResponderRelease: () => commitCameraZoomValue(dynamicZoomLevelRef.current, true),
      onPanResponderTerminate: () => commitCameraZoomValue(dynamicZoomLevelRef.current, true),
    })
  ).current;

  const handleZoomTrackLayout = useCallback((event) => {
    const width = event.nativeEvent.layout.width;
    zoomTrackWidthRef.current = width;
    setZoomTrackWidth(width);
  }, []);

  const applyPresetZoom = useCallback((displayZoom) => {
    setLeadLockDisplayZoom(Number(displayZoom) || 1, { immediate: true });
  }, [setLeadLockDisplayZoom]);

  useEffect(() => {
    return () => {
      if (cameraZoomCommitTimerRef.current) {
        clearTimeout(cameraZoomCommitTimerRef.current);
      }
    };
  }, []);

  // Start pulsing crosshair ring
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseOpacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Get GPS + heading on mount. Never let location failure crash LeadLock.
  useFocusEffect(useCallback(() => {
    let headingInterval;
    let active = true;

    (async () => {
      try {
        const [c, h] = await Promise.all([
          getCurrentCoords().catch(() => null),
          getCameraHeading().catch(() => null),
        ]);

        if (!active) return;

        setCoords(c);
        setHeading(h);
        setLocationReady(!!c);

        headingInterval = setInterval(async () => {
          const newH = await getCameraHeading().catch(() => null);
          if (!active || !newH) return;

          setHeading(newH);
          Animated.spring(headingAnim, {
            toValue: newH.magHeading || 0,
            useNativeDriver: false,
          }).start();
        }, 2000);
      } catch (error) {
        console.log('[LeadLock] Location/heading init failed:', error?.message || String(error));
        if (active) setLocationReady(false);
      }
    })();

    return () => {
      active = false;
      if (headingInterval) clearInterval(headingInterval);
    };
  }, [headingAnim]));

  const handleCapture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);

    try {
      // 1. Capture the photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        skipProcessing: false,
      });

      // 2. Prepare for navigation
      const zoomLevel = getDynamicLeadLockZoomConfig(dynamicZoomLevel);
      const captureCoords = coords; // Use existing, don't wait for refresh
      const captureHeading = heading;
      let leadLockTarget = null;

      try {
        leadLockTarget = buildLeadLockTarget({
          coords: captureCoords,
          heading: captureHeading,
          zoomLevel,
          targetBox,
        });
      } catch (e) {
        leadLockTarget = { target: captureCoords, zoomConfig: zoomLevel };
      }

      // 3. Hand off the heavy lifting (copying, navigation) to a background task
      // or just navigate immediately if we have the URI.
      navigation.replace('IntelliVisionReview', {
        user,
        lead: {},
        coords: captureCoords,
        heading: captureHeading,
        imageUri: photo.uri, // Navigate with the temp URI immediately
        zoomLevel,
        targetBox,
        targetBoxSize,
        leadLockTarget,
        photoUri: photo.uri,
      });

      // 4. Background: Copy to permanent storage (optional, review screen can handle its own persistence)
      const filename = `leadlock_${Date.now()}.jpg`;
      const dest = `${FileSystem.documentDirectory}card_images/${filename}`;
      FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}card_images/`, { intermediates: true })
        .then(() => FileSystem.copyAsync({ from: photo.uri, to: dest }))
        .catch(e => console.warn('[LeadLock] Background copy failed:', e));

    } catch (err) {
      console.error('[LeadLock] Capture error:', err);
      showThemedAlert('Capture failed', err.message);
      setCapturing(false);
    }
  };

  if (!permission) return <View style={s.root} />;
  if (!permission.granted) {
    const isBlocked = !permission.canAskAgain;
    return (
      <View style={[s.root, s.center]}>
        <ThemedAlertHost />
        <Text style={s.permText}>
          {isBlocked
            ? 'Camera access is permanently blocked. Please enable it in settings to use LeadLock™.'
            : 'Camera access required for LeadLock™'}
        </Text>
        <TouchableOpacity
          style={s.permBtn}
          onPress={isBlocked ? () => Linking.openSettings() : handleRequestPermission}
        >
          <Text style={s.permBtnText}>
            {isBlocked ? 'Open Settings' : 'Grant Permission'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const zoom = getDynamicLeadLockZoomConfig(dynamicZoomLevel);
  const zoomProgress = Math.max(0, Math.min(1, (Number(zoom.displayZoom || 1) - 1) / 19));
  const zoomDisplay = Number(zoom.displayZoom || 1);
  const zoomDisplayText = zoomDisplay % 1 === 0 ? `${zoomDisplay.toFixed(0)}×` : `${zoomDisplay.toFixed(1)}×`;
  const compassDeg = heading?.magHeading ?? 0;
  const compassDir = getCompassDirection(compassDeg);

  return (
    <View style={s.root}>
      <ThemedAlertHost />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={cameraZoomValue}
      />

      <LeadLockTargetOverlay
        targetBox={targetBox}
        targetSize={targetBoxSize}
        onTargetBoxChange={setTargetBox}
        onTargetSizeChange={setTargetBoxSize}
        onClearTarget={() => setTargetBox(null)}
      />

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backText}>✕</Text>
        </TouchableOpacity>

        <View style={s.topCenter}>
          <Text style={s.intellivisionLabel}>⚡ LeadLock™</Text>
          <Text style={s.rangeLabel}>{zoom.distMin}–{zoom.distMax}m · {zoom.offsetFeet}ft offset</Text>
        </View>

        {/* Compass */}
        <View style={s.compassWrap}>
          <Text style={s.compassDeg}>{Math.round(compassDeg)}°</Text>
          <Text style={s.compassDir}>{compassDir}</Text>
        </View>
      </View>

      {/* Crosshair overlay */}
      <View style={s.crosshairWrap} pointerEvents="none">
        {/* Corner brackets */}
        <View style={s.crosshair}>
          <View style={[s.bracket, s.bracketTL]} />
          <View style={[s.bracket, s.bracketTR]} />
          <View style={[s.bracket, s.bracketBL]} />
          <View style={[s.bracket, s.bracketBR]} />

          {/* Center dot */}
          <View style={s.centerDot} />

          {/* Horizontal line */}
          <View style={s.hLine} />
          <View style={s.vLine} />

          {/* Pulsing ring */}
          <Animated.View style={[
            s.pulseRing,
            {
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            }
          ]} />
        </View>

        {/* Processing Indicator */}
        {capturing && (
          <View style={s.processingOverlay}>
            <ActivityIndicator size="large" color="#00C9FF" />
            <Text style={s.processingText}>Processing Intelligence...</Text>
          </View>
        )}

        {/* GPS status */}
        <View style={s.gpsStatus}>
          <View style={[s.gpsDot, { backgroundColor: locationReady ? '#00E5A0' : '#FF6B2B' }]} />
          <Text style={s.gpsText}>
            {locationReady
              ? `GPS locked · ${coords?.latitude?.toFixed(4)}, ${coords?.longitude?.toFixed(4)}`
              : 'Acquiring GPS...'}
          </Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={s.bottomBar}>
        {/* Dynamic zoom selector */}
        <View style={s.dynamicZoomPanel}>
          <View style={s.zoomSliderHeader}>
            <Text style={s.zoomModeText}>Dynamic Zoom</Text>
            <Text style={s.zoomValueText}>{zoomDisplayText}</Text>
          </View>

          <View
            style={s.zoomSliderTrack}
            onLayout={handleZoomTrackLayout}
            {...zoomPanResponder.panHandlers}
          >
            <View style={[s.zoomSliderFill, { width: `${zoomProgress * 100}%` }]} />
            <View style={[s.zoomSliderThumb, { left: `${zoomProgress * 100}%` }]} />
          </View>

          <View style={s.zoomRow}>
            {ZOOM_PRESETS.map((z) => {
              const active = Math.abs(Number(zoom.displayZoom) - Number(z.displayZoom)) < 0.05;
              return (
                <TouchableOpacity
                  key={z.label}
                  style={[s.zoomBtn, active && s.zoomBtnActive]}
                  onPress={() => applyPresetZoom(z.displayZoom)}
                >
                  <Text style={[s.zoomText, active && s.zoomTextActive]}>
                    {z.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={s.zoomHint}>
            {zoom.offsetFeet}ft offset · {zoom.searchRadiusFeet}ft search · {zoom.minimumConfidence}% lock
          </Text>
        </View>

        {/* Capture button */}
        <TouchableOpacity
          style={[s.captureBtn, capturing && s.captureBtnActive]}
          onPress={handleCapture}
          disabled={capturing}
        >
          <View style={s.captureBtnInner} />
        </TouchableOpacity>

        <View style={{ width: 60 }} />
      </View>
    </View>
  );
}

function getCompassDirection(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

const CROSSHAIR_SIZE = 220;
const BRACKET_SIZE = 28;
const BRACKET_THICKNESS = 3;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },

  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.68)',
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  backText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  topCenter: { alignItems: 'center' },
  intellivisionLabel: {
    color: '#00C9FF', fontSize: 14, fontWeight: '800', letterSpacing: 1,
  },
  rangeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 },
  compassWrap: { alignItems: 'center', minWidth: 60 },
  compassDeg: { color: '#fff', fontSize: 14, fontWeight: '700' },
  compassDir: { color: '#00C9FF', fontSize: 11, fontWeight: '700' },

  crosshairWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshair: {
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bracket: {
    position: 'absolute',
    width: BRACKET_SIZE,
    height: BRACKET_SIZE,
    borderColor: '#00C9FF',
  },
  bracketTL: {
    top: 0, left: 0,
    borderTopWidth: BRACKET_THICKNESS,
    borderLeftWidth: BRACKET_THICKNESS,
  },
  bracketTR: {
    top: 0, right: 0,
    borderTopWidth: BRACKET_THICKNESS,
    borderRightWidth: BRACKET_THICKNESS,
  },
  bracketBL: {
    bottom: 0, left: 0,
    borderBottomWidth: BRACKET_THICKNESS,
    borderLeftWidth: BRACKET_THICKNESS,
  },
  bracketBR: {
    bottom: 0, right: 0,
    borderBottomWidth: BRACKET_THICKNESS,
    borderRightWidth: BRACKET_THICKNESS,
  },

  centerDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#00C9FF',
    position: 'absolute',
  },
  hLine: {
    position: 'absolute',
    width: CROSSHAIR_SIZE * 0.4,
    height: 1,
    backgroundColor: 'rgba(0,201,255,0.4)',
  },
  vLine: {
    position: 'absolute',
    width: 1,
    height: CROSSHAIR_SIZE * 0.4,
    backgroundColor: 'rgba(0,201,255,0.4)',
  },
  pulseRing: {
    position: 'absolute',
    width: 80, height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: '#00C9FF',
  },

  gpsStatus: {
    position: 'absolute',
    bottom: -36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gpsDot: { width: 7, height: 7, borderRadius: 4 },
  gpsText: { color: 'rgba(255,255,255,0.7)', fontSize: 10 },

  processingOverlay: {
    position: 'absolute',
    top: -120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#00C9FF',
  },
  processingText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 48, paddingTop: 20,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dynamicZoomPanel: {
    width: Math.min(SCREEN_W - 32, 390),
    marginBottom: 22,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.22)',
  },
  zoomSliderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  zoomModeText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  zoomValueText: {
    color: '#00E5A0',
    fontSize: 18,
    fontWeight: '900',
  },
  zoomSliderTrack: {
    height: 26,
    justifyContent: 'center',
    marginHorizontal: 2,
    marginBottom: 10,
  },
  zoomSliderFill: {
    position: 'absolute',
    left: 0,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#00C9FF',
  },
  zoomSliderThumb: {
    position: 'absolute',
    width: 22,
    height: 22,
    marginLeft: -11,
    borderRadius: 11,
    backgroundColor: '#00E5A0',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#00E5A0',
    shadowOpacity: 0.75,
    shadowRadius: 8,
    elevation: 6,
  },
  zoomHint: {
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
    fontSize: 10,
    marginTop: 8,
    fontWeight: '700',
  },
  zoomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    justifyContent: 'center',
  },
  zoomBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  zoomBtnActive: {
    backgroundColor: 'rgba(0,201,255,0.25)',
    borderColor: '#00C9FF',
  },
  zoomText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', fontSize: 11 },
  zoomTextActive: { color: '#00C9FF' },

  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnActive: { borderColor: '#00C9FF' },
  captureBtnInner: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fff',
  },

  permText: { color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 20, paddingHorizontal: 32 },
  permBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  permBtnText: { color: '#000', fontWeight: '800', fontSize: 15 },
});
