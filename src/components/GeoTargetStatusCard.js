import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function getStatusColor(level) {
  switch (level) {
    case 'excellent':
      return '#21d07a';
    case 'good':
      return '#36a3ff';
    case 'fair':
      return '#f5c542';
    case 'poor':
      return '#ff7a45';
    case 'blocked':
      return '#ff4d6d';
    default:
      return '#888';
  }
}

export default function GeoTargetStatusCard({ geoTarget, compact = false }) {
  const bestFix = geoTarget?.bestFix;
  const status = geoTarget?.status;
  const color = getStatusColor(status?.level);

  const accuracyText = bestFix?.accuracyMeters == null
    ? 'Unknown'
    : `${Math.round(bestFix.accuracyMeters)}m`;

  const confidenceText = bestFix?.confidence == null
    ? 'Unknown'
    : `${bestFix.confidence}%`;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={styles.title}>GeoTarget Assist</Text>
      </View>

      <Text style={styles.status}>{status?.label || 'Not Captured'}</Text>

      {!compact && (
        <>
          <Text style={styles.line}>Accuracy: {accuracyText}</Text>
          <Text style={styles.line}>Confidence: {confidenceText}</Text>
          <Text style={styles.line}>Source: {bestFix?.source || 'Unknown'}</Text>
          {!!status?.message && <Text style={styles.message}>{status.message}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#10131a',
    borderColor: '#252b38',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginVertical: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  status: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  line: {
    color: '#d6d9e0',
    fontSize: 13,
    marginTop: 2,
  },
  message: {
    color: '#aeb5c4',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
});
