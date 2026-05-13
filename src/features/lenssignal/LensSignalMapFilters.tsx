import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../../constants';

interface FilterConfig {
  key: string;
  label: string;
  emoji?: string;
}

interface Props {
  filters: {
    showLensSignal: boolean;
    filterCompliance: boolean;
    filterOpening: boolean;
    filterPest: boolean;
    filterPriorityReview: boolean;
    filterOpportunity: boolean;
    filterMonitor: boolean;
    filterGoodStanding: boolean;
  };
  onToggle: (key: string) => void;
}

export const LensSignalMapFilters = ({ filters, onToggle }: Props) => {
  const configs: FilterConfig[] = [
    { key: 'showLensSignal', label: 'LensSignal', emoji: '📡' },
    { key: 'filterPest', label: 'Pest', emoji: '🐭' },
    { key: 'filterOpening', label: 'Openings', emoji: '🆕' },
    { key: 'filterPriorityReview', label: 'Priority', emoji: '🔴' },
    { key: 'filterOpportunity', label: 'Opportunity', emoji: '🟠' },
    { key: 'filterMonitor', label: 'Monitor', emoji: '🟡' },
    { key: 'filterGoodStanding', label: 'Good Standing', emoji: '🟢' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {configs.map((config) => {
          const isActive = filters[config.key as keyof typeof filters];
          return (
            <TouchableOpacity
              key={config.key}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onToggle(config.key)}
            >
              <Text style={[styles.text, isActive && styles.textActive]}>
                {config.emoji ? `${config.emoji} ` : ''}{config.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  scroll: { paddingHorizontal: 16 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  chipActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  text: { color: COLORS.textDim, fontSize: 11, fontWeight: '700' },
  textActive: { color: '#000' },
});
