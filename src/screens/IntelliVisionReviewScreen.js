import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader, Card, SectionLabel, PrimaryButton, SecondaryButton } from '../components/UI';
import { normalizeLead, inferVertical } from '../utils/leadHelpers';
import { runLeadLockOcrPipeline } from '../utils/leadLockOcrPipeline';
import { resolveLeadLockBusiness } from '../utils/leadLockResolver';
import { showThemedAlert } from '../components/ThemedAlert';
import { LeadLockSupabaseService } from '../services/leadLockSupabaseService';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { TARGET_LENS_PROFILES_KEY } from '../constants';
import { getTargetLensProfileById } from '../config/targetLensProfiles';
import BetaTracker from '../../utils/betaTracker';

function mergeNonEmpty(...items) {
  const merged = {};
  for (const item of items) {
    Object.entries(item || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        merged[key] = value;
      }
    });
  }
  return merged;
}

function confidenceColor(level) {
  if (level === 'high') return '#00E5A0';
  if (level === 'medium') return '#FFC800';
  return '#FF6B2B';
}

export default function IntelliVisionReviewScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('IntelliVisionReviewScreen');
  }, []);

  const {
    user = {},
    lead: initialLead = {},
    allLeads = null,
    coords = null,
    heading = null,
    imageUri = '',
    photoUri = '',
    zoomLevel = {},
    targetBox = null,
    leadLockTarget = null,
  } = route?.params || {};

  const [analyzing, setAnalyzing] = useState(true);
  const [geoResult, setGeoResult] = useState(null);
  const [ocrResult, setOcrResult] = useState(null);
  const [lead, setLead] = useState({ ...EMPTY_LEAD, ...initialLead });
  const [alternates, setAlternates] = useState([]);
  const [showAlternates, setShowAlternates] = useState(false);
  const [candidateLeads, setCandidateLeads] = useState(allLeads || [initialLead]);
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);

  useEffect(() => {
    analyze();
  }, [selectedCandidateIdx]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const sourceImageUri = imageUri || photoUri;
      const currentInitialLead = candidateLeads[selectedCandidateIdx] || initialLead;

      if (!sourceImageUri) {
        throw new Error('No LeadLock image was provided for review.');
      }

      // 0. Load Active TargetLens Profile
      const profileVal = await AsyncStorage.getItem(TARGET_LENS_PROFILES_KEY);
      let activeProfile = null;
      if (profileVal) {
        try {
          const saved = JSON.parse(profileVal);
          activeProfile = getTargetLensProfileById(saved.id);
        } catch {}
      }

      // 1. Run Local OCR Pipeline + Upload to Supabase (Phase 1)
      const ocr = await runLeadLockOcrPipeline({
        imageUri: sourceImageUri,
        targetBox: currentInitialLead.boundingBox || targetBox,
        locationContext: { location: coords, heading, zoomLevel },
        activeProfile // Pass profile for detection intelligence
      });
      setOcrResult(ocr);

      // 2. Fetch Server-Side Matches if capture created (Phase 2)
      if (ocr.captureId) {
        LeadLockSupabaseService.processCapture(ocr.captureId).then(res => {
          if (res?.ok && res.matches?.length) {
            setAlternates(prev => {
              const existingIds = new Set(prev.map(m => m.id || m.match_id));
              const newMatches = res.matches.filter(m => !existingIds.has(m.match_id));
              return [...prev, ...newMatches.map(m => ({
                ...m,
                id: m.match_id,
                businessName: m.name,
                _matchSource: 'supabase_brain',
                _matchConfidence: m.total_score >= 0.85 ? 'high' : m.total_score >= 0.65 ? 'medium' : 'low'
              }))];
            });
          }
        }).catch(err => console.log('[LeadLockSupabase] Match fetch failed:', err));
      }

      const mergedLead = mergeNonEmpty(EMPTY_LEAD, ocr.mergedLead, currentInitialLead, {
        captureMethod: 'geotarget',
        ocrSummary: ocr.ocrSummary,
        ocrSource: ocr.ocrSource,
        ocrConfidence: ocr.ocrConfidence?.level || 'unknown',
        ocrConfidenceScore: ocr.ocrConfidence?.score || 0,
        ocrBusinessNameCandidates: ocr.businessNameCandidates || [],
        ocrAddressCandidates: ocr.addressCandidates || [],
        targetBoxUsed: !!(currentInitialLead.boundingBox || targetBox),
      });

      const targetCoords = leadLockTarget?.target || coords;
      const searchRadiusFeet = leadLockTarget?.zoomConfig?.searchRadiusFeet || zoomLevel?.searchRadiusFeet || 120;
      const minimumConfidence = leadLockTarget?.zoomConfig?.minimumConfidence || zoomLevel?.minimumConfidence || 70;

      let result;
      try {
        result = await resolveLeadLockBusiness({
          businessName: mergedLead.businessName,
          ocrText: ocr.bestText || ocr.ocrSummary,
          ocrBusinessNameCandidates: ocr.businessNameCandidates || [],
          ocrConfidenceScore: ocr.ocrConfidence?.score || 0,
          ocrSource: ocr.ocrSource,
          targetCoords,
          userCoords: coords,
          searchRadiusFeet,
          minimumConfidence,
          targetBox: currentInitialLead.boundingBox || targetBox,
        });
      } catch (resolverError) {
    BetaTracker.crash('IntelliVisionReviewScreen', resolverError);
        console.log('[LeadLock Resolver Error]', resolverError?.message || String(resolverError));
        result = {
          bestMatch: null,
          nearbyMatches: [],
          reverseGeo: null,
          confidence: {
            score: 0,
            level: 'low',
            label: 'Review Needed',
            color: '#FF6B2B',
            factors: ['Resolver unavailable'],
          },
          debug: { error: resolverError?.message || String(resolverError) },
        };
      }

      setGeoResult(result);
      setAlternates(result.nearbyMatches || []);

      const shouldAutoApply = result.bestMatch && result.confidence?.score >= minimumConfidence;

      if (shouldAutoApply) {
        setLead(prev => mergeNonEmpty(prev, mergedLead, {
          businessName: result.bestMatch.businessName || mergedLead.businessName,
          streetNumber: result.bestMatch.streetNumber,
          streetName: result.bestMatch.streetName,
          addressLine2: result.bestMatch.addressLine2,
          city: result.bestMatch.city,
          state: result.bestMatch.state,
          zip: result.bestMatch.zip,
          latitude: result.bestMatch.latitude,
          longitude: result.bestMatch.longitude,
          locationConfidence: result.confidence?.level || 'medium',
          locationSource: 'leadlock-projected-poi',
          locationNeedsReview: false,
        }));
      } else if (result.bestMatch) {
        setLead(prev => mergeNonEmpty(prev, mergedLead, {
          businessName: mergedLead.businessName || result.bestMatch.businessName,
          latitude: result.bestMatch.latitude,
          longitude: result.bestMatch.longitude,
          locationConfidence: result.confidence?.level || 'low',
          locationSource: 'leadlock-possible-match',
          locationNeedsReview: true,
        }));
        setShowAlternates(true);
      } else if (result.reverseGeo) {
        setLead(prev => mergeNonEmpty(prev, mergedLead, {
          city: result.reverseGeo.city,
          state: result.reverseGeo.state,
          zip: result.reverseGeo.zip,
          locationSource: 'reverse-geocode-projected-target',
          locationConfidence: 'medium',
          locationNeedsReview: true,
        }));
      } else {
        setLead(prev => mergeNonEmpty(prev, mergedLead, {
          locationSource: 'leadlock-ocr-only',
          locationConfidence: mergedLead.businessName ? 'low' : 'unknown',
          locationNeedsReview: true,
        }));
      }
    } catch (err) {
    BetaTracker.crash('IntelliVisionReviewScreen', err);
      console.log('[LeadLock Review Error]', err);
      showThemedAlert('LeadLock error', err.message || 'Could not analyze LeadLock capture.');
    } finally {
      setAnalyzing(false);
    }
  };

  const switchCandidate = (idx) => {
    setSelectedCandidateIdx(idx);
  };

  const confirmAndProceed = () => {
    // Phase 4: Feedback
    if (ocrResult?.captureId) {
      LeadLockSupabaseService.saveFeedback({
        captureId: ocrResult.captureId,
        action: 'confirmed',
        matchedId: lead.id || lead.placeId,
        notes: 'User confirmed location match'
      });
    }

    const normalized = normalizeLead({
      ...lead,
      imageUri: imageUri || lead.imageUri,
      captureMethod: 'geotarget',
      propertyType: 'Commercial',
      reviewed: false,
      ...inferVertical(lead),
    });
    navigation.replace('Review', { user, lead: normalized, editIdx: null });
  };

  const selectAlternate = (alt) => {
    // Phase 4: Feedback
    if (ocrResult?.captureId) {
      LeadLockSupabaseService.saveFeedback({
        captureId: ocrResult.captureId,
        action: 'confirmed',
        matchedId: alt.id || alt.match_id || alt.placeId,
        notes: 'User selected alternate match'
      });
    }

    setLead(prev => mergeNonEmpty(prev, {
      businessName: alt.businessName || alt.name || prev.businessName,
      streetNumber: alt.streetNumber,
      streetName: alt.streetName,
      addressLine2: alt.addressLine2,
      city: alt.city,
      state: alt.state,
      zip: alt.zip,
      latitude: alt.latitude,
      longitude: alt.longitude,
      locationSource: alt._matchSource === 'supabase_brain' ? 'supabase-brain-match' : 'user-selected-leadlock-match',
      locationConfidence: alt._matchConfidence || 'medium',
      locationNeedsReview: false,
    }));
    setShowAlternates(false);
  };

  const editManually = () => {
    // Phase 4: Feedback
    if (ocrResult?.captureId) {
      LeadLockSupabaseService.saveFeedback({
        captureId: ocrResult.captureId,
        action: 'manual_new',
        notes: 'User chose manual edit'
      });
    }

    const normalized = normalizeLead({
      ...lead,
      imageUri: imageUri || lead.imageUri,
      captureMethod: 'geotarget',
      propertyType: 'Commercial',
      reviewed: false,
    });
    navigation.replace('Review', { user, lead: normalized, editIdx: null });
  };

  const retakePhoto = () => {
    navigation.goBack();
  };

  const confidence = geoResult?.confidence;
  const hasLocation = !!(lead.latitude && lead.longitude);
  const ocrConfidence = ocrResult?.ocrConfidence;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="LeadLock™" onBack={() => navigation.goBack()} />

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Image preview */}
        {!!imageUri && (
          <View style={s.imageWrap}>
            <Image source={{ uri: imageUri }} style={s.image} resizeMode="cover" />
          </View>
        )}

        {/* Analyzing indicator */}
        {analyzing && (
          <Card style={s.analyzingCard}>
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={s.analyzingText}>Running enhanced OCR and LeadLock matching...</Text>
          </Card>
        )}

        {/* Multi-business candidate selector */}
        {candidateLeads.length > 1 && !analyzing && (
          <>
            <SectionLabel>Multi-Business Detected</SectionLabel>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.candidateScroller} contentContainerStyle={s.candidateRow}>
              {candidateLeads.map((c, i) => (
                <TouchableOpacity
                  key={i}
                  style={[s.candidateChip, selectedCandidateIdx === i && s.candidateChipActive]}
                  onPress={() => switchCandidate(i)}
                >
                  <Text style={[s.candidateText, selectedCandidateIdx === i && s.candidateTextActive]}>
                    {c.businessName || `Candidate ${i + 1}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* OCR score */}
        {!analyzing && !!ocrConfidence && (
          <Card style={[s.ocrCard, { borderColor: confidenceColor(ocrConfidence.level) }]}>
            <View style={s.ocrHeader}>
              <Text style={[s.ocrScore, { color: confidenceColor(ocrConfidence.level) }]}>{ocrConfidence.score}%</Text>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.ocrTitle}>OCR {ocrConfidence.level?.toUpperCase?.() || 'UNKNOWN'}</Text>
                <Text style={s.ocrSub}>
                  Source: {(ocrResult?.ocrSource || 'unknown').replace(/-/g, ' ')}
                  {ocrConfidence.factors?.length ? ` · ${ocrConfidence.factors.join(' · ')}` : ''}
                </Text>
              </View>
            </View>
            {ocrResult?.warnings?.map((warning, idx) => (
              <Text key={idx} style={s.ocrWarning}>⚠ {warning}</Text>
            ))}
          </Card>
        )}

        {/* Confidence score */}
        {!analyzing && !!confidence && (
          <Card style={[s.confidenceCard, { borderColor: confidence.color }]}> 
            <View style={s.confidenceHeader}>
              <Text style={[s.confidenceScore, { color: confidence.color }]}> 
                {confidence.score}%
              </Text>
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[s.confidenceLabel, { color: confidence.color }]}> 
                  {confidence.label}
                </Text>
                <Text style={s.confidenceSub}>
                  {confidence.factors.join(' · ')}
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Detected business */}
        <SectionLabel>Detected Business</SectionLabel>
        <Card>
          <Text style={s.bizName}>{lead.businessName || 'Unknown Business'}</Text>
          {!!(lead.streetNumber || lead.streetName) && (
            <Text style={s.bizAddress}>
              {[lead.streetNumber, lead.streetName, lead.city, lead.state, lead.zip]
                .filter(Boolean).join(' ')}
            </Text>
          )}
          {!!lead.addressLine2 && (
            <Text style={s.bizAddress}>{lead.addressLine2}</Text>
          )}
          {!!lead.locationSource && (
            <Text style={s.locationSource}>
              Source: {lead.locationSource.replace(/-/g, ' ')} ·{' '}
              {lead.locationConfidence || 'medium'} confidence
            </Text>
          )}
          {!!lead.ocrSource && (
            <Text style={s.locationSource}>
              OCR: {String(lead.ocrSource).replace(/-/g, ' ')} · {lead.ocrConfidenceScore || 0}%
            </Text>
          )}
          {!!coords && (
            <Text style={s.locationSource}>
              Captured {coords.latitude?.toFixed(5)}, {coords.longitude?.toFixed(5)}
            </Text>
          )}
          {!!leadLockTarget?.target && (
            <Text style={s.locationSource}>
              Projected target {leadLockTarget.target.latitude?.toFixed(5)}, {leadLockTarget.target.longitude?.toFixed(5)} · {leadLockTarget.zoomConfig?.label || 'LeadLock offset'}
            </Text>
          )}
          {!!lead.locationNeedsReview && (
            <Text style={s.reviewWarning}>Review suggested match before confirming.</Text>
          )}
        </Card>

        {/* OCR candidates */}
        {!analyzing && !!ocrResult && (ocrResult.businessNameCandidates?.length > 0 || ocrResult.addressCandidates?.length > 0) && (
          <>
            <SectionLabel>OCR Clues</SectionLabel>
            <Card>
              {ocrResult.businessNameCandidates?.slice(0, 4).map((name, idx) => (
                <Text key={`biz-${idx}`} style={s.ocrClue}>Business clue: {name}</Text>
              ))}
              {ocrResult.addressCandidates?.slice(0, 4).map((address, idx) => (
                <Text key={`addr-${idx}`} style={s.ocrClue}>Address clue: {address}</Text>
              ))}
            </Card>
          </>
        )}

        {/* Mini map */}
        {hasLocation && !analyzing && (
          <>
            <SectionLabel>Suggested Location</SectionLabel>
            <View style={s.mapWrap}>
              <MapView
                style={s.miniMap}
                provider={PROVIDER_GOOGLE}
                region={{
                  latitude: lead.latitude,
                  longitude: lead.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: lead.latitude, longitude: lead.longitude }}
                  title={lead.businessName}
                  description={[lead.streetNumber, lead.streetName].filter(Boolean).join(' ')}
                />
                {!!coords && (
                  <Marker
                    coordinate={coords}
                    title="Your location"
                    pinColor="blue"
                  />
                )}
                {!!leadLockTarget?.target && (
                  <Marker
                    coordinate={leadLockTarget.target}
                    title="Projected LeadLock target"
                    pinColor="orange"
                  />
                )}
              </MapView>
              {!!geoResult?.bestMatch?._distanceMeters && (
                <View style={s.distanceBadge}>
                  <Text style={s.distanceText}>
                    ~{Math.round(geoResult.bestMatch._distanceMeters)}m away
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Alternate matches */}
        {alternates.length > 0 && (
          <>
            <TouchableOpacity
              style={s.alternatesToggle}
              onPress={() => setShowAlternates(!showAlternates)}
            >
              <Text style={s.alternatesToggleText}>
                {showAlternates ? '▲ Hide' : '▼ Show'} {alternates.length} alternate match{alternates.length !== 1 ? 'es' : ''}
              </Text>
            </TouchableOpacity>

            {showAlternates && alternates.map((alt, idx) => (
              <TouchableOpacity
                key={idx}
                style={s.altRow}
                onPress={() => selectAlternate(alt)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.altName} numberOfLines={1}>{alt.businessName || alt.name || alt.displayName}</Text>
                  <Text style={s.altAddress}>
                    {[alt.streetNumber, alt.streetName, alt.addressLine2, alt.city, alt.state, alt.zip].filter(Boolean).join(' ')}
                  </Text>
                  {!!alt.reasons?.length && (
                    <Text style={s.altReason}>{alt.reasons.slice(0, 2).join(' · ')}</Text>
                  )}
                </View>
                <Text style={s.altSelect}>{alt.score ? `${alt.score}%` : 'Select'} →</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Actions */}
        <SectionLabel>Actions</SectionLabel>
        <PrimaryButton
          title="✓ Confirm Location"
          onPress={confirmAndProceed}
          disabled={analyzing}
          style={{ marginBottom: 10 }}
        />
        <SecondaryButton
          title="✎ Edit Manually"
          onPress={editManually}
          style={{ marginBottom: 10 }}
        />
        <SecondaryButton
          title="↩ Retake Photo"
          onPress={retakePhoto}
          style={{ marginBottom: 10 }}
        />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  imageWrap: {
    marginTop: 16, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.borderLit, height: 180,
  },
  image: { width: '100%', height: '100%' },

  analyzingCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  analyzingText: { color: COLORS.muted, fontSize: 13 },

  ocrCard: { marginTop: 16, borderWidth: 2 },
  ocrHeader: { flexDirection: 'row', alignItems: 'center' },
  ocrScore: { fontSize: 32, fontWeight: '900' },
  ocrTitle: { color: COLORS.text, fontSize: 14, fontWeight: '900' },
  ocrSub: { color: COLORS.muted, fontSize: 11, marginTop: 3, lineHeight: 16 },
  ocrWarning: { color: '#FFC800', fontSize: 11, marginTop: 8, fontWeight: '700' },
  ocrClue: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginBottom: 6 },

  confidenceCard: { marginTop: 16, borderWidth: 2 },
  confidenceHeader: { flexDirection: 'row', alignItems: 'center' },
  confidenceScore: { fontSize: 40, fontWeight: '900' },
  confidenceLabel: { fontSize: 16, fontWeight: '800' },
  confidenceSub: { color: COLORS.muted, fontSize: 11, marginTop: 3, lineHeight: 16 },

  bizName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  bizAddress: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  locationSource: { color: COLORS.muted, fontSize: 11, marginTop: 6 },
  reviewWarning: { color: '#FFC800', fontSize: 12, fontWeight: '800', marginTop: 8 },

  mapWrap: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1,
    borderColor: COLORS.borderLit, height: 200, position: 'relative',
  },
  miniMap: { width: '100%', height: '100%' },
  distanceBadge: {
    position: 'absolute', bottom: 10, right: 10,
    backgroundColor: COLORS.surface, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.border,
  },
  distanceText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },

  alternatesToggle: { paddingVertical: 12, alignItems: 'center' },
  alternatesToggleText: { color: COLORS.accent, fontSize: 13, fontWeight: '600' },
  altRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center',
    marginBottom: 8,
  },
  altName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  altAddress: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  altReason: { color: COLORS.muted, fontSize: 10, marginTop: 4 },
  altSelect: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },

  candidateScroller: { marginTop: 4, marginBottom: 12 },
  candidateRow: { gap: 8, paddingBottom: 4 },
  candidateChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  candidateChipActive: {
    borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.1)',
  },
  candidateText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  candidateTextActive: { color: COLORS.accent },
});