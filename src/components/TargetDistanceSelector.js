
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '../constants';
import { TARGET_DISTANCE_PRESETS, CUSTOM_DISTANCE_KEY, buildTargetDistanceFields, getDefaultDistancePreset, normalizeDistanceMeters } from '../utils/geoTargetDistancePresets';
function getInitialKey(valueKey, valueMeters) {
  if (valueKey) return valueKey;
  const matched = TARGET_DISTANCE_PRESETS.find((preset) => Number(preset.distanceMeters) === Number(valueMeters));
  return matched?.key || getDefaultDistancePreset().key;
}
export default function TargetDistanceSelector({ valueKey, valueMeters, onChange, disabled = false }) {
  const initialKey = getInitialKey(valueKey, valueMeters);
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const [customMeters, setCustomMeters] = useState(valueKey === CUSTOM_DISTANCE_KEY && valueMeters ? String(valueMeters) : '');
  const selectedPreset = useMemo(() => TARGET_DISTANCE_PRESETS.find((preset) => preset.key === selectedKey) || null, [selectedKey]);
  const emitChange = (nextKey, nextMeters) => {
    const preset = TARGET_DISTANCE_PRESETS.find((item) => item.key === nextKey);
    const fields = buildTargetDistanceFields({
      key: nextKey,
      label: preset?.label || (nextKey === CUSTOM_DISTANCE_KEY ? 'Custom' : undefined),
      distanceMeters: nextKey === CUSTOM_DISTANCE_KEY ? normalizeDistanceMeters(nextMeters || customMeters, 125) : preset?.distanceMeters,
    });
    onChange?.(fields);
  };
  const handleSelectPreset = (preset) => { if (disabled) return; setSelectedKey(preset.key); emitChange(preset.key, preset.distanceMeters); };
  const handleSelectCustom = () => { if (disabled) return; setSelectedKey(CUSTOM_DISTANCE_KEY); emitChange(CUSTOM_DISTANCE_KEY, customMeters || 125); };
  const handleCustomChange = (text) => { const cleaned = text.replace(/[^0-9]/g, ''); setCustomMeters(cleaned); if (selectedKey === CUSTOM_DISTANCE_KEY) emitChange(CUSTOM_DISTANCE_KEY, cleaned || 125); };
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Target Distance</Text>
        <Text style={styles.subtitle}>{selectedKey === CUSTOM_DISTANCE_KEY ? `${normalizeDistanceMeters(customMeters || 125)}m custom` : selectedPreset ? `${selectedPreset.label} · ${selectedPreset.distanceMeters}m` : 'Across Lot · 125m'}</Text>
      </View>
      <Text style={styles.helper}>Estimate how far away the storefront/prospect was when captured.</Text>
      <View style={styles.presetGrid}>{TARGET_DISTANCE_PRESETS.map((preset) => { const active = selectedKey === preset.key; return (
        <TouchableOpacity key={preset.key} style={[styles.presetButton, active && styles.presetButtonActive]} onPress={() => handleSelectPreset(preset)} activeOpacity={0.75} disabled={disabled}>
          <Text style={[styles.presetLabel, active && styles.presetLabelActive]}>{preset.shortLabel}</Text>
          <Text style={[styles.presetMeters, active && styles.presetMetersActive]}>{preset.distanceMeters}m</Text>
        </TouchableOpacity>
      ); })}</View>
      <View style={styles.customRow}>
        <TouchableOpacity style={[styles.customButton, selectedKey === CUSTOM_DISTANCE_KEY && styles.customButtonActive]} onPress={handleSelectCustom} activeOpacity={0.75} disabled={disabled}>
          <Text style={[styles.customButtonText, selectedKey === CUSTOM_DISTANCE_KEY && styles.customButtonTextActive]}>Custom</Text>
        </TouchableOpacity>
        <TextInput value={customMeters} onChangeText={handleCustomChange} placeholder="meters" placeholderTextColor={COLORS.muted} keyboardType="numeric" style={styles.customInput} editable={!disabled} onFocus={handleSelectCustom} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  wrap: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: 'rgba(123,63,190,0.28)', borderRadius: 14, padding: 12, marginVertical: 10, gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: COLORS.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },
  subtitle: { color: COLORS.purple || '#a78bfa', fontSize: 11, fontWeight: '800' },
  helper: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  presetButton: { flexGrow: 1, minWidth: 72, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, alignItems: 'center' },
  presetButtonActive: { borderColor: 'rgba(123,63,190,0.75)', backgroundColor: 'rgba(123,63,190,0.18)' },
  presetLabel: { color: COLORS.textDim, fontSize: 11, fontWeight: '800' },
  presetLabelActive: { color: COLORS.text },
  presetMeters: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  presetMetersActive: { color: COLORS.purple || '#a78bfa', fontWeight: '800' },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  customButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2 },
  customButtonActive: { borderColor: 'rgba(0,201,255,0.65)', backgroundColor: 'rgba(0,201,255,0.10)' },
  customButtonText: { color: COLORS.textDim, fontSize: 11, fontWeight: '900' },
  customButtonTextActive: { color: COLORS.accent },
  customInput: { flex: 1, minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface2, color: COLORS.text, paddingHorizontal: 10, fontSize: 12, fontWeight: '700' },
});
