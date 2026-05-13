import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Alert
} from 'react-native';
import { LensSignalRecord } from './lenssignalTypes';
import { COLORS } from '../../constants';
import { getAlertColor, getPestIconType, getPestEmoji, getSignalMarkerColor } from './lenssignalScoring';

interface Props {
  signal: LensSignalRecord;
  onClose: () => void;
  onAddToQueue: (signal: LensSignalRecord) => void;
}

export const LensSignalDetailsCard = ({ signal, onClose, onAddToQueue }: Props) => {
  const alertColor = getAlertColor(signal.alert_level);
  const layer = signal.signal_layer || signal.signal_type || '';
  const isCompliance = layer === 'Compliance Signal';
  const isOpening = layer === 'Opening Signal';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text style={styles.brandLabel}>LensSignal</Text>
          <Text style={[styles.layerLabel, { color: alertColor }]}>
            {layer}: {signal.alert_level || 'Active'}
          </Text>
          <Text style={styles.name}>{signal.establishment_name || signal.business_name}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
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
                  {signal.pest_details.replace('Indicators: ', '')}
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
    bottom: 40,
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
    maxHeight: '50%',
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
