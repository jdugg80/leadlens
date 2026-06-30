/**
 * PhotoIngestScreen
 * Multi-business detection from photo: take photo → detect all businesses → save to queue
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { storageBridge } from '../utils/storage';
import { getCurrentCoords, reverseGeocodeCoords } from '../utils/geoEnrich';
import { normalizeLead } from '../utils/leadHelpers';
import { detectMultipleBusinessesInPhoto, detectBusinessCardsInPhoto } from '../utils/multiBusinessDetection';

export default function PhotoIngestScreen({ navigation }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();

  // Camera states
  const [cameraActive, setCameraActive] = useState(true);
  const [photoData, setPhotoData] = useState(null);
  const [zoom, setZoom] = useState(0);

  const initialDistRef = useRef(null);
  const initialZoomRef = useRef(0);

  // Detection states
  const [extracting, setExtracting] = useState(false);
  const [location, setLocation] = useState(null);

  // Error state
  const [extractionError, setExtractionError] = useState(null);

  // Multi-business detection state
  const [detectionResult, setDetectionResult] = useState(null);
  const [prospectsToConfirm, setProspectsToConfirm] = useState([]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);

  // Scan mode: 'storefronts' | 'cards'
  const [scanMode, setScanMode] = useState('storefronts');

  useEffect(() => {
    getLocation();
  }, []);

  const getLocation = async () => {
    try {
      // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
      const coords = await Promise.race([
        getCurrentCoords(),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
      if (coords) {
        let city = 'Houston';
        let state = 'TX';

        try {
          const geoInfo = await reverseGeocodeCoords(coords);
          if (geoInfo) {
            city = geoInfo.city || geoInfo.town || city;
            state = geoInfo.state || state;
          }
        } catch (e) {
          console.warn('[PhotoIngest] Reverse geocode failed, using defaults:', e.message);
        }

        setLocation({ latitude: coords.latitude, longitude: coords.longitude, city, state });
      }
    } catch (e) {
      console.warn('[PhotoIngest] Location fetch failed:', e.message);
    }
  };

  const handleTouchStart = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches?.length === 2) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      initialDistRef.current = Math.sqrt(dx * dx + dy * dy);
      initialZoomRef.current = zoom;
    } else {
      initialDistRef.current = null;
    }
  };

  const handleTouchMove = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches?.length === 2 && initialDistRef.current !== null) {
      const dx = touches[0].pageX - touches[1].pageX;
      const dy = touches[0].pageY - touches[1].pageY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const diff = currentDist - initialDistRef.current;
      const newZoom = Math.max(0, Math.min(1, initialZoomRef.current + diff * 0.002));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialDistRef.current = null;
  };

  if (!permission) {
    return (
      <View style={s.permissionContainer}>
        <Text style={s.permissionText}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.permissionContainer}>
        <Text style={s.permissionText}>Camera permission denied</Text>
        <Text style={s.permissionSubtext}>Enable in Settings → Apps → LeadLens → Permissions</Text>
        <TouchableOpacity
          style={s.permissionBtn}
          onPress={requestPermission}
        >
          <Text style={s.permissionBtnText}>Request Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // TAKE PHOTO
  // ─────────────────────────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    try {
      if (!cameraRef.current) return;

      console.log('[PhotoIngest] Taking photo...');
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: true,
      });

      // Compress before base64
      console.log('[PhotoIngest] Compressing photo...');
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
      setExtractionError(null);
      handleDetectBusinesses(manipulated.base64);
    } catch (error) {
      console.error('[PhotoIngest] Photo capture error:', error);
      Alert.alert('Photo Error', error.message);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // DETECT — routes to storefront or card detection based on mode
  // ─────────────────────────────────────────────────────────────────────
  const handleDetectBusinesses = async (base64) => {
    if (!base64) {
      setExtractionError('No photo data');
      return;
    }

    setExtracting(true);
    setExtractionError(null);

    try {
      if (scanMode === 'cards') {
        await handleDetectCards(base64);
      } else {
        await handleDetectStorefronts(base64);
      }
    } catch (error) {
      console.error('[PhotoIngest] Detection error:', error);
      setExtractionError(error.message || 'Detection failed. Try a clearer photo.');
    } finally {
      setExtracting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────
  // STOREFRONT DETECTION (original LeadLock flow — unchanged)
  // ─────────────────────────────────────────────────────────────────────
  const handleDetectStorefronts = async (base64) => {
    console.log('[PhotoIngest] Storefront detection...');
    const result = await detectMultipleBusinessesInPhoto(base64, location);

    if (!result.success || !result.businesses || result.businesses.length === 0) {
      setExtractionError(result.error || 'No businesses detected. Try a clearer photo.');
      return;
    }

    setDetectionResult(result);
    const prospects = result.businesses.map((b, idx) => ({
      id: `photo_${Date.now()}_${idx}`,
      scanMode: 'storefronts',
      businessName: b.detection?.name || 'Unknown Business',
      address: b.detection?.address || '',
      businessType: b.detection?.businessType || '',
      confidence: b.detection?.confidence || 0,
      pestIndicators: b.detection?.pestIndicators || [],
      riskScore: b.riskScore || 50,
      riskLevel: b.riskLevel || 'UNKNOWN',
      notes: b.detection?.notes || '',
    }));

    setProspectsToConfirm(prospects);
    setShowConfirmation(true);
  };

  // ─────────────────────────────────────────────────────────────────────
  // BUSINESS CARD DETECTION (table-scan flow)
  // ─────────────────────────────────────────────────────────────────────
  const handleDetectCards = async (base64) => {
    console.log('[PhotoIngest] Business card detection...');
    const result = await detectBusinessCardsInPhoto(base64, location);

    if (!result.success || !result.cards || result.cards.length === 0) {
      setExtractionError(result.error || 'No business cards detected. Try a flatter, well-lit photo.');
      return;
    }

    setDetectionResult(result);
    const prospects = result.cards.map((card, idx) => {
      const candidates = Array.isArray(card.phoneCandidates) ? card.phoneCandidates : [];
      const mobile = candidates.find(c => c.type === 'mobile')?.number || card.mobile || '';
      const mainPhone = card.phone || '';
      const altPhone = card.altPhone || '';
      const bestPhone = mobile || mainPhone || altPhone || (candidates[0]?.number || '');

      return {
        id: `card_${Date.now()}_${idx}`,
        scanMode: 'cards',
        businessName: card.company || card.name || 'Unknown Business',
        contactName: card.name || '',
        title: card.title || '',
        phone: bestPhone,
        mobilePhone: mobile,
        altPhone: altPhone || mainPhone,
        phoneCandidates: candidates,
        email: card.email || '',
        website: card.website || '',
        address: [card.address, card.city, card.state, card.zip].filter(Boolean).join(', '),
        confidence: card.confidence || 0,
        pestIndicators: [],
        riskScore: 50,
        riskLevel: 'UNKNOWN',
        notes: card.cardNotes || '',
      };
    });

    setProspectsToConfirm(prospects);
    setShowConfirmation(true);
  };

  // ─────────────────────────────────────────────────────────────────────
  // BATCH SAVE ALL PROSPECTS TO QUEUE
  // ─────────────────────────────────────────────────────────────────────
  const handleConfirmSave = async () => {
    if (!prospectsToConfirm.length) return;

    try {
      setSaving(true);

      const savedProspects = prospectsToConfirm.map((prospect) =>
        normalizeLead({
          businessName: prospect.businessName,
          contactName: prospect.contactName || '',
          contactTitle: prospect.title || '',
          streetAddress: prospect.address,
          phone: prospect.phone || '',
          email: prospect.email || '',
          website: prospect.website || '',
          businessType: prospect.businessType || '',
          confidence: prospect.confidence,
          status: 'new',
          source: prospect.scanMode === 'cards' ? 'card_scan' : 'photo_ingest',
          capturedAt: new Date().toISOString(),
          latitude: location?.latitude || null,
          longitude: location?.longitude || null,
          pestIndicators: prospect.pestIndicators,
          riskScore: prospect.riskScore,
          riskLevel: prospect.riskLevel,
          rawExtractedText: prospect.notes || '',
        })
      );

      // Read existing queue
      const raw = storageBridge.getSync(LEADS_STORAGE_KEY);
      const currentQueue = raw ? JSON.parse(raw) : [];
      const updatedQueue = [...currentQueue, ...savedProspects];

      // Write to storage
      storageBridge.setSync(LEADS_STORAGE_KEY, JSON.stringify(updatedQueue));

      console.log(`[PhotoIngest] Added ${savedProspects.length} prospects to queue`);
      setShowConfirmation(false);
      setProspectsToConfirm([]);

      Alert.alert('Success', `${savedProspects.length} prospect${savedProspects.length !== 1 ? 's' : ''} added to queue`, [
        { text: 'OK', onPress: () => handleResetCamera() },
      ]);
    } catch (error) {
      console.error('[PhotoIngest] Save error:', error);
      Alert.alert('Error', 'Failed to save: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetCamera = () => {
    setPhotoData(null);
    setExtractionError(null);
    setDetectionResult(null);
    setProspectsToConfirm([]);
    setShowConfirmation(false);
    setSaving(false);
    setZoom(0);
    setCameraActive(true);
  };

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: CAMERA VIEW
  // ─────────────────────────────────────────────────────────────────────
  if (cameraActive) {
    return (
      <View style={s.root}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          zoom={zoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        {/* Header */}
        <View style={[s.header, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={s.headerBackText}>✕</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Photo Ingest</Text>
          <View style={s.headerSpacer} />
        </View>

        {/* Mode toggle */}
        <View style={[s.modeToggleRow, { top: insets.top + 52 }]}>
          <TouchableOpacity
            style={[s.modeBtn, scanMode === 'storefronts' && s.modeBtnActive]}
            onPress={() => setScanMode('storefronts')}
          >
            <Text style={[s.modeBtnText, scanMode === 'storefronts' && s.modeBtnTextActive]}>🏪 Storefronts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeBtn, scanMode === 'cards' && s.modeBtnActive]}
            onPress={() => setScanMode('cards')}
          >
            <Text style={[s.modeBtnText, scanMode === 'cards' && s.modeBtnTextActive]}>📇 Business Cards</Text>
          </TouchableOpacity>
        </View>

        {/* Capture button */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity style={s.captureBtn} onPress={handleTakePhoto}>
            <View style={s.captureBtnInner} />
          </TouchableOpacity>
          <Text style={s.captureHint}>
            {scanMode === 'cards'
              ? 'Lay cards flat, tap to scan all at once'
              : 'Point at storefronts, tap to capture'}
          </Text>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: EXTRACTION IN PROGRESS
  // ─────────────────────────────────────────────────────────────────────
  if (extracting) {
    return (
      <View style={[s.root, s.centerContent]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={s.loadingText}>
          {scanMode === 'cards' ? 'Reading business cards...' : 'Analyzing photo for businesses...'}
        </Text>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: EXTRACTION ERROR
  // ─────────────────────────────────────────────────────────────────────
  if (extractionError) {
    return (
      <View style={[s.root, s.centerContent]}>
        <Image source={{ uri: photoData?.uri }} style={s.previewImage} />
        <View style={[s.card, s.errorCard]}>
          <Text style={s.errorTitle}>Extraction Failed</Text>
          <Text style={s.errorText}>{extractionError}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={handleResetCamera}>
            <Text style={s.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────
  // RENDER: CONFIRMATION MODAL
  // ─────────────────────────────────────────────────────────────────────
  if (photoData && (showConfirmation || prospectsToConfirm.length > 0)) {
    return (
      <View style={s.root}>
        {/* Photo preview at top */}
        <Image source={{ uri: photoData.uri }} style={s.previewThumbnail} />

        {/* Count badge */}
        <View style={s.confidenceBadge}>
          <Text style={s.confidenceText}>
            {prospectsToConfirm.length} business{prospectsToConfirm.length !== 1 ? 'es' : ''} detected
          </Text>
        </View>

        {/* Prospect list */}
        <ScrollView style={s.prospectList} showsVerticalScrollIndicator={false}>
          {prospectsToConfirm.map((prospect, index) => (
            <View key={prospect.id} style={s.prospectCard}>
              <View style={s.prospectHeader}>
                <Text style={s.prospectIndex}>#{index + 1}</Text>
                <View style={[s.riskBadge, { backgroundColor: getRiskColor(prospect.riskLevel) }]}>
                  <Text style={s.riskText}>{prospect.riskLevel}</Text>
                </View>
              </View>
              <Text style={s.prospectName}>{prospect.businessName}</Text>
              {prospect.scanMode === 'cards' ? (
                <>
                  {prospect.contactName ? <Text style={s.prospectContact}>👤 {prospect.contactName}{prospect.title ? ` — ${prospect.title}` : ''}</Text> : null}
                  {prospect.phone ? <Text style={s.prospectDetail}>📞 {prospect.phone}</Text> : null}
                  {prospect.email ? <Text style={s.prospectDetail}>✉️ {prospect.email}</Text> : null}
                  {prospect.website ? <Text style={s.prospectDetail}>🌐 {prospect.website}</Text> : null}
                  {prospect.address ? <Text style={s.prospectAddress}>{prospect.address}</Text> : null}
                </>
              ) : (
                <>
                  {prospect.address ? <Text style={s.prospectAddress}>{prospect.address}</Text> : null}
                  <Text style={s.prospectType}>{prospect.businessType}</Text>
                  {prospect.pestIndicators.length > 0 && (
                    <Text style={s.pestText}>Pest indicators: {prospect.pestIndicators.join(', ')}</Text>
                  )}
                </>
              )}
              <Text style={s.confidenceDetail}>
                Confidence: {(prospect.confidence * 100).toFixed(0)}%
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* Action buttons */}
        <View style={[s.actionBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[s.actionBtn, s.secondaryBtn]}
            onPress={handleResetCamera}
          >
            <Text style={s.secondaryBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.actionBtn, s.primaryBtn, saving && s.btnDisabled]}
            onPress={handleConfirmSave}
            disabled={saving}
          >
            <Text style={s.primaryBtnText}>
              {saving ? 'Saving...' : `Save All (${prospectsToConfirm.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Fallback
  return (
    <View style={[s.root, s.centerContent]}>
      <Text style={s.errorText}>Error: Invalid state</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RISK COLOR HELPER
// ─────────────────────────────────────────────────────────────────────
function getRiskColor(riskLevel) {
  switch (riskLevel) {
    case 'CRITICAL': return '#FF3B5C';
    case 'HIGH': return '#FF6B6B';
    case 'MEDIUM': return '#FFA94D';
    case 'LOW': return '#51CF66';
    default: return '#B8BDD0';
  }
}

// ─────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  centerContent: { justifyContent: 'center', alignItems: 'center' },

  // Camera
  camera: { flex: 1 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(8,10,15,0.85)',
    zIndex: 10,
  },
  headerBackText: { fontSize: 24, color: COLORS.text, fontWeight: '600' },
  headerTitle: { fontSize: 16, color: COLORS.text, fontWeight: '700' },
  headerSpacer: { width: 24 },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 20,
    backgroundColor: 'rgba(8,10,15,0.9)',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,201,255,0.8)',
  },
  captureHint: {
    color: COLORS.textDim,
    fontSize: 12,
    textAlign: 'center',
  },

  // Permission
  permissionContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: { color: COLORS.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  permissionSubtext: { color: COLORS.textDim, fontSize: 12, marginTop: 8, textAlign: 'center' },
  permissionBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
  },
  permissionBtnText: { color: COLORS.bg, fontWeight: '700' },

  // Loading
  loadingText: { color: COLORS.textDim, fontSize: 13, marginTop: 12 },

  // Preview
  previewImage: {
    width: '100%',
    height: 300,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: COLORS.surface2,
  },
  previewThumbnail: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: COLORS.surface2,
  },

  // Cards & errors
  card: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  errorCard: {
    borderColor: 'rgba(204,16,64,0.5)',
    backgroundColor: 'rgba(204,16,64,0.05)',
  },
  errorTitle: { color: COLORS.accent2, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  errorText: { color: COLORS.textDim, fontSize: 12, textAlign: 'center', marginBottom: 16 },

  // Confidence badge
  confidenceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,201,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 16,
  },
  confidenceText: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },

  // Prospect list
  prospectList: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  prospectCard: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  prospectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  prospectIndex: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  riskText: { color: '#000', fontSize: 10, fontWeight: '700' },
  prospectName: { color: COLORS.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  prospectAddress: { color: COLORS.textDim, fontSize: 12, marginBottom: 2 },
  prospectType: { color: COLORS.accent, fontSize: 11, fontWeight: '600', marginBottom: 4 },
  pestText: { color: '#FF6B6B', fontSize: 10, fontWeight: '600', marginBottom: 2 },
  confidenceDetail: { color: COLORS.textDim, fontSize: 10, marginTop: 2 },
  btnDisabled: { opacity: 0.5 },

  // Buttons
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtn: { backgroundColor: COLORS.accent },
  primaryBtnText: { color: COLORS.bg, fontWeight: '700', fontSize: 14 },
  secondaryBtn: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  secondaryBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 14 },

  retryBtn: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryBtnText: { color: COLORS.bg, fontWeight: '700' },

  // Mode toggle
  modeToggleRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(8,10,15,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(184,189,208,0.25)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(0,201,255,0.15)',
    borderColor: COLORS.accent,
  },
  modeBtnText: { color: COLORS.textDim, fontSize: 12, fontWeight: '600' },
  modeBtnTextActive: { color: COLORS.accent },

  // Card contact fields
  prospectContact: { color: COLORS.text, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  prospectDetail: { color: COLORS.textDim, fontSize: 12, marginBottom: 2 },
});
