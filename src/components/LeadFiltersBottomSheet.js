import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { COLORS } from '../constants';
import HomeownerFilterPanel from './HomeownerFilterPanel';

// Trimmed filter sheet. Business mode keeps only filters that actually act on
// something on the map: Status (saved leads), Business Type, Search Radius,
// Signals, and Contact info. The removed controls (Last Activity, New Since Last
// Scan, Min Rating, Match Strength, Signals Only, and the second "Prospect
// Status" / Lead Source / Service Type) either had nothing to act on or compared
// against fields the data doesn't have. Every control now edits a local draft and
// applies only when "Apply Filters" is tapped -- previously some chips applied
// instantly (and dragged unrelated pending edits along with them).

const BUSINESS_TYPES = [
  'All Businesses',
  'Food / Hospitality',
  'Retail / Consumer',
  'Industrial / Logistics',
  'Office / Professional',
  'Public / Facilities',
  'Multi-Family / Residential-Adjacent',
  'Institutional',
  'Other',
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

const RADIUS_PRESETS = [
  { value: 0.5, label: '0.5 mi' },
  { value: 1, label: '1 mi' },
  { value: 3, label: '3 mi' },
  { value: 5, label: '5 mi' },
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
];

const HOME_VALUE_PRESETS = [
  { value: 0, label: 'Any' },
  { value: 200000, label: '$200K+' },
  { value: 400000, label: '$400K+' },
  { value: 750000, label: '$750K+' },
  { value: 1000000, label: '$1M+' },
  { value: 2000000, label: '$2M+' },
];

const HOME_VALUE_MAX_PRESETS = [
  { value: 10000000, label: 'Any' },
  { value: 500000, label: '$500K' },
  { value: 1000000, label: '$1M' },
  { value: 2000000, label: '$2M' },
  { value: 5000000, label: '$5M' },
];

const SQFT_PRESETS = [
  { value: 0, label: 'Any' },
  { value: 1000, label: '1K+' },
  { value: 1500, label: '1.5K+' },
  { value: 2500, label: '2.5K+' },
  { value: 3500, label: '3.5K+' },
  { value: 5000, label: '5K+' },
];

const SQFT_MAX_PRESETS = [
  { value: 10000, label: 'Any' },
  { value: 2000, label: '2K' },
  { value: 3500, label: '3.5K' },
  { value: 5000, label: '5K' },
  { value: 7500, label: '7.5K' },
];

const OCCUPANCY_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'owner_occupied', label: 'Owner-Occupied' },
  { key: 'rental', label: 'Rental' },
];

const RESIDENTIAL_PROPERTY_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'single_family', label: 'Single-Family' },
  { key: 'multi_family', label: 'Multi-Family (2-4)' },
  { key: 'condo_townhouse', label: 'Condo/Townhouse' },
  { key: 'mobile_home', label: 'Mobile/Manufactured' },
  { key: 'new_construction', label: 'New Construction' },
];

const SIGNAL_TYPES = [
  { key: 'lensSignal', label: 'LensSignal' },
  { key: 'contactSignal', label: 'Contact Signal' },
  { key: 'pest', label: 'Pest Indicator' },
  { key: 'opening', label: 'Opening Signal' },
  { key: 'priority', label: 'Priority' },
];

const CONTACT_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'enriched', label: 'Enriched' },
  { key: 'has_phone', label: 'Has Phone' },
];

function isActive(arr, key) {
  if (!Array.isArray(arr)) return false;
  return arr.includes(key);
}

// occupancy / property-type lists use lowercase 'all'
function toggleMulti(arr, key) {
  if (!Array.isArray(arr)) return [key];
  if (key === 'all') return ['all'];
  const cleaned = arr.filter(k => k !== 'all');
  if (cleaned.includes(key)) {
    const next = cleaned.filter(k => k !== key);
    return next.length ? next : ['all'];
  }
  return [...cleaned, key];
}

// Status chips use capitalized 'All'. The shared toggleMulti above only knew
// lowercase 'all', so picking a status left 'All' selected (filter never
// activated) and tapping 'All' wrote ['all'], which matches nothing and hid
// every saved lead.
function toggleStatusList(arr, key) {
  if (key === 'All') return ['All'];
  const cleaned = (Array.isArray(arr) ? arr : []).filter(k => k !== 'All');
  if (cleaned.includes(key)) {
    const next = cleaned.filter(k => k !== key);
    return next.length ? next : ['All'];
  }
  return [...cleaned, key];
}

