import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

function safeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export default function TargetMapSummaryBadge({ lead = {} }) {
  if (!lead.target_confirmed) return null;

  const correctionMeters = safeNumber(lead.target_correction_distance_meters);
  const source = lead.confirmed_target_source || 'confirmed_target';

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>Confirmed Target</Text>
      </View>

      <Text style={styles.meta}>
        {`${source === 'map_adjusted_target' ? 'Map adjusted' : 'Confirmed'}${
          correctionMeters !== null ? ` · Correction: ${Math.round(correctionMeters)}m` : ''
        }`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, gap: 4 },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  badgeText: {
    fontSize: 10,
    color: '#22c55e',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '600',
  },
});
