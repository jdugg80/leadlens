import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const OWNERSHIP_FILTERS = [
  { key: 'all',           label: 'All',           icon: '\uD83C\uDFD8\uFE0F', color: '#B8BDD0' },
  { key: 'new_owner',     label: 'New Owner',     icon: '\uD83D\uDD11', color: '#00C9FF' },
  { key: 'current_owner', label: 'Current Owner', icon: '\uD83C\uDFE0', color: '#7B3FBE' },
  { key: 'rental',        label: 'Rental',        icon: '\uD83D\uDCCB', color: '#CC1040'  },
];

const LOOKBACK_FILTERS = [
  { key: '30d',  label: '30 Days'  },
  { key: '60d',  label: '60 Days'  },
  { key: '90d',  label: '90 Days'  },
  { key: '120d', label: '120 Days' },
];

export default function HomeownerFilterPanel({
  ownershipFilter,
  setOwnershipFilter,
  lookbackWindow,
  setLookbackWindow,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {OWNERSHIP_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, ownershipFilter === f.key && { borderColor: f.color, backgroundColor: f.color + '22' }]}
            onPress={() => setOwnershipFilter(f.key)}
          >
            <Text style={styles.chipIcon}>{f.icon}</Text>
            <Text style={[styles.chipLabel, ownershipFilter === f.key && { color: f.color }]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Lookback:</Text>
        {LOOKBACK_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.lookbackChip, lookbackWindow === f.key && styles.lookbackChipActive]}
            onPress={() => setLookbackWindow(f.key)}
          >
            <Text style={[styles.lookbackLabel, lookbackWindow === f.key && styles.lookbackLabelActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 8, paddingBottom: 8, gap: 8 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  filterLabel: { color: '#B8BDD0', fontSize: 12, marginRight: 4 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#1E2530',
    backgroundColor: '#0D1117',
  },
  chipIcon: { fontSize: 12 },
  chipLabel: { color: '#B8BDD0', fontSize: 12, fontWeight: '600' },
  lookbackChip: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: '#1E2530',
    backgroundColor: '#0D1117',
  },
  lookbackChipActive: { borderColor: '#00C9FF', backgroundColor: '#00C9FF22' },
  lookbackLabel: { color: '#B8BDD0', fontSize: 12 },
  lookbackLabelActive: { color: '#00C9FF', fontWeight: '600' },
});
