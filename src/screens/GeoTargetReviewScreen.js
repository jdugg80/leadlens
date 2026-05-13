import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Image, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader, Card, SectionLabel, PrimaryButton, SecondaryButton } from '../components/UI';
import { runGeoTargetAssist, geocodeBusinessNearby } from '../utils/geoEnrich';
import { normalizeLead, inferVertical } from '../utils/leadHelpers';
import { showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';

export default function GeoTargetReviewScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('GeoTargetReviewScreen');
  }, []);

  const { user, lead: initialLead, coords, heading, imageUri } = route.params;

  const [analyzing, setAnalyzing] = useState(true);
  const [geoResult, setGeoResult] = useState(null);
  const [lead, setLead] = useState({ ...EMPTY_LEAD, ...initialLead });
  const [alternates, setAlternates] = useState([]);
  const [showAlternates, setShowAlternates] = useState(false);

  useEffect(() => {
    analyze();
  }, []);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const result = await runGeoTargetAssist({
        businessName: initialLead.businessName,
        coords,
        heading,
      });
      setGeoResult(result);

      // Apply best match to lead
      if (result.bestMatch) {
        setLead(prev => ({
          ...prev,
          streetNumber: result.bestMatch.streetNumber || prev.streetNumber,
          streetName: result.bestMatch.streetName || prev.streetName,
          city: result.bestMatch.city || prev.city,
          state: result.bestMatch.state || prev.state,
          zip: result.bestMatch.zip || prev.zip,
          latitude: result.bestMatch.latitude,
          longitude: result.bestMatch.longitude,
          locationConfidence: result.confidence?.level || 'medium',
          locationSource: 'geotarget-assist',
        }));
      } else if (result.reverseGeo) {
        setLead(prev => ({
          ...prev,
          city: prev.city || result.reverseGeo.city,
          state: result.reverseGeo.state || prev.state,
          zip: prev.zip || result.reverseGeo.zip,
          locationSource: 'reverse-geocode',
          locationConfidence: 'medium',
        }));
      }

      // Fetch alternates if business name exists
      if (initialLead.businessName && coords) {
        try {
          const altUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(initialLead.businessName)}&format=jsonv2&addressdetails=1&limit=5&lat=${coords.latitude}&lon=${coords.longitude}`;
          const resp = await fetch(altUrl, { headers: { 'User-Agent': 'LeadLens/2.0' } });
          if (resp.ok) {
            const data = await resp.json();
            setAlternates(data.slice(0, 4).map(item => ({
              displayName: item.display_name,
              streetNumber: item.address?.house_number || '',
              streetName: item.address?.road || '',
              city: item.address?.city || item.address?.town || item.address?.village || '',
              state: item.address?.state || '',
              zip: item.address?.postcode || '',
              latitude: Number(item.lat),
              longitude: Number(item.lon),
            })));
          }
        } catch {}
      }
    } catch (err) {
    BetaTracker.crash('GeoTargetReviewScreen', err);
      showThemedAlert('GeoTarget error', err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const confirmAndProceed = () => {
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
    setLead(prev => ({
      ...prev,
      streetNumber: alt.streetNumber,
      streetName: alt.streetName,
      city: alt.city,
      state: alt.state,
      zip: alt.zip,
      latitude: alt.latitude,
      longitude: alt.longitude,
      locationSource: 'user-selected-alternate',
      locationConfidence: 'medium',
    }));
    setShowAlternates(false);
  };

  const editManually = () => {
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

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="GeoTarget Assist" onBack={() => navigation.goBack()} />

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
            <Text style={s.analyzingText}>Analyzing location data...</Text>
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
          {!!lead.locationSource && (
            <Text style={s.locationSource}>
              Source: {lead.locationSource.replace(/-/g, ' ')} ·{' '}
              {lead.locationConfidence || 'medium'} confidence
            </Text>
          )}
          {!!coords && (
            <Text style={s.locationSource}>
              Captured {coords.latitude?.toFixed(5)}, {coords.longitude?.toFixed(5)}
            </Text>
          )}
        </Card>

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
                  <Text style={s.altName} numberOfLines={1}>{alt.displayName}</Text>
                  <Text style={s.altAddress}>
                    {[alt.streetNumber, alt.streetName, alt.city, alt.state].filter(Boolean).join(' ')}
                  </Text>
                </View>
                <Text style={s.altSelect}>Select →</Text>
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

  confidenceCard: { marginTop: 16, borderWidth: 2 },
  confidenceHeader: { flexDirection: 'row', alignItems: 'center' },
  confidenceScore: { fontSize: 40, fontWeight: '900' },
  confidenceLabel: { fontSize: 16, fontWeight: '800' },
  confidenceSub: { color: COLORS.muted, fontSize: 11, marginTop: 3, lineHeight: 16 },

  bizName: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  bizAddress: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },
  locationSource: { color: COLORS.muted, fontSize: 11, marginTop: 6 },

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
  altSelect: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
});