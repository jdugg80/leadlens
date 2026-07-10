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
  Image,
  useWindowDimensions,
  Linking,
  Animated,
  Easing,
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
import { checkGooglePlacesApiHealth } from '../utils/nearbySearch';
import * as ImageManipulator from 'expo-image-manipulator';
import useLeadLockLocationSnapshot from '../hooks/useLeadLockLocationSnapshot';
import resolveZipFromLeadLockPhoto from '../utils/location/resolveZipFromLeadLockPhoto';
import useToast from '../hooks/useToast';
import BetaTracker from '../../utils/betaTracker';

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
  const { showToast } = useToast();
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
  const locationResolveKeyRef = useRef(null);
  const placesApiHealthCheckedRef = useRef(false);

  // ZIP acquisition UX state (LeadLock centered overlay + capture gating)
  const [zipJustAcquired, setZipJustAcquired] = useState(false);
  const [zipTimedOut, setZipTimedOut] = useState(false);
  const zipArcAAnim = useRef(new Animated.Value(0)).current;
  const zipArcBAnim = useRef(new Animated.Value(0)).current;
  const prevHasZipRef = useRef(false);
  const zipRetryTickRef = useRef(0);
  const [zipRetryTick, setZipRetryTick] = useState(0);

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

  // One-time Google Places API health check (logs billing/key status)
  useEffect(() => {
    if (placesApiHealthCheckedRef.current) return;
    placesApiHealthCheckedRef.current = true;
    (async () => {
      try {
        const health = await checkGooglePlacesApiHealth('77002');
        console.log('[LeadLockCamera] Google Places API health:', health);
      } catch (err) {
        console.warn('[LeadLockCamera] Google Places API health check failed:', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!leadLockGps?.latitude || !leadLockGps?.longitude || location?.zip) return;

    const key = `${Number(leadLockGps.latitude).toFixed(4)},${Number(leadLockGps.longitude).toFixed(4)}`;
    if (locationResolveKeyRef.current === key) return;
    locationResolveKeyRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        console.log('[LeadLockCamera] Resolving ZIP from leadLockGps update:', key);
        const geoInfo = await reverseGeocodeCoords({
          latitude: leadLockGps.latitude,
          longitude: leadLockGps.longitude,
        });
        if (cancelled || !mountedRef.current) return;
        if (!geoInfo) {
          locationResolveKeyRef.current = null;
          return;
        }

        const loc = {
          latitude: leadLockGps.latitude,
          longitude: leadLockGps.longitude,
          city: geoInfo.city || geoInfo.town || geoInfo.village || 'Houston',
          county: geoInfo.county || 'Harris',
          zip: geoInfo.postcode || geoInfo.zip || geoInfo.postal_code || null,
        };
        setLocation(loc);
        console.log('[LeadLockCamera] Location resolved from leadLockGps:', {
          zip: loc.zip,
          city: loc.city,
          county: loc.county,
          source: 'leadLockGps',
        });
        if (loc.zip) {
          resolvedZipRef.current = loc.zip;
        } else {
          locationResolveKeyRef.current = null;
        }
        await storageBridge.setItem('currentLocation', JSON.stringify(loc)).catch(() => {});
      } catch (err) {
        console.warn('[LeadLockCamera] leadLockGps ZIP resolve failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [leadLockGps, location?.zip]);

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
        console.log('[LeadLockCamera] initLocation resolved from leadLockGps:', {
          zip: loc.zip,
          city: loc.city,
          county: loc.county,
        });
        if (loc.zip) resolvedZipRef.current = loc.zip;
        await storageBridge.setItem('currentLocation', JSON.stringify(loc)).catch(() => {});
        return;
      }
    }

    // Fallback: try one-shot GPS
    try {
      // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
      const liveCoords = await Promise.race([
        getCurrentCoords(),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
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

  // Dual orbit arcs while ZIP is being acquired
  useEffect(() => {
    if (location?.zip) return;
    zipArcAAnim.setValue(0);
    zipArcBAnim.setValue(0);
    const loopA = Animated.loop(
      Animated.timing(zipArcAAnim, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: false })
    );
    const loopB = Animated.loop(
      Animated.timing(zipArcBAnim, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: false })
    );
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [location?.zip]);

  // Transient "ZIP acquired" confirmation shown once, right after resolution
  useEffect(() => {
    const hasZip = !!location?.zip;
    if (hasZip && !prevHasZipRef.current) {
      setZipJustAcquired(true);
      setZipTimedOut(false);
      const t = setTimeout(() => setZipJustAcquired(false), 1400);
      prevHasZipRef.current = true;
      return () => clearTimeout(t);
    }
    prevHasZipRef.current = hasZip;
  }, [location?.zip]);

  // Timeout fallback if GPS/ZIP resolution stalls (offers manual retry)
  useEffect(() => {
    if (location?.zip) {
      setZipTimedOut(false);
      return;
    }
    const t = setTimeout(() => {
      if (!location?.zip && mountedRef.current) setZipTimedOut(true);
    }, 18000);
    return () => clearTimeout(t);
  }, [location?.zip, zipRetryTick]);

  const handleRetryLocation = () => {
    setZipTimedOut(false);
    zipRetryTickRef.current += 1;
    setZipRetryTick(zipRetryTickRef.current);
    initLocation();
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
      if (!location?.zip) {
        showToast('Still acquiring your location — please wait a moment.', 'error');
        return;
      }

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
      showToast(`Photo Error: ${error.message}`, 'error');
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
        console.log('[LeadLockCamera] First business zip extracted from address:', firstBusinessZip || 'none');
        const resolved = await resolveZipFromLeadLockPhoto({
          liveGps: leadLockGps,
          photoExif: exifData,
          businessAddressZip: firstBusinessZip || null,
          allowDeviceFallback: true,
        });
        console.log('[LeadLockCamera] resolveZipFromLeadLockPhoto result:', resolved);
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
        console.log('[LeadLockCamera] Detection succeeded:', {
          businessCount: formatted.length,
          formattedBusinesses: formatted.map(b => b.name),
        });
        setDetectionResult({
          ...result,
          formatted,
        });
        setSelectedBusinesses(formatted.map(b => ({ ...b, selected: true }))); // Auto-select all
      } else {
        console.warn('[LeadLockCamera] Detection failed:', result.error);
        showToast('No businesses detected. Try a clearer angle with more storefronts visible.', 'error');
      }
    } catch (error) {
      showToast(`Detection Error: ${error.message}`, 'error');
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

    console.log('[LeadLockCamera] handleAddToQueue called. Selected count:', selected.length);
    BetaTracker.track('feature_use', { feature: 'LeadLock', action: 'photo_processed', screen: 'LeadLockCameraScreen' });

    if (selected.length === 0) {
      showToast('Select at least one business to add.', 'error');
      return;
    }

    // Confirm business count > 0 before dismissing
    const detectedCount = detectionResult?.businessCount || detectionResult?.businesses?.length || selected.length;
    if (detectedCount === 0) {
      showToast('No businesses were detected to add to the queue.', 'error');
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

    console.log('[LeadLockCamera] Fallback business zip extracted from selected:', businessZip || 'none');

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

      console.log('[LeadLockCamera] Resolved photo location for queue:', resolved);

      const prospects = convertSelectedBusinessesToProspects(selected, resolved);
      console.log('[LeadLockCamera] Prospects to add:', prospects.length);
      console.log('[LeadLockCamera] First prospect address field:', prospects[0]?.address ?? 'NO_ADDRESS');
      console.log('[LeadLockCamera] First prospect full payload keys:', prospects[0] ? Object.keys(prospects[0]) : 'N/A');

      if (prospects.length === 0) {
        showToast('Could not build any prospect records from the selected businesses.', 'error');
        return;
      }

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

      console.log('[LeadLockCamera] Writing to MMKV. Queue size:', updatedQueue.length, 'Last prospect address:', updatedQueue[updatedQueue.length - 1]?.address ?? 'NO_ADDRESS');

      // Write to MMKV with error guard
      try {
        storageBridge.setSync(LEADS_STORAGE_KEY, JSON.stringify(updatedQueue));
        console.log('[LeadLock] MMKV write succeeded. Queue size:', updatedQueue.length);
      } catch (mmkvErr) {
        console.error('[LeadLock] MMKV write failed:', mmkvErr);
      }

      // AsyncStorage backup (awaited)
      try {
        const RawStorage = require('@react-native-async-storage/async-storage').default;
        await RawStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updatedQueue));
        console.log('[LeadLock] AsyncStorage backup write succeeded. Queue size:', updatedQueue.length);
      } catch (e) {
        console.warn('[LeadLock] AsyncStorage backup write failed:', e);
      }

      // Verify cache read-back
      try {
        const readBack = storageBridge.getSync(LEADS_STORAGE_KEY);
        const readBackParsed = readBack ? JSON.parse(readBack) : [];
        if (!Array.isArray(readBackParsed)) {
          throw new Error('Read-back value is not an array');
        }
        if (readBackParsed.length !== updatedQueue.length) {
          throw new Error(`Read-back length mismatch: expected ${updatedQueue.length}, got ${readBackParsed.length}`);
        }
        const lastReadBack = readBackParsed[readBackParsed.length - 1];
        console.log('[LeadLock] Cache read-back verified. Length:', readBackParsed.length, 'Last address:', lastReadBack?.address ?? 'NO_ADDRESS');
      } catch (verifyErr) {
        console.error('[LeadLock] Cache read-back verification failed:', verifyErr);
        showToast('Save Error: Could not verify the queue was saved. Please try again.', 'error');
        return;
      }

      if (!mountedRef.current) return;
      showToast(`${prospects.length} prospect${prospects.length !== 1 ? 's' : ''} added to queue.`, 'success');
      resetCamera();
    } catch (error) {
      console.error('[LeadLock] Queue save error:', error);
      showToast(`Failed to add to queue: ${error?.message || 'unknown'}`, 'error');
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
        />

        {/* Header — sibling overlay, not a CameraView child (Android camera
            views can misrender complex nested children) */}
        <View style={[s.header, s.headerAbsolute, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.headerText}>←</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>LeadLock Camera</Text>
          <Text style={s.headerSubtitle}>Multi-Business Detection</Text>
          {location?.zip && (
            <View style={s.zipIndicatorRow}>
              <Text style={[s.zipIndicatorDot, { color: '#51CF66' }]}>●</Text>
              <Text style={s.zipIndicatorText}>ZIP {location.zip}</Text>
            </View>
          )}
        </View>

        {/* Centered ZIP acquisition overlay — sibling overlay */}
        {(!location?.zip || zipJustAcquired) && (
          <View style={s.zipOverlayContainer} pointerEvents="box-none">
            <View style={s.zipOverlayCard}>
              {location?.zip ? (
                <>
                  <Text style={s.zipOverlayCheckmark}>✓</Text>
                  <Text style={s.zipOverlayTitle}>Location Confirmed</Text>
                  <Text style={s.zipOverlaySubtitle}>ZIP {location.zip} — ready to capture</Text>
                </>
              ) : (
                <>
                  <View style={s.zipOrbitWrap}>
                    <View style={s.zipOrbitRingOuter} />
                    <View style={s.zipOrbitRingInner} />
                    <Animated.View
                      style={[
                        s.zipOrbitSpinOuter,
                        {
                          transform: [{
                            rotate: zipArcAAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
                          }],
                        },
                      ]}
                    >
                      <View style={s.zipOrbitDotA} />
                    </Animated.View>
                    <Animated.View
                      style={[
                        s.zipOrbitSpinInner,
                        {
                          transform: [{
                            rotate: zipArcBAnim.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }),
                          }],
                        },
                      ]}
                    >
                      <View style={s.zipOrbitDotB} />
                    </Animated.View>
                  </View>
                  <Text style={s.zipOverlayTitle}>Location Acquisition in Progress</Text>
                  <Text style={s.zipOverlaySubtitle}>
                    {zipTimedOut
                      ? 'Taking longer than usual — check GPS signal'
                      : 'Pinpointing your position for accurate prospect data'}
                  </Text>
                  {zipTimedOut && (
                    <TouchableOpacity style={s.zipRetryBtn} onPress={handleRetryLocation}>
                      <Text style={s.zipRetryBtnText}>Retry</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* Capture button — sibling overlay (footer style is already absolute) */}
        <View style={[s.footer, { bottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={[s.captureBtn, !location?.zip && s.captureBtnDisabled]}
            onPress={handleTakePhoto}
            activeOpacity={0.7}
            disabled={!location?.zip}
          >
            <View style={s.captureBtnInner} />
          </TouchableOpacity>
          <Text style={s.captureLabel}>
            {location?.zip ? 'Tap to Capture' : 'Waiting for location...'}
          </Text>
        </View>
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
  headerAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  zipOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  zipOverlayCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(17,19,24,0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS_THEME.accent,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  zipOrbitWrap: {
    width: 56,
    height: 56,
    marginTop: 4,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zipOrbitRingOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: 'rgba(0,201,255,0.25)',
  },
  zipOrbitRingInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(123,63,190,0.3)',
  },
  zipOrbitSpinOuter: {
    position: 'absolute',
    width: 56,
    height: 56,
    alignItems: 'center',
  },
  zipOrbitSpinInner: {
    position: 'absolute',
    width: 34,
    height: 34,
    alignItems: 'center',
  },
  zipOrbitDotA: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS_THEME.accent,
    marginTop: -1,
  },
  zipOrbitDotB: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS_THEME.purple,
    marginTop: -1,
  },
  zipOverlayTitle: {
    color: COLORS_THEME.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  zipOverlaySubtitle: {
    color: COLORS_THEME.muted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  zipOverlayCheckmark: {
    color: '#51CF66',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 6,
  },
  zipRetryBtn: {
    marginTop: 14,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS_THEME.accent,
  },
  zipRetryBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  captureBtnDisabled: {
    opacity: 0.4,
  },
});
