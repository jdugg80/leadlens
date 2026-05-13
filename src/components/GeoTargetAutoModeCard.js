import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

function safeText(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function safeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export default function GeoTargetAutoModeCard({
  lead = {},
  advancedVisible = false,
  onToggleAdvanced,
}) {
  const label =
    lead.target_confidence_label ||
    lead.target_projection_status ||
    'Auto Estimate';

  const distance = safeNumber(lead.target_distance_meters);
  const confidence = safeNumber(lead.target_projection_confidence);
  const reviewRecommended = !!lead.target_review_recommended;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>GeoTarget Auto Mode</Text>
          <Text style={styles.subtitle}>
            {`${safeText(label)}${distance !== null ? ` · ${Math.round(distance)}m` : ''}${
              confidence !== null ? ` · ${Math.round(confidence)}%` : ''
            }`}
          </Text>
        </View>

        <View style={[styles.pill, reviewRecommended && styles.pillWarn]}>
          <Text style={[styles.pillText, reviewRecommended && styles.pillTextWarn]}>
            {reviewRecommended ? 'Review' : 'Auto'}
          </Text>
        </View>
      </View>

      {!!lead.target_auto_reason && (
        <Text style={styles.reason}>{safeText(lead.target_auto_reason).replace(/_/g, ' ')}</Text>
      )}

      {reviewRecommended && (
        <Text style={styles.warnText}>
          Location confidence is low. Advanced review is available if needed.
        </Text>
      )}

      {!!onToggleAdvanced && (
        <TouchableOpacity style={styles.advancedButton} onPress={onToggleAdvanced} activeOpacity={0.8}>
          <Text style={styles.advancedText}>
            {advancedVisible ? 'Hide Advanced GeoTarget Controls' : 'Advanced GeoTarget Controls'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.26)',
    borderRadius: 14,
    padding: 12,
    marginVertical: 10,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.25,
  },
  subtitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  reason: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    textTransform: 'capitalize',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.4)',
    backgroundColor: 'rgba(0,201,255,0.08)',
  },
  pillWarn: {
    borderColor: 'rgba(255,204,0,0.45)',
    backgroundColor: 'rgba(255,204,0,0.08)',
  },
  pillText: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
  },
  pillTextWarn: {
    color: '#ffcc00',
  },
  warnText: {
    color: '#ffcc00',
    fontSize: 11,
    lineHeight: 16,
  },
  advancedButton: {
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(123,63,190,0.35)',
    backgroundColor: 'rgba(123,63,190,0.08)',
    paddingVertical: 9,
    alignItems: 'center',
  },
  advancedText: {
    color: COLORS.purple || '#a78bfa',
    fontSize: 11,
    fontWeight: '900',
  },
});
