import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { COLORS } from '../constants';

const BUSINESS_TYPES = [
  'All Businesses',
  'Food / Hospitality',
  'Retail / Consumer',
  'Industrial / Logistics',
  'Office / Professional',
  'Public / Facilities',
];

const LEAD_STATUSES = [
  'All',
  'New',
  'Suspect',
  'Contacted',
  'In Progress',
  'Not Interested',
  'Closed',
];

const MATCH_STRENGTHS = [
  'Show All',
  'Strong Matches',
  'High Opportunity',
  'Needs Review',
];

export default function LeadFiltersBottomSheet({
  visible,
  onClose,
  filters,
  onApply,
  onReset,
}) {
  const [localFilters, setLocalFilters] = React.useState(filters);

  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const toggleSignal = (key) => {
    setLocalFilters((prev) => {
      const next = {
        ...prev,
        signals: {
          ...prev.signals,
          [key]: !prev.signals[key],
        },
      };
      try { onApply && onApply(next); } catch (e) {}
      return next;
    });
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <View style={s.sheet}>
              <View style={s.header}>
                <Text style={s.title}>Lead Filters</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={s.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
                {/* ── Signals Only Mode ────────────────────────────── */}
                <TouchableOpacity
                  style={[s.signalsOnlyRow, localFilters.signalsOnly && s.signalsOnlyRowActive]}
                  onPress={() => setLocalFilters(prev => ({ ...prev, signalsOnly: !prev.signalsOnly }))}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.signalsOnlyLabel, localFilters.signalsOnly && s.signalsOnlyLabelActive]}>
                      🎯 Signals Only
                    </Text>
                    <Text style={s.signalsOnlySub}>
                      Show only businesses with active signals
                    </Text>
                  </View>
                  <View style={[s.signalsOnlyPill, localFilters.signalsOnly && s.signalsOnlyPillActive]}>
                    <Text style={[s.signalsOnlyPillText, localFilters.signalsOnly && s.signalsOnlyPillTextActive]}>
                      {localFilters.signalsOnly ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <Text style={s.sectionTitle}>Business Type</Text>
                <View style={s.chipRow}>
                  {BUSINESS_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[s.chip, localFilters.businessType === type && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, businessType: type })}
                    >
                      <Text style={[s.chipText, localFilters.businessType === type && s.chipTextActive]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.sectionTitle}>Lead Status</Text>
                <View style={s.chipRow}>
                  {LEAD_STATUSES.map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[s.chip, localFilters.leadStatus === status && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, leadStatus: status })}
                    >
                      <Text style={[s.chipText, localFilters.leadStatus === status && s.chipTextActive]}>
                        {status}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.sectionTitle}>Signals</Text>
                <View style={s.chipRow}>
                  {[
                    { key: 'lensSignal', label: 'LensSignal' },
                    { key: 'contactSignal', label: 'Contact Signal' },
                    { key: 'pest', label: 'Pest Indicator' },
                    { key: 'opening', label: 'Opening Signal' },
                    { key: 'priority', label: 'Priority' },
                  ].map((sig) => (
                    <TouchableOpacity
                      key={sig.key}
                      style={[s.chip, localFilters.signals[sig.key] && s.chipActive]}
                      onPress={() => toggleSignal(sig.key)}
                    >
                      <Text style={[s.chipText, localFilters.signals[sig.key] && s.chipTextActive]}>
                        {sig.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.sectionTitle}>Match Strength</Text>
                <View style={s.chipRow}>
                  {MATCH_STRENGTHS.map((strength) => (
                    <TouchableOpacity
                      key={strength}
                      style={[s.chip, localFilters.matchStrength === strength && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, matchStrength: strength })}
                    >
                      <Text style={[s.chipText, localFilters.matchStrength === strength && s.chipTextActive]}>
                        {strength}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={{ height: 30 }} />
              </ScrollView>

              <View style={s.footer}>
                <TouchableOpacity style={s.resetBtn} onPress={handleReset}>
                  <Text style={s.resetBtnText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
                  <Text style={s.applyBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 34, // Safe area for home indicator
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  closeText: {
    fontSize: 20,
    color: COLORS.muted,
  },
  scroll: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.label,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  chipText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.accent,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  resetBtnText: {
    color: COLORS.textDim,
    fontWeight: '700',
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  signalsOnlyRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 14,
    padding: 14, marginTop: 16, marginBottom: 4,
  },
  signalsOnlyRowActive: {
    backgroundColor: 'rgba(0,201,255,0.08)',
    borderColor: COLORS.accent,
  },
  signalsOnlyLabel: {
    color: COLORS.textDim, fontWeight: '700', fontSize: 14,
  },
  signalsOnlyLabelActive: { color: COLORS.accent },
  signalsOnlySub: {
    color: COLORS.muted, fontSize: 11, marginTop: 2,
  },
  signalsOnlyPill: {
    backgroundColor: COLORS.border, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  signalsOnlyPillActive: { backgroundColor: COLORS.accent },
  signalsOnlyPillText: {
    color: COLORS.muted, fontWeight: '800', fontSize: 11,
  },
  signalsOnlyPillTextActive: { color: '#000' },
  applyBtnText: {
    color: '#000',
    fontWeight: '800',
  },
});
