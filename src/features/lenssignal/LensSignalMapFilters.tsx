import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS } from '../../constants';

interface Props {
  activeLayer: string | null;
  onLayerChange: (layer: string | null) => void;
}

export const LensSignalMapFilters = ({ activeLayer, onLayerChange }: Props) => {
  const layers = [
    { id: null, label: 'All Signals' },
    { id: 'Compliance Signal', label: 'Compliance' },
    { id: 'Opening Signal', label: 'Openings' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {layers.map((layer) => (
          <TouchableOpacity
            key={layer.label}
            style={[styles.chip, activeLayer === layer.id && styles.chipActive]}
            onPress={() => onLayerChange(layer.id)}
          >
            <Text style={[styles.text, activeLayer === layer.id && styles.textActive]}>
              {layer.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 8 },
  scroll: { paddingHorizontal: 16 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    marginRight: 8,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  text: { color: COLORS.textDim, fontSize: 12, fontWeight: '600' },
  textActive: { color: '#000' },
});
