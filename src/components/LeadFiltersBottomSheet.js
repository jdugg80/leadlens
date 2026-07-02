import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
  TextInput,
} from 'react-native';
import { COLORS } from '../constants';

const MODES = [
  { key: 'commercial', label: 'Commercial', icon: '🏢' },
  { key: 'residential', label: 'Residential', icon: '🏠' },
];

const PROSPECT_STATUSES = ['Suspect', 'New', 'Contacted', 'In Progress', 'Not Interested', 'Closed'];

const RADIUS_PRESETS = [
  { key: 0.5, label: '0.5 mi' },
  { key: 1, label: '1 mi' },
  { key: 3, label: '3 mi' },
  { key: 5, label: '5 mi' },
];

const LAST_ACTIVITY_DATES = [
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: '6m', label: 'Last 6 months' },
];

const COMMERCIAL_PROPERTY_TYPES = [
  'Food & Hospitality',
  'Retail',
  'Office & Professional',
  'Multi-Family & Residential-Adjacent',
  'Industrial & Logistics',
  'Institutional',
  'Other',
];

const RESIDENTIAL_PROPERTY_TYPES = [
  'Single-Family Home',
  'Multi-Family (2-4 units)',
  'Condo/Townhouse',
  'Mobile/Manufactured Home',
  'New Construction',
];

const OCCUPANCY_TYPES = [
  { key: 'owner_occupied', label: 'Owner-Occupied' },
  { key: 'rental', label: 'Rental' },
  { key: 'leased', label: 'Leased' },
];

const RATING_PRESETS = [
  { key: 0, label: 'Any' },
  { key: 3, label: '3+ ★' },
  { key: 4, label: '4+ ★' },
  { key: 4.5, label: '4.5+ ★' },
];

const LOOKBACK_WINDOWS = [
  { key: '30d', label: '30 Days' },
  { key: '60d', label: '60 Days' },
  { key: '90d', label: '90 Days' },
  { key: '120d', label: '120 Days' },
];

const LEGACY_SIGNALS = [
  { key: 'lensSignal', label: 'LensSignal' },
  { key: 'contactSignal', label: 'Contact Signal' },
  { key: 'pest', label: 'Pest Indicator' },
  { key: 'opening', label: 'Opening Signal' },
  { key: 'priority', label: 'Priority' },
];

const MATCH_STRENGTHS = [
  'Show All',
  'Strong Matches',
  'High Opportunity',
  'Needs Review',
];

