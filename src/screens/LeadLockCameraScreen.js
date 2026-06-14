/**
 * LeadLock Camera Screen
 * Captures location photos, detects multiple businesses, enriches data
 * Minimal UI: Just take photo → See what's there → Select prospects
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  Alert,
  Image,
  useWindowDimensions,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import {
  detectMultipleBusinessesInPhoto,
  formatMultiBusinessesForDisplay,
  convertSelectedBusinessesToProspects,
} from '../utils/multiBusinessDetection';
import { storageBridge } from '../utils/storage';
import { LEADS_STORAGE_KEY } from '../constants';
import { getCurrentCoords, reverseGeocodeCoords } from '../utils/geoEnrich';
import * as ImageManipulator from 'expo-image-manipulator';
import useLeadLockLocationSnapshot from '../hooks/useLeadLockLocationSnapshot';
import resolveZipFromLeadLockPhoto from '../utils/location/resolveZipFromLeadLockPhoto';

const COLORS_THEME = {
  bg: '#080A0F',
  surface: '#111318',
  surface2: '#1a1e26',
  accent: '#00C9FF',
  accent2: '#CC1040',
  purple: '#7B3FBE',
  text: '#FFFFFF',
  muted: '#B8BDD0',
  chrome: '#B8BDD0',
  borderLit: '#2a3038',
};

export default function LeadLockCameraScreen({ navigation }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Track actual camera view dimensions for dynamic bounding box
  const [cameraLayout, setCameraLayout] = useState({
    width: screenWidth,
    height: screenHeight,
  });

  // Camera states
  const [cameraActive, setCameraActive] = useState(true);
  const [photoData, setPhotoData] = useState(null);
  const [zoom, setZoom] = useState(0); // value from 0 to 1

  const initialDistRef = useRef(null);
  const initialZoomRef = useRef(0);

  const handleTouchStart = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches && touches.length === 2) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      initialDistRef.current = Math.sqrt(dx * dx + dy * dy);
      initialZoomRef.current = zoom;
    } else {
      initialDistRef.current = null;
    }
  };

  const handleTouchMove = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches && touches.length === 2 && initialDistRef.current !== null) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);

      const diff = currentDist - initialDistRef.current;
      // 0.002 sensitivity factor provides smooth scaling
      const scale = 0.002;
      const newZoom = Math.max(0, Math.min(1, initialZoomRef.current + diff * scale));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialDistRef.current = null;
  };

  // State for captured photo exif data
  const [photoExifData, setPhotoExifData] = useState(null);

  // Resolved location for display
  const [resolvedLocation, setResolvedLocation] = useState(null);

  // Detection states
  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [selectedBusinesses, setSelectedBusinesses] = useState([]);

  // Location context — single source from hook, no duplicate getCurrentCoords call
  const [location, setLocation] = useState(null);
  const { leadLockGps } = useLeadLockLocationSnapshot(true);
  const mountedRef = useRef(true);
  const resolvedZipRef = useRef(null);

  // Fallback location default
  const FALLBACK_LOC = {
    latitude: 29.7589,
    longitude: -95.3677,
    city: 'Houston',
    county: 'Harris',
    zip: null,
  };

  useEffect(() => {
    mountedRef.current = true;
    initLocation();
    return () => { mountedRef.current = false; };
  }, []);

  const initLocation = async () => {
    // Use hook's leadLockGps if available (avoids duplicate permission request)
    if (leadLockGps && leadLockGps.latitude) {
      const geoInfo = await reverseGeocodeCoords({
        latitude: leadLockGps.latitude,
        longitude: leadLockGps.longitude,
      }).catch(() => null);
      if (!mountedRef.current) return;
      if (geoInfo) {
        const loc = {
          latitude: leadLockGps.latitude,
          longitude: leadLockGps.longitude,
          city: geoInfo.city || geoInfo.town || geoInfo.village || 'Houston',
          county: geoInfo.county || 'Harris',
          zip: geoInfo.postcode || geoInfo.zip || geoInfo.postal_code || null,
        };
        setLocation(loc);
        if (loc.zip) resolvedZipRef.current = loc.zip;
        await storageBridge.setItem('currentLocation', JSON.stringify(loc)).catch(() => {});
        return;
      }
    }

    // Fallback: try one-shot GPS
    try {
      const liveCoords = await getCurrentCoords();
      if (!mountedRef.current) return;
      if (liveCoords) {
        const geoInfo = await reverseGeocodeCoords(liveCoords).catch(() => null);
        if (!mountedRef.current) return;
        if (geoInfo) {
          const loc = {
            latitude: liveCoords.latitude,
            longitude: liveCoords.longitude,
            city: geoInfo.city || geoInfo.town || geoInfo.village || 'Houston',
            county: geoInfo.county || 'Harris',
            zip: geoInfo.postcode || geoInfo.zip || geoInfo.postal_code || null,
          };
          setLocation(loc);
          if (loc.zip) resolvedZipRef.current = loc.zip;
          await storageBridge.setItem('currentLocation', JSON.stringify(loc)).catch(() => {});
          return;
        }
      }
    } catch (gpsErr) {
      console.warn('[LeadLockCamera] GPS failed:', gpsErr);
    }

    // Final fallback: stored or default
    if (!mountedRef.current) return;
    try {
      const stored = await storageBridge.getItem('currentLocation');
      if (stored) {
        const loc = JSON.parse(stored);
        setLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          city: loc.city || 'Houston',
          county: loc.county,
          zip: loc.zip || null,
        });
        return;
      }
    } catch (_) {}
    setLocation(FALLBACK_LOC);
  };

  // Request camera permission
  if (!permission) {
    return (
      <View style={s.permissionContainer}>
        <Text style={s.permissionText}>Camera access required</Text>
        <TouchableOpacity style={s.permissionBtn} onPress={requestPermission}>
          <Text style={s.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission?.canAskAgain !== false;
    return (
      <View style={s.permissionContainer}>
        <Text style={s.permissionText}>Camera permission denied</Text>
        <Text style={s.permissionSubtext}>
          Enable in Settings → Apps → LeadLens → Permissions
        </Text>
        <TouchableOpacity
          style={s.permissionBtn}
          onPress={() => {
            if (canAskAgain) {
              requestPermission();
            } else {
              Linking.openSettings().catch(() => {});
            }
          }}
        >
          <Text style={s.permissionBtnText}>{canAskAgain ? 'Grant Permission' : 'Open Settings'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Take photo
  const handleTakePhoto = async () => {
    try {
      if (!cameraRef.current) return;

      // Do NOT request base64 directly from raw high-res photo to prevent OOM
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: true,
      });

      // Capture EXIF from raw photo before manipulation may strip it
      const rawExif = photo?.exif || null;
      setPhotoExifData(rawExif);
      console.log('[LeadLockCamera] Photo EXIF captured:', rawExif ? 'yes' : 'no');

      // Resize and compress the captured photo before converting to base64
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      setPhotoData({
        uri: manipulated.uri,
        base64: manipulated.base64,
      });
      setCameraActive(false);
      // Fix: pass rawExif directly — setPhotoExifData is async so photoExifData
      // would still be null if we read it from state here (race condition)
      handleDetectBusinesses(manipulated.base64, rawExif);
    } catch (error) {
      console.error('[LeadLockCamera] Take photo/manipulation error:', error);
      Alert.alert('Photo Error', error.message);
    }
  };

  // Detect businesses in photo
  const handleDetectBusinesses = async (base64, exifData) => {
    setDetecting(true);
    try {
      const result = await detectMultipleBusinessesInPhoto(base64, location);
      if (!mountedRef.current) return;

      // Resolve location for display — skip if already resolved for this session
      if (!resolvedZipRef.current) {
        const firstBusinessZip = result?.businesses?.[0]?.detection?.address
          ? (result.businesses[0].detection.address.match(/\b(\d{5})(?:-\d{4})?\b/) || [])[1]
          : null;
        const resolved = await resolveZipFromLeadLockPhoto({
          liveGps: leadLockGps,
          photoExif: exifData,
          businessAddressZip: firstBusinessZip || null,
          allowDeviceFallback: true,
        });
        if (mountedRef.current) setResolvedLocation(resolved);
        if (resolved?.zip) resolvedZipRef.current = resolved.zip;
      } else {
        // Re-use cached zip
        if (mountedRef.current) {
          setResolvedLocation({
            zip: resolvedZipRef.current,
            source: 'cached',
            confidence: 0.9,
            capturedAt: new Date().toISOString(),
          });
        }
      }

      if (result.success) {
        const formatted = formatMultiBusinessesForDisplay(result);
        setDetectionResult({
          ...result,
          formatted,
        });
        setSelectedBusinesses(formatted.map(b => ({ ...b, selected: true }))); // Auto-select all
      } else {
        Alert.alert('No Businesses Detected', 'Try a clearer angle with more storefronts visible');
      }
    } catch (error) {
      Alert.alert('Detection Error', error.message);
    } finally {
      setDetecting(false);
    }
  };

  // Toggle business selection
  const toggleBusinessSelection = (index) => {
    const updated = [...selectedBusinesses];
    updated[index].selected = !updated[index].selected;
    setSelectedBusinesses(updated);
  };

  // Remove business from list entirely
  const removeBusiness = (index) => {
    const updated = selectedBusinesses.filter((_, i) => i !== index);
    setSelectedBusinesses(updated);
  };

  // Add selected to queue
  const handleAddToQueue = async () => {
    const selected = selectedBusinesses.filter(b => b.selected);

    if (selected.length === 0) {
      Alert.alert('No Selection', 'Select at least one business to add');
      return;
    }

    // Extract best available zip from selected businesses for fallback
    const businessZip = selected
      .map(b => {
        const addr = b.address || (b.fullData?.detection?.address) || '';
        const m = addr.match(/\b(\d{5})(?:-\d{4})?\b/);
        return m ? m[1] : null;
      })
      .find(Boolean) || null;

    try {
      let resolved;
      if (resolvedZipRef.current) {
        resolved = {
          zip: resolvedZipRef.current,
          source: 'cached',
          confidence: 0.9,
          capturedAt: new Date().toISOString(),
        };
      } else {
        resolved = await resolveZipFromLeadLockPhoto({
          liveGps: leadLockGps,
          photoExif: photoExifData,
          businessAddressZip: businessZip,
          allowDeviceFallback: true,
        });
      }
      if (!mountedRef.current) return;

      console.log('[LeadLockCamera] Resolved photo location:', resolved);

      const prospects = convertSelectedBusinessesToProspects(selected, resolved);

      // Read existing queue from correct storage key
      let currentQueue = [];
      try {
        const raw = storageBridge.getSync(LEADS_STORAGE_KEY);
        if (raw) currentQueue = JSON.parse(raw);
        if (!Array.isArray(currentQueue)) currentQueue = [];
      } catch (parseErr) {
        console.warn('[LeadLock] Queue parse error, starting fresh:', parseErr);
        currentQueue = [];
      }
      const updatedQueue = [...currentQueue, ...prospects];

      // Write to MMKV with error guard
      try {
        storageBridge.setSync(LEADS_STORAGE_KEY, JSON.stringify(updatedQueue));
      } catch (mmkvErr) {
        console.error('[LeadLock] MMKV write failed:', mmkvErr);
      }
      // AsyncStorage backup
      const RawStorage = require('@react-native-async-storage/async-storage').default;
      await RawStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updatedQueue)).catch((e) =>
        console.warn('[LeadLock] AsyncStorage backup write failed:', e)
      );

      if (!mountedRef.current) return;
      Alert.alert('Added to Queue', `${prospects.length} prospect${prospects.length !== 1 ? 's' : ''} added successfully`, [
        { text: 'OK', onPress: () => resetCamera() },
      ]);
    } catch (error) {
      console.error('[LeadLock] Queue save error:', error);
      Alert.alert('Error', 'Failed to add to queue: ' + (error?.message || 'unknown'));
    }
  };

  // Reset to camera
  const _resetCamera = () => {
    setPhotoData(null);
    setPhotoExifData(null);
    setDetectionResult(null);
    setSelectedBusinesses([]);
    setZoom(0);
    setCameraActive(true);
  };
  // Maintain backward compatibility in function calls
  const resetCamera = _resetCamera;

  // ── CAMERA VIEW
  if (cameraActive && !detectionResult) {
    return (
      <View style={s.container}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          zoom={zoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCameraLayout({ width, height });
          }}
        >
          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Text style={s.headerText}>←</Text>
            </TouchableOpacity>
            <Text style={s.headerTitle}>LeadLock Camera</Text>
            <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
            {/* Zip capture status — visible before shooting */}
            <View style={s.zipIndicatorRow}>
              <Text style={[s.zipIndicatorDot, { color: location?.zip ? '#51CF66' : '#FFA94D' }]}>●</Text>
              <Text style={s.zipIndicatorText}>
                {location?.zip ? `ZIP ${location.zip}` : 'Acquiring ZIP...'}
              </Text>
            </View>
          </View>

          {/* Capture button */}
          <View style={[s.footer, { bottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={s.captureBtn}
              onPress={handleTakePhoto}
              activeOpacity={0.7}
            >
              <View style={s.captureBtnInner} />
            </TouchableOpacity>
            <Text style={s.captureLabel}>Tap to Capture</Text>
          </View>
        </CameraView>
      </View>
    );
  }

  // ── DETECTION LOADING
  if (detecting) {
    const hasZip = location?.zip;
    return (
      <View style={[s.container, s.centerContent]}>
        <ActivityIndicator size="large" color={COLORS_THEME.accent} />
        <Text style={s.loadingText}>Analyzing location...</Text>
        <Text style={s.loadingSubtext}>Detecting businesses and fetching data</Text>
        <View style={s.zipStatusRow}>
          <Text style={[s.zipStatusDot, { color: hasZip ? '#51CF66' : '#FFA94D' }]}>●</Text>
          <Text style={s.zipStatusText}>
            {hasZip ? `ZIP ${location.zip} captured` : 'ZIP pending — enrichment will use GPS coords'}
          </Text>
        </View>
      </View>
    );
  }

  // ── RESULTS VIEW
  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.resultsHeader}>
        <TouchableOpacity onPress={resetCamera}>
          <Text style={s.backBtn}>← Retake</Text>
        </TouchableOpacity>
        <Text style={s.resultsTitle}>
          {selectedBusinesses.length} of {selectedBusinesses.length} Selected
        </Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Location info bar */}
      {resolvedLocation && (
        <View style={s.locationBar}>
          <Text style={s.locationText}>
            Zip: {resolvedLocation.zip || '—'}  |  Source: {resolvedLocation.source === 'live_gps' ? 'Live GPS' : resolvedLocation.source === 'photo_exif' ? 'Photo EXIF' : resolvedLocation.source === 'business_address' ? 'Business Address' : resolvedLocation.source === 'device_fallback' ? 'Device Fallback' : resolvedLocation.source}
          </Text>
          <Text style={[s.locationConfidence, {
            color: resolvedLocation.confidence >= 0.85 ? '#51CF66' : resolvedLocation.confidence >= 0.65 ? '#FFA94D' : '#FF6B6B'
          }]}>
            Location Confidence: {resolvedLocation.confidence >= 0.85 ? 'High' : resolvedLocation.confidence >= 0.65 ? 'Medium' : resolvedLocation.confidence > 0 ? 'Low' : 'Missing'}
          </Text>
          {resolvedLocation.confidence < 0.65 && (
            <Text style={s.locationWarning}>⚠ Confirm location before enrichment</Text>
          )}
        </View>
      )}

      {/* Photo preview */}
      {photoData && (
        <Image source={{ uri: photoData.uri }} style={s.photoPreview} />
      )}

      {/* Business list */}
      {selectedBusinesses.length > 0 && (
        <Text style={s.selectionCount}>
          {selectedBusinesses.filter(b => b.selected).length} of {selectedBusinesses.length} businesses selected
        </Text>
      )}
      <ScrollView style={s.businessList} showsVerticalScrollIndicator={false}>
        {selectedBusinesses.map((business, index) => (
          <View key={index} style={s.cardWrapper}>
            {business.selected && <View style={s.cardSelectedBar} />}
            <TouchableOpacity
              style={[s.businessCard, business.selected && s.businessCardSelected]}
              onPress={() => toggleBusinessSelection(index)}
              activeOpacity={0.7}
            >
              {/* Risk indicator */}
              <View
                style={[
                  s.riskBadge,
                  {
                    backgroundColor: getRiskColor(business.riskLevel),
                  },
                ]}
              >
                <Text style={s.riskBadgeText}>{business.riskLevel}</Text>
                <Text style={s.riskScore}>{business.riskScore}</Text>
              </View>

              {/* Business info */}
              <View style={s.businessInfo}>
                <Text style={s.businessName}>{business.name}</Text>
                <Text style={s.businessType}>{business.businessType}</Text>
                <Text style={s.businessAddress}>{business.address}</Text>

                {/* Badges */}
                <View style={s.badgesRow}>
                  {business.badges.map((badge, i) => (
                    <View key={i} style={[s.badge, { borderColor: badge.color }]}>
                      <Text style={[s.badgeText, { color: badge.color }]}>
                        {badge.label} {badge.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Pest indicators */}
                {business.pestIndicators.length > 0 && (
                  <Text style={s.pestIndicators}>
                    ⚠️ {business.pestIndicators.join(', ')}
                  </Text>
                )}
              </View>

              {/* Right side: checkbox + remove */}
              <View style={s.rightControls}>
                <View
                  style={[
                    s.checkbox,
                    business.selected && s.checkboxChecked,
                  ]}
                >
                  {business.selected && <Text style={s.checkmark}>✓</Text>}
                </View>
                <TouchableOpacity
                  style={s.removeBtn}
                  onPress={() => removeBusiness(index)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.removeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>

      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={s.cancelBtn} onPress={resetCamera}>
          <Text style={s.cancelBtnText}>Discard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.addBtn, selectedBusinesses.filter(b => b.selected).length === 0 && s.addBtnDisabled]}
          onPress={handleAddToQueue}
          disabled={selectedBusinesses.filter(b => b.selected).length === 0}
        >
          <Text style={s.addBtnText}>
            Add Selected to Queue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Risk color by level
function getRiskColor(riskLevel) {
  switch (riskLevel) {
    case 'CRITICAL':
      return '#FF3B5C';
    case 'HIGH':
      return '#FF6B6B';
    case 'MEDIUM':
      return '#FFA94D';
    case 'LOW':
      return '#51CF66';
    default:
      return '#B8BDD0';
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS_THEME.bg,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Permission
  permissionContainer: {
    flex: 1,
    backgroundColor: COLORS_THEME.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  permissionText: {
    color: COLORS_THEME.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  permissionSubtext: {
    color: COLORS_THEME.muted,
    fontSize: 14,
    marginBottom: 30,
    textAlign: 'center',
  },
  permissionBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS_THEME.accent,
    borderRadius: 10,
  },
  permissionBtnText: {
    color: '#000',
    fontWeight: '700',
  },

  // Camera
  camera: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  headerText: {
    color: COLORS_THEME.accent,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  headerTitle: {
    color: COLORS_THEME.text,
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: COLORS_THEME.muted,
    fontSize: 12,
  },

  instructions: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instructionsText: {
    color: COLORS_THEME.accent,
    fontSize: 24,
    fontWeight: '700',
  },
  instructionsSubtext: {
    color: COLORS_THEME.muted,
    fontSize: 12,
    marginTop: 4,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: COLORS_THEME.accent,
  },
  captureBtnInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS_THEME.accent,
  },
  captureLabel: {
    color: COLORS_THEME.text,
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },

  // Results
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS_THEME.borderLit,
  },
  backBtn: {
    color: COLORS_THEME.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  resultsTitle: {
    color: COLORS_THEME.text,
    fontSize: 14,
    fontWeight: '700',
  },

  locationBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS_THEME.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS_THEME.borderLit,
  },
  locationText: {
    color: COLORS_THEME.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  locationConfidence: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  locationWarning: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },

  photoPreview: {
    width: '100%',
    height: 120,
    marginBottom: 12,
  },

  businessList: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  businessCard: {
    flexDirection: 'row',
    backgroundColor: COLORS_THEME.surface,
    borderRadius: 12,
    marginBottom: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: COLORS_THEME.borderLit,
    alignItems: 'flex-start',
    gap: 12,
  },
  businessCardSelected: {
    borderColor: COLORS_THEME.accent,
    backgroundColor: COLORS_THEME.surface2,
  },

  riskBadge: {
    width: 60,
    height: 60,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 11,
  },
  riskScore: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },

  businessInfo: {
    flex: 1,
  },
  businessName: {
    color: COLORS_THEME.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  businessType: {
    color: COLORS_THEME.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  businessAddress: {
    color: COLORS_THEME.muted,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 6,
  },

  badgesRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },

  pestIndicators: {
    color: '#FF6B6B',
    fontSize: 10,
    fontWeight: '600',
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS_THEME.borderLit,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS_THEME.accent,
    borderColor: COLORS_THEME.accent,
  },
  checkmark: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },

  cardWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  cardSelectedBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: COLORS_THEME.accent,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    zIndex: 1,
  },
  rightControls: {
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 2,
  },
  removeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(204,16,64,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  removeBtnText: {
    color: COLORS_THEME.accent2,
    fontSize: 12,
    fontWeight: '800',
  },
  selectionCount: {
    color: COLORS_THEME.chrome,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingBottom: 6,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS_THEME.borderLit,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS_THEME.borderLit,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: COLORS_THEME.muted,
    fontWeight: '700',
  },
  addBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS_THEME.accent,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: COLORS_THEME.muted,
    opacity: 0.5,
  },
  addBtnText: {
    color: '#000',
    fontWeight: '700',
  },

  loadingText: {
    color: COLORS_THEME.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
  },
  loadingSubtext: {
    color: COLORS_THEME.muted,
    fontSize: 14,
    marginTop: 4,
  },
  zipStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS_THEME.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS_THEME.borderLit,
  },
  zipStatusDot: {
    fontSize: 12,
    marginRight: 6,
  },
  zipStatusText: {
    color: COLORS_THEME.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  zipIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  zipIndicatorDot: {
    fontSize: 10,
    marginRight: 4,
  },
  zipIndicatorText: {
    color: COLORS_THEME.muted,
    fontSize: 11,
    fontWeight: '600',
  },
});
