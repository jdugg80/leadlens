import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return value.message || value.error || value.label || JSON.stringify(value);
  }
  return String(value);
}

export default function GeoTargetProjectionBadge({ lead = {} }) {
  const status =
    lead.target_projection_status ||
    lead.targetProjectionStatus ||
    lead.target_projection?.targetProjectionStatus ||
    null;

  const confidence =
    lead.target_projection_confidence ??
    lead.targetProjectionConfidence ??
    lead.target_projection?.targetProjectionConfidence ??
    null;

  const distance =
    lead.target_distance_meters ??
    lead.targetDistanceMeters ??
    lead.target_projection?.targetDistanceMeters ??
    null;

  if (!status && confidence === null && distance === null) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>
          {`Target Est.: ${safeText(status, 'Projected')}`}
        </Text>
      </View>

      <Text style={styles.meta}>
        {`${distance !== null ? `Distance: ${Math.round(Number(distance))}m` : 'Distance: —'}${
          confidence !== null ? ` · Confidence: ${Math.round(Number(confidence))}%` : ''
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
    backgroundColor: 'rgba(123,63,190,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(123,63,190,0.35)',
  },
  badgeText: {
    fontSize: 10,
    color: COLORS.purple || '#a78bfa',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '600',
  },
});