export default function LeadFiltersBottomSheet({
  visible,
  onClose,
  filters,
  onApply,
  onReset,
}) {
  const [localFilters, setLocalFilters] = React.useState(filters);
  const slideAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [visible, slideAnim]);

  const patch = (partial) => setLocalFilters(prev => ({ ...prev, ...partial }));
  const setMode = (mode) => patch({ targetLensMode: mode });
  const toggleSignal = (key) =>
    setLocalFilters(prev => ({ ...prev, signals: { ...prev.signals, [key]: !prev.signals?.[key] } }));
  const toggleStatus = (status) =>
    setLocalFilters(prev => ({ ...prev, statuses: toggleStatusList(prev.statuses, status) }));
  const toggleOccupancy = (type) =>
    setLocalFilters(prev => ({ ...prev, occupancyTypes: toggleMulti(prev.occupancyTypes || ['all'], type) }));
  const toggleResidentialType = (type) =>
    setLocalFilters(prev => ({ ...prev, residentialPropertyTypes: toggleMulti(prev.residentialPropertyTypes || ['all'], type) }));

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  const mode = localFilters?.targetLensMode || 'business';
  const isBusiness = mode === 'business';

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
            <Animated.View
              pointerEvents="box-none"
              style={[
                s.sheet,
                {
                  bottom: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-300, 0],
                  }),
                  opacity: slideAnim,
                },
              ]}
            >
              <View style={s.header}>
                <Text style={s.title}>Prospect filters</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={s.closeText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={s.scroll}
                contentContainerStyle={s.scrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {/* ── Residential / Commercial Toggle ───────────────── */}
                <Text style={s.sectionTitle}>Prospect Type</Text>
                <View style={s.toggleRow}>
                  <TouchableOpacity
                    style={[s.toggleTab, isBusiness && s.toggleTabActive]}
                    onPress={() => setMode('business')}
                  >
                    <Text style={[s.toggleTabText, isBusiness && s.toggleTabTextActive]}>
                      🏢 Commercial
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.toggleTab, !isBusiness && s.toggleTabActive]}
                    onPress={() => setMode('homeowner')}
                  >
                    <Text style={[s.toggleTabText, !isBusiness && s.toggleTabTextActive]}>
                      🏠 Residential
                    </Text>
                  </TouchableOpacity>
                </View>

                {isBusiness && (
                  <>
                    <Text style={s.sectionTitle}>Status</Text>
                    <Text style={s.hintText}>Applies to your saved leads.</Text>
                    <View style={s.chipRow}>
                      {LEAD_STATUSES.map((status) => (
                        <TouchableOpacity
                          key={status}
                          style={[s.chip, isActive(localFilters.statuses, status) && s.chipActive]}
                          onPress={() => toggleStatus(status)}
                        >
                          <Text style={[s.chipText, isActive(localFilters.statuses, status) && s.chipTextActive]}>
                            {status}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.sectionTitle}>Business Type</Text>
                    <View style={s.chipRow}>
                      {BUSINESS_TYPES.map((type) => (
                        <TouchableOpacity
                          key={type}
                          style={[s.chip, localFilters.businessType === type && s.chipActive]}
                          onPress={() => patch({ businessType: type })}
                        >
                          <Text style={[s.chipText, localFilters.businessType === type && s.chipTextActive]}>
                            {type}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.sectionTitle}>Search Radius</Text>
                    <Text style={s.hintText}>How far Nearby Search looks. It doesn't hide your saved leads.</Text>
                    <View style={s.chipRow}>
                      {RADIUS_PRESETS.map((preset) => (
                        <TouchableOpacity
                          key={preset.value}
                          style={[s.chip, localFilters.radiusMiles === preset.value && s.chipActive]}
                          onPress={() => patch({ radiusMiles: preset.value })}
                        >
                          <Text style={[s.chipText, localFilters.radiusMiles === preset.value && s.chipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.sectionTitle}>Signals</Text>
                    <Text style={s.hintText}>All ticked shows everything. Untick a type to show only businesses that have one of the remaining signals.</Text>
                    <View style={s.chipRow}>
                      {SIGNAL_TYPES.map((sig) => (
                        <TouchableOpacity
                          key={sig.key}
                          style={[s.chip, localFilters.signals?.[sig.key] && s.chipActive]}
                          onPress={() => toggleSignal(sig.key)}
                        >
                          <Text style={[s.chipText, localFilters.signals?.[sig.key] && s.chipTextActive]}>
                            {sig.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.sectionTitle}>Contact Info</Text>
                    <Text style={s.hintText}>Applies to your saved leads. Search results don't carry phone or website until you open one.</Text>
                    <View style={s.chipRow}>
                      {CONTACT_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[s.chip, localFilters.contactCompleteness === opt.key && s.chipActive]}
                          onPress={() => patch({ contactCompleteness: opt.key })}
                        >
                          <Text style={[s.chipText, localFilters.contactCompleteness === opt.key && s.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Residential-only filters */}
                {!isBusiness && (
                  <>
                    <Text style={s.sectionTitle}>Home Value Range</Text>
                    <View style={s.rowBetween}>
                      <View style={s.chipRow}>
                        {HOME_VALUE_PRESETS.map((preset) => (
                          <TouchableOpacity
                            key={preset.value}
                            style={[s.smallChip, localFilters.minHomeValue === preset.value && s.chipActive]}
                            onPress={() => setLocalFilters({ ...localFilters, minHomeValue: preset.value })}
                          >
                            <Text style={[s.smallChipText, localFilters.minHomeValue === preset.value && s.chipTextActive]}>
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={s.rangeSeparator}>–</Text>
                      <View style={s.chipRow}>
                        {HOME_VALUE_MAX_PRESETS.map((preset) => (
                          <TouchableOpacity
                            key={preset.value}
                            style={[s.smallChip, localFilters.maxHomeValue === preset.value && s.chipActive]}
                            onPress={() => setLocalFilters({ ...localFilters, maxHomeValue: preset.value })}
                          >
                            <Text style={[s.smallChipText, localFilters.maxHomeValue === preset.value && s.chipTextActive]}>
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <Text style={s.sectionTitle}>Square Footage Range</Text>
                    <View style={s.rowBetween}>
                      <View style={s.chipRow}>
                        {SQFT_PRESETS.map((preset) => (
                          <TouchableOpacity
                            key={preset.value}
                            style={[s.smallChip, localFilters.minSqFt === preset.value && s.chipActive]}
                            onPress={() => setLocalFilters({ ...localFilters, minSqFt: preset.value })}
                          >
                            <Text style={[s.smallChipText, localFilters.minSqFt === preset.value && s.chipTextActive]}>
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <Text style={s.rangeSeparator}>–</Text>
                      <View style={s.chipRow}>
                        {SQFT_MAX_PRESETS.map((preset) => (
                          <TouchableOpacity
                            key={preset.value}
                            style={[s.smallChip, localFilters.maxSqFt === preset.value && s.chipActive]}
                            onPress={() => setLocalFilters({ ...localFilters, maxSqFt: preset.value })}
                          >
                            <Text style={[s.smallChipText, localFilters.maxSqFt === preset.value && s.chipTextActive]}>
                              {preset.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <Text style={s.sectionTitle}>Occupancy Type</Text>
                    <View style={s.chipRow}>
                      {OCCUPANCY_TYPES.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[s.chip, isActive(localFilters.occupancyTypes, opt.key) && s.chipActive]}
                          onPress={() => toggleOccupancy(opt.key)}
                        >
                          <Text style={[s.chipText, isActive(localFilters.occupancyTypes, opt.key) && s.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.sectionTitle}>Residential Property Type</Text>
                    <View style={s.chipRow}>
                      {RESIDENTIAL_PROPERTY_TYPES.map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          style={[s.chip, isActive(localFilters.residentialPropertyTypes, opt.key) && s.chipActive]}
                          onPress={() => toggleResidentialType(opt.key)}
                        >
                          <Text style={[s.chipText, isActive(localFilters.residentialPropertyTypes, opt.key) && s.chipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Legacy quick filters: ownership + lookback */}
                    <HomeownerFilterPanel
                      ownershipFilter={localFilters.homeownerFilter || 'all'}
                      setOwnershipFilter={(v) => setLocalFilters(prev => ({ ...prev, homeownerFilter: v }))}
                      lookbackWindow={localFilters.lookbackWindow || '90d'}
                      setLookbackWindow={(v) => setLocalFilters(prev => ({ ...prev, lookbackWindow: v }))}
                    />
                  </>
                )}

                <View style={{ height: 30 }} />
              </ScrollView>

              <View style={s.footer}>
                <TouchableOpacity style={s.resetBtn} onPress={handleReset}>
                  <Text style={s.resetBtnText}>Clear All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
                  <Text style={s.applyBtnText}>Apply Filters</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  hintText: { fontSize: 11, color: COLORS.muted, marginTop: -4, marginBottom: 10, lineHeight: 15 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
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
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 16,
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
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
  },
  toggleTabActive: {
    backgroundColor: COLORS.accent,
  },
  toggleTabText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  toggleTabTextActive: {
    color: '#000',
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
  smallChip: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallChipText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeSeparator: {
    color: COLORS.textDim,
    fontWeight: '700',
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
  applyBtnText: {
    color: '#000',
    fontWeight: '800',
  },
});
