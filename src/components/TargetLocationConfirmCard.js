import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS } from '../constants';
import { getProjectedTargetPoint, getCapturePoint } from '../utils/geoTargetConfirmation';

function formatCoordinate(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '—';
  return numberValue.toFixed(6);
}

export default function TargetLocationConfirmCard({
  lead = {},
  onConfirmProjection,
  onConfirmCapturePoint,
  onClear,
  onOpenMap,
}) {
  const projectedPoint = getProjectedTargetPoint(lead);
  const capturePoint = getCapturePoint(lead);

  const isConfirmed = !!lead.target_confirmed;
  const confirmedLat = lead.confirmed_target_latitude;
  const confirmedLon = lead.confirmed_target_longitude;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Confirm Target Location</Text>
          <Text style={styles.sub}>
            Lock the estimated target point after reviewing the projection.
          </Text>
        </View>

        <View style={[styles.statusPill, isConfirmed && styles.statusPillConfirmed]}>
          <Text style={[styles.statusText, isConfirmed && styles.statusTextConfirmed]}>
            {isConfirmed ? 'Confirmed' : 'Unconfirmed'}
          </Text>
        </View>
      </View>

      <View style={styles.coordBox}>
        <Text style={styles.coordLabel}>Projected target</Text>
        <Text style={styles.coordText}>
          {projectedPoint
            ? `${formatCoordinate(projectedPoint.latitude)}, ${formatCoordinate(projectedPoint.longitude)}`
            : 'No projected target available'}
        </Text>
      </View>

      {isConfirmed && (
        <View style={styles.coordBoxConfirmed}>
          <Text style={styles.coordLabel}>Confirmed target</Text>
          <Text style={styles.coordText}>
            {`${formatCoordinate(confirmedLat)}, ${formatCoordinate(confirmedLon)}`}
          </Text>
          {!!lead.target_correction_distance_meters && (
            <Text style={styles.metaText}>
              Correction: {Math.round(Number(lead.target_correction_distance_meters))}m from projection
            </Text>
          )}
        </View>
      )}

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, !projectedPoint && styles.buttonDisabled]}
          onPress={onConfirmProjection}
          disabled={!projectedPoint}
          activeOpacity={0.78}
        >
          <Text style={styles.buttonText}>Confirm Projection</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.buttonSecondary, !capturePoint && styles.buttonDisabled]}
          onPress={onConfirmCapturePoint}
          disabled={!capturePoint}
          activeOpacity={0.78}
        >
          <Text style={styles.buttonSecondaryText}>Use Capture Point</Text>
        </TouchableOpacity>
      </View>

      {!!onOpenMap && (
        <TouchableOpacity style={styles.mapButton} onPress={onOpenMap} activeOpacity={0.78}>
          <Text style={styles.mapButtonText}>Open Map Adjuster</Text>
        </TouchableOpacity>
      )}

      {isConfirmed && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear} activeOpacity={0.78}>
          <Text style={styles.clearText}>Clear Confirmation</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.25)',
    borderRadius: 14,
    padding: 12,
    marginVertical: 10,
    gap: 10,
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
  sub: {
    color: COLORS.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
  },
  statusPillConfirmed: {
    borderColor: 'rgba(0,201,255,0.55)',
    backgroundColor: 'rgba(0,201,255,0.10)',
  },
  statusText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '900',
  },
  statusTextConfirmed: {
    color: COLORS.accent,
  },
  coordBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    padding: 9,
  },
  coordBoxConfirmed: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.35)',
    backgroundColor: 'rgba(0,201,255,0.07)',
    padding: 9,
  },
  coordLabel: {
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 3,
  },
  coordText: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '800',
  },
  metaText: {
    color: COLORS.muted,
    fontSize: 10,
    marginTop: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  buttonText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
  buttonSecondary: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface2,
  },
  buttonSecondaryText: {
    color: COLORS.text,
    fontSize: 11,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  mapButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(123,63,190,0.45)',
    backgroundColor: 'rgba(123,63,190,0.10)',
  },
  mapButtonText: {
    color: COLORS.purple || '#a78bfa',
    fontSize: 11,
    fontWeight: '900',
  },
  clearButton: {
    alignItems: 'center',
    paddingVertical: 5,
  },
  clearText: {
    color: COLORS.muted,
    fontSize: 11,
    fontWeight: '700',
  },
});