function Chip({ label, active, onPress, disabled }) {
  return (
    <TouchableOpacity
      style={[s.chip, active && s.chipActive, disabled && s.chipDisabled]}
      onPress={disabled ? null : onPress}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Text style={[s.chipText, active && s.chipTextActive, disabled && s.chipTextDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ToggleRow({ label, sub, active, onPress, disabled, disabledReason }) {
  return (
    <TouchableOpacity
      style={[s.toggleRow, active && s.toggleRowActive, disabled && s.toggleRowDisabled]}
      onPress={disabled ? null : onPress}
      activeOpacity={disabled ? 1 : 0.8}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.toggleLabel, active && s.toggleLabelActive, disabled && s.toggleLabelDisabled]}>
          {label}
        </Text>
        {!!sub && <Text style={[s.toggleSub, disabled && s.toggleSubDisabled]}>{sub}</Text>}
        {disabled && !!disabledReason && (
          <Text style={s.comingSoonBadge}>{disabledReason}</Text>
        )}
      </View>
      <View style={[s.togglePill, active && s.togglePillActive, disabled && s.togglePillDisabled]}>
        <Text style={[s.togglePillText, active && s.togglePillTextActive, disabled && s.togglePillTextDisabled]}>
          {active ? 'ON' : 'OFF'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function Section({ title, children }) {
  return (
    <>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </>
  );
}

function MultiSelectChipGroup({ options, selected, onToggle, keyExtractor, labelExtractor }) {
  const getKey = keyExtractor || ((item) => (typeof item === 'string' ? item : item.key));
  const getLabel = labelExtractor || ((item) => (typeof item === 'string' ? item : item.label));
  return (
    <View style={s.chipRow}>
      {options.map((option) => {
        const key = getKey(option);
        const isSelected = selected.includes(key);
        return (
          <Chip
            key={key}
            label={getLabel(option)}
            active={isSelected}
            onPress={() => onToggle(key)}
          />
        );
      })}
    </View>
  );
}

function SingleSelectChipGroup({ options, selected, onSelect, keyExtractor, labelExtractor }) {
  const getKey = keyExtractor || ((item) => (typeof item === 'string' ? item : item.key));
  const getLabel = labelExtractor || ((item) => (typeof item === 'string' ? item : item.label));
  return (
    <View style={s.chipRow}>
      {options.map((option) => {
        const key = getKey(option);
        return (
          <Chip
            key={key}
            label={getLabel(option)}
            active={selected === key}
            onPress={() => onSelect(key)}
          />
        );
      })}
    </View>
  );
}

function MinMaxRow({ minLabel, maxLabel, minValue, maxValue, onChangeMin, onChangeMax, prefix }) {
  return (
    <View style={s.minMaxRow}>
      <View style={s.minMaxInputGroup}>
        <Text style={s.minMaxLabel}>{minLabel}</Text>
        <View style={s.minMaxInputWrap}>
          {!!prefix && <Text style={s.minMaxPrefix}>{prefix}</Text>}
          <TextInput
            style={s.minMaxInput}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={COLORS.muted}
            value={minValue != null ? String(minValue) : ''}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              onChangeMin(cleaned === '' ? null : Number(cleaned));
            }}
          />
        </View>
      </View>
      <View style={s.minMaxDivider}>
        <Text style={s.minMaxDividerText}>—</Text>
      </View>
      <View style={s.minMaxInputGroup}>
        <Text style={s.minMaxLabel}>{maxLabel}</Text>
        <View style={s.minMaxInputWrap}>
          {!!prefix && <Text style={s.minMaxPrefix}>{prefix}</Text>}
          <TextInput
            style={s.minMaxInput}
            keyboardType="numeric"
            placeholder="∞"
            placeholderTextColor={COLORS.muted}
            value={maxValue != null ? String(maxValue) : ''}
            onChangeText={(text) => {
              const cleaned = text.replace(/[^0-9]/g, '');
              onChangeMax(cleaned === '' ? null : Number(cleaned));
            }}
          />
        </View>
      </View>
    </View>
  );
}

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

  const mode = localFilters.mode || 'commercial';
  const isCommercial = mode === 'commercial';

  const setMode = (nextMode) => {
    setLocalFilters((prev) => ({ ...prev, mode: nextMode }));
  };

  const toggleArray = (key, value) => {
    setLocalFilters((prev) => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const toggleLegacySignal = (key) => {
    setLocalFilters((prev) => ({
      ...prev,
      signals: {
        ...prev.signals,
        [key]: !prev.signals[key],
      },
    }));
  };

  const updateLensSignal = (key, value) => {
    setLocalFilters((prev) => ({
      ...prev,
      lensSignalFilters: {
        ...(prev.lensSignalFilters || {}),
        [key]: value,
      },
    }));
  };

  const updateResidentialSignal = (key, value) => {
    setLocalFilters((prev) => ({
      ...prev,
      residentialSignalFilters: {
        ...(prev.residentialSignalFilters || {}),
        [key]: value,
      },
    }));
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
                {/* ── Commercial / Residential Toggle ───────────────────── */}
                <Section title="Mode">
                  <View style={s.modeToggleRow}>
                    {MODES.map((m) => (
                      <TouchableOpacity
                        key={m.key}
                        style={[s.modeBtn, mode === m.key && s.modeBtnActive]}
                        onPress={() => setMode(m.key)}
                      >
                        <Text style={s.modeBtnIcon}>{m.icon}</Text>
                        <Text style={[s.modeBtnText, mode === m.key && s.modeBtnTextActive]}>
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Section>

                {/* ── Universal Filters ───────────────────────────────── */}
                <Section title="Prospect Status">
                  <MultiSelectChipGroup
                    options={PROSPECT_STATUSES}
                    selected={localFilters.prospectStatus || []}
                    onToggle={(key) => toggleArray('prospectStatus', key)}
                  />
                </Section>

                <Section title="Distance / Radius">
                  <SingleSelectChipGroup
                    options={RADIUS_PRESETS}
                    selected={localFilters.radiusMiles || 5}
                    onSelect={(key) => setLocalFilters((prev) => ({ ...prev, radiusMiles: key }))}
                  />
                </Section>

                <ToggleRow
                  label="📇 Contact Completeness"
                  sub="Only show prospects with phone, email, or address"
                  active={localFilters.contactCompleteness}
                  onPress={() => setLocalFilters((prev) => ({ ...prev, contactCompleteness: !prev.contactCompleteness }))}
                />

                <Section title="Last Activity Date">
                  <MultiSelectChipGroup
                    options={LAST_ACTIVITY_DATES}
                    selected={localFilters.lastActivityDate || []}
                    onToggle={(key) => toggleArray('lastActivityDate', key)}
                  />
                </Section>

                <ToggleRow
                  label="🆕 New Since Last Scan"
                  sub="Only prospects captured since your last scan"
                  active={localFilters.newSinceLastScan}
                  onPress={() => setLocalFilters((prev) => ({ ...prev, newSinceLastScan: !prev.newSinceLastScan }))}
                />

                {/* ── Commercial-only Filters ─────────────────────────── */}
                {isCommercial && (
                  <>
                    <Section title="Business Rating">
                      <SingleSelectChipGroup
                        options={RATING_PRESETS}
                        selected={localFilters.businessRatingMin || 0}
                        onSelect={(key) => setLocalFilters((prev) => ({ ...prev, businessRatingMin: key }))}
                      />
                    </Section>

                    <Section title="Commercial Property Type">
                      <MultiSelectChipGroup
                        options={COMMERCIAL_PROPERTY_TYPES}
                        selected={localFilters.commercialPropertyTypes || []}
                        onToggle={(key) => toggleArray('commercialPropertyTypes', key)}
                      />
                    </Section>
                  </>
                )}

                {/* ── Residential-only Filters ──────────────────────────── */}
                {!isCommercial && (
                  <>
                    <Section title="Estimated Home Value">
                      <MinMaxRow
                        minLabel="Min"
                        maxLabel="Max"
                        minValue={localFilters.estimatedHomeValueMin}
                        maxValue={localFilters.estimatedHomeValueMax}
                        onChangeMin={(v) => setLocalFilters((prev) => ({ ...prev, estimatedHomeValueMin: v }))}
                        onChangeMax={(v) => setLocalFilters((prev) => ({ ...prev, estimatedHomeValueMax: v }))}
                        prefix="$"
                      />
                    </Section>

                    <Section title="Approx. Square Footage">
                      <MinMaxRow
                        minLabel="Min"
                        maxLabel="Max"
                        minValue={localFilters.squareFootageMin}
                        maxValue={localFilters.squareFootageMax}
                        onChangeMin={(v) => setLocalFilters((prev) => ({ ...prev, squareFootageMin: v }))}
                        onChangeMax={(v) => setLocalFilters((prev) => ({ ...prev, squareFootageMax: v }))}
                        prefix="sqft"
                      />
                    </Section>

                    <Section title="Lookback Window">
                      <SingleSelectChipGroup
                        options={LOOKBACK_WINDOWS}
                        selected={localFilters.lookbackWindow || '90d'}
                        onSelect={(key) => setLocalFilters((prev) => ({ ...prev, lookbackWindow: key }))}
                      />
                    </Section>

                    <Section title="Occupancy Type">
                      <MultiSelectChipGroup
                        options={OCCUPANCY_TYPES}
                        selected={localFilters.occupancyTypes || []}
                        onToggle={(key) => toggleArray('occupancyTypes', key)}
                        keyExtractor={(item) => item.key}
                        labelExtractor={(item) => item.label}
                      />
                    </Section>

                    <Section title="Residential Property Type">
                      <MultiSelectChipGroup
                        options={RESIDENTIAL_PROPERTY_TYPES}
                        selected={localFilters.residentialPropertyTypes || []}
                        onToggle={(key) => toggleArray('residentialPropertyTypes', key)}
                      />
                    </Section>
                  </>
                )}

                {/* ── Legacy Signals (kept for backward compatibility) ───── */}
                <Section title="Signals">
                  <View style={s.chipRow}>
                    {LEGACY_SIGNALS.map((sig) => (
                      <Chip
                        key={sig.key}
                        label={sig.label}
                        active={!!localFilters.signals?.[sig.key]}
                        onPress={() => toggleLegacySignal(sig.key)}
                      />
                    ))}
                  </View>
                </Section>

                <Section title="Match Strength">
                  <SingleSelectChipGroup
                    options={MATCH_STRENGTHS}
                    selected={localFilters.matchStrength || 'Show All'}
                    onSelect={(key) => setLocalFilters((prev) => ({ ...prev, matchStrength: key }))}
                  />
                </Section>

                {/* ── LensSignal Filters ────────────────────────────────── */}
                {isCommercial && (
                  <>
                    <Section title="LensSignal Filters">
                      <ToggleRow
                        label="🆕 New Business Openings"
                        sub="Permit-based and new-registration signals"
                        active={!!localFilters.lensSignalFilters?.newBusinessOpenings}
                        onPress={() => updateLensSignal('newBusinessOpenings', !localFilters.lensSignalFilters?.newBusinessOpenings)}
                      />
                      <ToggleRow
                        label="🔑 Ownership Changes"
                        sub="Businesses with recent ownership transfers"
                        active={!!localFilters.lensSignalFilters?.ownershipChanges}
                        onPress={() => updateLensSignal('ownershipChanges', !localFilters.lensSignalFilters?.ownershipChanges)}
                      />
                      <ToggleRow
                        label="🍔 Health Code Violations"
                        sub="Health-inspection flag data"
                        active={!!localFilters.lensSignalFilters?.healthCodeViolations}
                        onPress={() => updateLensSignal('healthCodeViolations', !localFilters.lensSignalFilters?.healthCodeViolations)}
                        disabled
                        disabledReason="TX-only for now"
                      />
                      <ToggleRow
                        label="📊 Compliance Score"
                        sub="Minimum compliance score threshold"
                        active={!!localFilters.lensSignalFilters?.complianceScoreMin && localFilters.lensSignalFilters.complianceScoreMin > 0}
                        onPress={() => updateLensSignal('complianceScoreMin', (localFilters.lensSignalFilters?.complianceScoreMin || 0) > 0 ? 0 : 70)}
                        disabled
                        disabledReason="TX-only for now"
                      />
                      <Section title="Star Rating">
                        <SingleSelectChipGroup
                          options={RATING_PRESETS}
                          selected={localFilters.lensSignalFilters?.starRatingMin || 0}
                          onSelect={(key) => updateLensSignal('starRatingMin', key)}
                        />
                      </Section>
                    </Section>
                  </>
                )}

                {/* ── Residential Signal Filters ────────────────────────── */}
                {!isCommercial && (
                  <>
                    <Section title="Residential Signal Filters">
                      <ToggleRow
                        label="🔑 New Homeowner"
                        sub="Recent sale / deed transfer"
                        active={!!localFilters.residentialSignalFilters?.newHomeowner}
                        onPress={() => updateResidentialSignal('newHomeowner', !localFilters.residentialSignalFilters?.newHomeowner)}
                      />
                      <ToggleRow
                        label="🔨 Building / Renovation Permit"
                        sub="Permits for remodels and additions"
                        active={!!localFilters.residentialSignalFilters?.buildingRenovationPermit}
                        onPress={() => updateResidentialSignal('buildingRenovationPermit', !localFilters.residentialSignalFilters?.buildingRenovationPermit)}
                      />
                      <ToggleRow
                        label="🏗️ New Construction Permit"
                        sub="New-home construction permits"
                        active={!!localFilters.residentialSignalFilters?.newConstructionPermit}
                        onPress={() => updateResidentialSignal('newConstructionPermit', !localFilters.residentialSignalFilters?.newConstructionPermit)}
                      />
                      <Section title="Signal Home Value">
                        <MinMaxRow
                          minLabel="Min"
                          maxLabel="Max"
                          minValue={localFilters.residentialSignalFilters?.estimatedHomeValueMin}
                          maxValue={localFilters.residentialSignalFilters?.estimatedHomeValueMax}
                          onChangeMin={(v) => updateResidentialSignal('estimatedHomeValueMin', v)}
                          onChangeMax={(v) => updateResidentialSignal('estimatedHomeValueMax', v)}
                          prefix="$"
                        />
                      </Section>
                    </Section>
                  </>
                )}

                <View style={{ height: 40 }} />
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
    maxHeight: '90%',
    paddingBottom: 34,
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
  chipDisabled: {
    opacity: 0.5,
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.border,
  },
  chipText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.accent,
  },
  chipTextDisabled: {
    color: COLORS.muted,
  },
  modeToggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 12,
  },
  modeBtnActive: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  modeBtnIcon: {
    fontSize: 16,
  },
  modeBtnText: {
    color: COLORS.textDim,
    fontSize: 14,
    fontWeight: '700',
  },
  modeBtnTextActive: {
    color: COLORS.accent,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
  },
  toggleRowActive: {
    backgroundColor: 'rgba(0,201,255,0.08)',
    borderColor: COLORS.accent,
  },
  toggleRowDisabled: {
    opacity: 0.6,
  },
  toggleLabel: {
    color: COLORS.textDim,
    fontWeight: '700',
    fontSize: 14,
  },
  toggleLabelActive: {
    color: COLORS.accent,
  },
  toggleLabelDisabled: {
    color: COLORS.muted,
  },
  toggleSub: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  toggleSubDisabled: {
    color: COLORS.muted,
  },
  togglePill: {
    backgroundColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  togglePillActive: {
    backgroundColor: COLORS.accent,
  },
  togglePillDisabled: {
    backgroundColor: COLORS.surface3,
  },
  togglePillText: {
    color: COLORS.muted,
    fontWeight: '800',
    fontSize: 11,
  },
  togglePillTextActive: {
    color: '#000',
  },
  togglePillTextDisabled: {
    color: COLORS.muted,
  },
  comingSoonBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,193,7,0.15)',
    borderColor: 'rgba(255,193,7,0.4)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  minMaxRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  minMaxInputGroup: {
    flex: 1,
  },
  minMaxLabel: {
    color: COLORS.label,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  minMaxInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  minMaxPrefix: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
  },
  minMaxInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 10,
  },
  minMaxDivider: {
    paddingBottom: 12,
  },
  minMaxDividerText: {
    color: COLORS.muted,
    fontSize: 14,
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
