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
import {
  COLORS,
  PROSPECT_STATUS_OPTIONS,
  LEAD_SOURCE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
} from '../constants';
import HomeownerFilterPanel from './HomeownerFilterPanel';

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

const MATCH_STRENGTHS = [
  'Show All',
  'Strong Matches',
  'High Opportunity',
  'Needs Review',
];

const RADIUS_PRESETS = [
  { value: 0.5, label: '0.5 mi' },
  { value: 1, label: '1 mi' },
  { value: 3, label: '3 mi' },
  { value: 5, label: '5 mi' },
  { value: 10, label: '10 mi' },
  { value: 25, label: '25 mi' },
];

const RATING_PRESETS = [
  { value: 0, label: 'Any' },
  { value: 3, label: '3+' },
  { value: 3.5, label: '3.5+' },
  { value: 4, label: '4+' },
  { value: 4.5, label: '4.5+' },
];

const ACTIVITY_WINDOWS = [
  { key: 'all', label: 'Any' },
  { key: 'never', label: 'Never' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
  { key: 'stale', label: 'Stale 90+' },
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
  { key: 'leased', label: 'Leased' },
];

const RESIDENTIAL_PROPERTY_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'single_family', label: 'Single-Family' },
  { key: 'multi_family', label: 'Multi-Family (2-4)' },
  { key: 'condo_townhouse', label: 'Condo/Townhouse' },
  { key: 'mobile_home', label: 'Mobile/Manufactured' },
  { key: 'new_construction', label: 'New Construction' },
];

function isActive(arr, key) {
  if (!Array.isArray(arr)) return false;
  return arr.includes(key);
}

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

  const setMode = (mode) => {
    setLocalFilters(prev => ({ ...prev, targetLensMode: mode }));
  };

  const toggleSignal = (key) => {
    setLocalFilters((prev) => {
      const next = {
        ...prev,
        signals: {
          ...prev.signals,
          [key]: !prev.signals[key],
        },
      };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleStatus = (status) => {
    setLocalFilters(prev => {
      const next = { ...prev, statuses: toggleMulti(prev.statuses || ['All'], status) };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleOccupancy = (type) => {
    setLocalFilters(prev => {
      const next = { ...prev, occupancyTypes: toggleMulti(prev.occupancyTypes || ['all'], type) };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleResidentialType = (type) => {
    setLocalFilters(prev => {
      const next = { ...prev, residentialPropertyTypes: toggleMulti(prev.residentialPropertyTypes || ['all'], type) };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleProspectStatus = (key) => {
    setLocalFilters(prev => {
      const next = { ...prev, prospectStatus: toggleMulti(prev.prospectStatus || [], key) };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleLeadSource = (key) => {
    setLocalFilters(prev => {
      const next = { ...prev, leadSource: toggleMulti(prev.leadSource || [], key) };
      try { onApply && onApply(next); } catch {}
      return next;
    });
  };

  const toggleServiceType = (key) => {
    setLocalFilters(prev => {
      const next = { ...prev, serviceType: toggleMulti(prev.serviceType || [], key) };
      try { onApply && onApply(next); } catch {}
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
                {console.log('[LeadFiltersBottomSheet] rendering filter sections')}
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

                {/* ── Universal Filters ─────────────────────────────── */}
                <Text style={s.sectionTitle}>Prospect Status</Text>
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

                <Text style={s.sectionTitle}>Distance / Radius</Text>
                <View style={s.chipRow}>
                  {RADIUS_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.value}
                      style={[s.chip, localFilters.radiusMiles === preset.value && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, radiusMiles: preset.value })}
                    >
                      <Text style={[s.chipText, localFilters.radiusMiles === preset.value && s.chipTextActive]}>
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Commercial-only: Business Type + Rating */}
                {isBusiness && (
                  <>
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

                    <Text style={s.sectionTitle}>Min Business Rating</Text>
                    <View style={s.chipRow}>
                      {RATING_PRESETS.map((preset) => (
                        <TouchableOpacity
                          key={preset.value}
                          style={[s.chip, localFilters.minRating === preset.value && s.chipActive]}
                          onPress={() => setLocalFilters({ ...localFilters, minRating: preset.value })}
                        >
                          <Text style={[s.chipText, localFilters.minRating === preset.value && s.chipTextActive]}>
                            {preset.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Contact completeness & activity — universal */}
                <Text style={s.sectionTitle}>Contact Completeness</Text>
                <View style={s.chipRow}>
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'enriched', label: 'Enriched' },
                    { key: 'has_phone', label: 'Has Phone' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, localFilters.contactCompleteness === opt.key && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, contactCompleteness: opt.key })}
                    >
                      <Text style={[s.chipText, localFilters.contactCompleteness === opt.key && s.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.sectionTitle}>Last Activity</Text>
                <View style={s.chipRow}>
                  {ACTIVITY_WINDOWS.map((win) => (
                    <TouchableOpacity
                      key={win.key}
                      style={[s.chip, localFilters.activityWindow === win.key && s.chipActive]}
                      onPress={() => setLocalFilters({ ...localFilters, activityWindow: win.key })}
                    >
                      <Text style={[s.chipText, localFilters.activityWindow === win.key && s.chipTextActive]}>
                        {win.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

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

                {/* New Since Last Scan toggle */}
                <TouchableOpacity
                  style={[s.signalsOnlyRow, localFilters.newSinceLastScan && s.signalsOnlyRowActive]}
                  onPress={() => setLocalFilters(prev => ({ ...prev, newSinceLastScan: !prev.newSinceLastScan }))}
                  activeOpacity={0.8}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.signalsOnlyLabel, localFilters.newSinceLastScan && s.signalsOnlyLabelActive]}>
                      🔄 New Since Last Scan
                    </Text>
                    <Text style={s.signalsOnlySub}>
                      Surfaces businesses new since your last pass
                    </Text>
                  </View>
                  <View style={[s.signalsOnlyPill, localFilters.newSinceLastScan && s.signalsOnlyPillActive]}>
                    <Text style={[s.signalsOnlyPillText, localFilters.newSinceLastScan && s.signalsOnlyPillTextActive]}>
                      {localFilters.newSinceLastScan ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Signals chip list */}
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

                {/* ── Prospect Status (hot/warm/cold/contacted) ───────────────── */}
                <Text style={s.sectionTitle}>Prospect Status</Text>
                <View style={s.chipRow}>
                  {PROSPECT_STATUS_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, isActive(localFilters.prospectStatus, opt.key) && s.chipActive]}
                      onPress={() => toggleProspectStatus(opt.key)}
                    >
                      <Text style={[s.chipText, isActive(localFilters.prospectStatus, opt.key) && s.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Lead Source (inbound/manual/import) ──────────────────────── */}
                <Text style={s.sectionTitle}>Lead Source</Text>
                <View style={s.chipRow}>
                  {LEAD_SOURCE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, isActive(localFilters.leadSource, opt.key) && s.chipActive]}
                      onPress={() => toggleLeadSource(opt.key)}
                    >
                      <Text style={[s.chipText, isActive(localFilters.leadSource, opt.key) && s.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Service Type (termite/rodent/general) ─────────────────────── */}
                <Text style={s.sectionTitle}>Service Type</Text>
                <View style={s.chipRow}>
                  {SERVICE_TYPE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, isActive(localFilters.serviceType, opt.key) && s.chipActive]}
                      onPress={() => toggleServiceType(opt.key)}
                    >
                      <Text style={[s.chipText, isActive(localFilters.serviceType, opt.key) && s.chipTextActive]}>
                        {opt.label}
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
