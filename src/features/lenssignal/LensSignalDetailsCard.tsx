import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LensSignalRecord } from './lenssignalTypes';
import { COLORS } from '../../constants';
import { screenHeight } from '../../utils/responsive';
import { getAlertColor, getPestIconType, getPestEmoji } from './lenssignalScoring';
import { buildEnrichmentBundle } from '../../utils/enrichmentNormalizer';
import { formatPestSignal } from '../../utils/pestUtils';

interface Props {
  signal: LensSignalRecord;
  onClose: () => void;
  onAddToQueue: (signal: LensSignalRecord) => void;
}

export const LensSignalDetailsCard = ({ signal, onClose, onAddToQueue }: Props) => {
  const insets = useSafeAreaInsets();
  const alertColor = getAlertColor(signal.alert_level);
  const layer = signal.signal_layer || signal.signal_type || (signal as any).opening_type || 'Standard Discovery';

  // Dynamic compatibility checks for both lenssignal_records and lens_signals schemas
  const isOpening = layer === 'Opening Signal' || !!(signal as any).opening_type || !!(signal as any).is_new_opening;
  const isCompliance = layer === 'Compliance Signal' || !!(signal as any).compliance_findings || !!(signal as any).compliance_source || !!signal.pest_details || !!signal.pest_indicator;
  
  // ── SIGNAL TYPE DISPLAY WITH PEST ICONS (#PEST-01)
  let signalTypeDisplay = '';
  if (isCompliance) {
    // Use pest-specific icon for compliance signals
    const pestDetails = (signal as any).pest_details || (signal as any).compliance_findings || '';
    const pestSignal = formatPestSignal(pestDetails, signal.compliance_level || (signal as any).compliance_level);
    signalTypeDisplay = pestSignal.display;
  } else if (isOpening) {
    signalTypeDisplay = `🎉 New Opening`;
  } else {
    signalTypeDisplay = `📍 Lead Discovery`;
  }

  const enrichmentBundle = buildEnrichmentBundle(
    signal,
    (signal as any).business,
    (signal as any).prospect,
    (signal as any).placeDetails,
    (signal as any).googlePlace,
    (signal as any).publicRecord,
    (signal as any).comptrollerRecord,
    (signal as any).texasComptroller,
    (signal as any).enrichment
  );

  const displayPhone =
    enrichmentBundle.primaryPhone ||
    (signal as any).phone ||
    (signal as any).business?.phone ||
    (signal as any).prospect?.phone ||
    "";

  const phoneSource = enrichmentBundle.phoneCandidates?.find(p => p.phone === displayPhone)?.source || "";

  const displayContacts = enrichmentBundle.contacts || [];

  return (
    <View style={[styles.card, { bottom: insets.bottom + 16, maxHeight: screenHeight * 0.55 }]}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={styles.brandLabel}>LensSignal</Text>
          <Text style={[styles.layerLabel, { color: alertColor }]}>
            {signalTypeDisplay} • {signal.alert_level || 'Active'}
          </Text>
          <Text style={styles.name}>{signal.establishment_name || signal.business_name}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
        {/* Phone Section */}
        <View style={styles.section}>
          {!!(signal as any).loading ? (
            <View style={{ paddingVertical: 10, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={COLORS.accent} />
              <Text style={{ color: COLORS.accent, fontSize: 12, marginTop: 6 }}>Checking public/open records...</Text>
            </View>
          ) : (
            <>
              <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Phone:</Text>
              {displayPhone ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ color: COLORS.accent, fontSize: 15, fontWeight: '700' }}>📞 {displayPhone}</Text>
                  {!!phoneSource && <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 2 }}>Source: {phoneSource}</Text>}
                </View>
              ) : (
                <Text style={{ color: COLORS.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>No phone found yet</Text>
              )}

              <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Possible POCs:</Text>
              {displayContacts.length > 0 ? (
                <>
                  {displayContacts.slice(0, 2).map((c, i) => (
                    <View key={i} style={{ marginBottom: 8, padding: 8, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                      <Text style={{ color: COLORS.text, fontSize: 14, fontWeight: '600' }}>
                        👤 {c.name} {c.title ? `— ${c.title}` : ''}
                      </Text>
                      {!!c.email && (
                        <Text style={{ color: COLORS.accent, fontSize: 12, marginTop: 4 }}>✉️ {c.email}</Text>
                      )}
                      {!!c.phone && (
                        <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>📞 {c.phone}</Text>
                      )}
                      {!!c.source && (
                        <Text style={{ color: COLORS.muted, fontSize: 11, marginTop: 4 }}>Source: {c.source}</Text>
                      )}
                    </View>
                  ))}
                  {displayContacts.length > 2 && (
                    <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '600', marginTop: 2, marginBottom: 10 }}>+{displayContacts.length - 2} more possible contacts</Text>
                  )}
                </>
              ) : (
                <Text style={{ color: COLORS.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 10 }}>No possible POC found yet.</Text>
              )}

              {/* Email Candidates Section */}
              {enrichmentBundle.emailCandidates?.length > 0 && (
                <View style={{ marginTop: 4, marginBottom: 12 }}>
                  <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase' }}>Email Candidates:</Text>
                  {enrichmentBundle.emailCandidates.slice(0, 3).map((email, i) => (
                    <Text key={i} style={{ color: COLORS.accent, fontSize: 13, marginBottom: 3 }}>✉️ {email}</Text>
                  ))}
                </View>
              )}

            </>
          )}
        </View>

        {isCompliance && (
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Score:</Text>
              <Text style={styles.infoValue}>{signal.score ?? 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Grade:</Text>
              <Text style={styles.infoValue}>{signal.grade ?? 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pest Indicator:</Text>
              <Text style={[styles.infoValue, signal.pest_indicator ? styles.dangerValue : null]}>
                {signal.pest_indicator
                  ? `${getPestEmoji(getPestIconType(signal))} Detected`
                  : 'Not Detected'}
              </Text>
            </View>
            {!!signal.pest_details && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Indicators:</Text>
                <Text style={[styles.infoValue, { flex: 1, textAlign: 'right', fontSize: 11 }]}>
                  {String(signal.pest_details).replace('Indicators: ', '')}
                </Text>
              </View>
            )}
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Inspection Source:</Text>
              <Text style={styles.infoValue}>{signal.source_name || 'Unknown'}</Text>
            </View>
          </View>
        )}

        {isOpening && (
          <View style={styles.section}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status:</Text>
              <Text style={styles.infoValue}>{signal.opening_status ?? 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Source:</Text>
              <Text style={styles.infoValue}>{signal.source_name || 'Unknown'}</Text>
            </View>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Data Source:</Text>
          <Text style={styles.infoValue}>
            {signal.source_name || (signal as any).source || 'Public Record / Registry'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Distance:</Text>
          <Text style={styles.infoValue}>
            {typeof signal.distance_miles === 'number' && isFinite(signal.distance_miles)
              ? signal.distance_miles.toFixed(2)
              : '0.00'} miles
          </Text>
        </View>

        {!!signal.address && (
          <Text style={styles.addressText}>{"\uD83D\uDCCD"} {signal.address}, {signal.city}</Text>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => onAddToQueue(signal)}
        >
          <Text style={styles.primaryBtnText}>Add to Queue</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtnFull} onPress={onClose}>
          <Text style={styles.secondaryBtnText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleArea: {
    flex: 1,
  },
  brandLabel: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  layerLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  name: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  closeText: {
    color: COLORS.muted,
    fontSize: 20,
    fontWeight: '600',
  },
  scrollArea: {
    marginVertical: 10,
  },
  section: {
    marginBottom: 5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  infoLabel: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
  },
  dangerValue: {
    color: '#ef4444',
  },
  addressText: {
    color: COLORS.textDim,
    fontSize: 12,
    marginTop: 12,
    fontStyle: 'italic',
  },
  actions: {
    marginTop: 10,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtnFull: {
    backgroundColor: COLORS.surface2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
});
