import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LensSignal } from './lenssignalTypes';
import { COLORS } from '../../constants';
import { getAlertColor } from './lenssignalScoring';

interface Props {
  signal: LensSignal;
  onClose: () => void;
  onCapture: (signal: LensSignal) => void;
}

export const LensSignalDetailsCard = ({ signal, onClose, onCapture }: Props) => {
  const alertColor = getAlertColor(signal.alert_level);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.name}>{signal.establishment_name}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.address}>{signal.address}, {signal.city}</Text>

      <View style={styles.content}>
        {signal.signal_layer === 'Compliance Signal' && (
          <View style={styles.row}>
            <Text style={styles.label}>Compliance:</Text>
            <Text style={[styles.value, { color: alertColor }]}>
              {signal.score} {signal.grade ? `(${signal.grade})` : ''} - {signal.source_name}
            </Text>
          </View>
        )}

        {signal.signal_layer === 'Opening Signal' && (
          <View style={styles.row}>
            <Text style={styles.label}>Opening:</Text>
            <Text style={styles.value}>{signal.permit_type} - {signal.opening_status}</Text>
          </View>
        )}

        {signal.pest_indicator && (
          <View style={styles.pestBox}>
            <Text style={styles.pestText}>🪳 PEST INDICATOR: {signal.violation_text || 'Detected in record.'}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.btn} onPress={() => onCapture(signal)}>
        <Text style={styles.btnText}>Capture Signal Lead</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    position: 'absolute', left: 16, right: 16, bottom: 100,
    backgroundColor: 'rgba(19,22,30,0.97)', borderRadius: 14,
    borderWidth: 1.5, borderColor: COLORS.accent, padding: 16,
    zIndex: 100,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1 },
  close: { color: COLORS.muted, fontSize: 18, marginLeft: 8 },
  address: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  content: { marginTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  label: { color: COLORS.textDim, fontSize: 13, fontWeight: '700', width: 100 },
  value: { color: COLORS.text, fontSize: 13, fontWeight: '600', flex: 1 },
  pestBox: {
    backgroundColor: 'rgba(120, 53, 15, 0.2)', padding: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#78350f', marginTop: 8,
  },
  pestText: { color: '#fbbf24', fontSize: 12, fontWeight: '700' },
  btn: {
    backgroundColor: COLORS.accent, borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', marginTop: 16,
  },
  btnText: { color: '#000', fontWeight: '800', fontSize: 14 },
});
