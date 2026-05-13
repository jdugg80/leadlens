import { useEffect, useState, useCallback, memo, useRef, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Switch, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import Constants from 'expo-constants';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { COLORS, LEADS_STORAGE_KEY, GOOGLE_PLACES_API_KEY } from '../constants';
import { searchGooglePlacesByText } from '../utils/nearbySearch';
import { getCurrentCoords } from '../utils/geoEnrich';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel, SecondaryButton } from '../components/UI';
import { applyRequiredPlaceholders, findDuplicateInLeads, inferVertical, normalizeLead } from '../utils/leadHelpers';
import { showThemedAlert } from '../components/ThemedAlert';
import { playSoundEffect } from '../utils/soundManager';
import { recordUserActivityEvent } from '../utils/userLearning';
import { getStyledMessage } from '../utils/aiPersonality';
import BetaTracker from '../../utils/betaTracker';


const getGoogleMapsKey = () => {
  const config = Constants?.expoConfig || Constants?.manifest || {};
  return config.extra?.googlePlacesApiKey || config.android?.config?.googleMaps?.apiKey || GOOGLE_PLACES_API_KEY;
};

function buildTaggedLead(lead, user) {
  const normalized = normalizeLead(lead);
  const inferred = inferVertical(normalized);
  return applyRequiredPlaceholders({
    ...normalized,
    ...inferred,
    reviewed: true,
    id: normalized.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    repName: user.repName,
    employeeNum: user.employeeNum,
    branchNum: user.branchNum,
  });
}

const LeadCard = memo(function LeadCard({ lead, idx, onUpdate, onToggle, onRemove }) {
  const [phoneLoading, setPhoneLoading] = useState(false);

  const findPhone = async () => {
    if (!lead.businessName) {
      showThemedAlert('Missing Name', 'Enter a business name first.');
      return;
    }
    setPhoneLoading(true);
    try {
      const userCoords = await getCurrentCoords().catch(() => null);
      const searchCenter = userCoords || (lead.latitude ? { latitude: lead.latitude, longitude: lead.longitude } : null);
      const fullQuery = [lead.businessName, lead.streetNumber, lead.streetName, lead.city, lead.state].filter(Boolean).join(' ');

      let results = await searchGooglePlacesByText({ query: fullQuery, center: searchCenter, radiusMeters: 5000, apiKey: getGoogleMapsKey() });

      if (!results?.length && lead.city) {
        results = await searchGooglePlacesByText({ query: `${lead.businessName} ${lead.city}`, center: searchCenter, radiusMeters: 10000, apiKey: getGoogleMapsKey() });
      }
      if (!results?.length) {
        results = await searchGooglePlacesByText({ query: lead.businessName, center: searchCenter, radiusMeters: 20000, apiKey: getGoogleMapsKey() });
      }

      const phone = results?.[0]?.formatted_phone_number;
      if (phone) {
        onUpdate(idx, 'phone', phone);
        showThemedAlert('Phone Found', `${phone} has been applied.`);
      } else {
        showThemedAlert('Not Found', 'Google couldn\'t find a phone number for this business.');
      }
    } catch (err) {
    BetaTracker.crash('BatchReviewScreen', err);
      showThemedAlert('Network Error', 'Could not connect to Google. Check your connection.');
    } finally {
      setPhoneLoading(false);
    }
  };

  return (
    <Card style={!lead.keep ? s.dimmedCard : null}>
      <View style={s.cardHeader}>
        <Text style={s.cardTitle}>Lead {idx + 1}</Text>
        <View style={s.cardHeaderRight}>
          <TouchableOpacity onPress={() => onToggle(idx)}>
            <Text style={[s.keepToggle, !lead.keep && s.keepToggleOff]}>
              {lead.keep ? 'KEEP' : 'SKIP'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onRemove(idx)}>
            <Text style={s.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!!lead.duplicateWarning && (
        <View style={s.warningBox}>
          <Text style={s.warningText}>{lead.duplicateWarning}</Text>
          <TouchableOpacity onPress={() => onUpdate(idx, 'ignoreDuplicate', !lead.ignoreDuplicate)}>
            <Text style={s.keepAnyway}>{lead.ignoreDuplicate ? 'Duplicate allowed' : 'Keep anyway'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {((lead.reviewLabels || []).length > 0 || lead.locationSource || lead.locationNeedsReview) && (
        <View style={s.warningBox}>
          {(lead.reviewLabels || []).length > 0 && (
            <Text style={s.warningText}>Labels: {(lead.reviewLabels || []).join(' • ')}</Text>
          )}
          <Text style={s.warningText}>
            Location: {lead.locationSource || 'capture'} · Confidence: {lead.locationConfidence || lead.confidence || 'low'}
          </Text>
          {!!lead.locationNeedsReview && <Text style={s.keepAnyway}>Address needs review before save</Text>}
          {(lead.reviewWarnings || []).map((warning, wIdx) => (
            <Text key={wIdx} style={s.keepAnyway}>{warning}</Text>
          ))}
        </View>
      )}

      <FieldInput label="Business Name" value={lead.businessName} onChangeText={(v) => onUpdate(idx, 'businessName', v)} />
      <View style={s.row}>
        <FieldInput label="First Name" value={lead.pocFirst} onChangeText={(v) => onUpdate(idx, 'pocFirst', v)} />
        <View style={{ width: 10 }} />
        <FieldInput label="Last Name" value={lead.pocLast} onChangeText={(v) => onUpdate(idx, 'pocLast', v)} />
      </View>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          <FieldInput label="Phone" value={lead.phone} onChangeText={(v) => onUpdate(idx, 'phone', v)} />
          {lead.phoneCandidates && lead.phoneCandidates.length > 1 && (
            <View style={s.candidateRow}>
              {lead.phoneCandidates.map((p, pIdx) => (
                <TouchableOpacity
                  key={pIdx}
                  style={[s.candidateChip, lead.phone === p && s.candidateChipActive]}
                  onPress={() => onUpdate(idx, 'phone', p)}
                >
                  <Text style={[s.candidateChipText, lead.phone === p && s.candidateChipActiveText]}>
                    {p}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {!lead.phone && (
            <TouchableOpacity style={s.findPhoneBtn} onPress={findPhone} disabled={phoneLoading}>
              {phoneLoading
                ? <ActivityIndicator size="small" color={COLORS.accent} />
                : <Text style={s.findPhoneText}>🔍 Find #</Text>}
            </TouchableOpacity>
          )}
        </View>
        <View style={{ width: 10 }} />
        <View style={{ flex: 1 }}>
          <FieldInput label="Email" value={lead.email} onChangeText={(v) => onUpdate(idx, 'email', v)} />
          {lead.emailCandidates && lead.emailCandidates.length > 1 && (
            <View style={s.candidateRow}>
              {lead.emailCandidates.map((e, eIdx) => (
                <TouchableOpacity
                  key={eIdx}
                  style={[s.candidateChip, lead.email === e && s.candidateChipActive]}
                  onPress={() => onUpdate(idx, 'email', e)}
                >
                  <Text style={[s.candidateChipText, lead.email === e && s.candidateChipActiveText]} numberOfLines={1}>
                    {e}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
      <View style={s.row}>
        <FieldInput label="Street #" value={lead.streetNumber} onChangeText={(v) => onUpdate(idx, 'streetNumber', v)} />
        <View style={{ width: 10 }} />
        <FieldInput label="Street Name" value={lead.streetName} onChangeText={(v) => onUpdate(idx, 'streetName', v)} />
      </View>
      <View style={{ marginTop: 10 }}>
        <FieldInput label="Address Line 2" value={lead.addressLine2} onChangeText={(v) => onUpdate(idx, 'addressLine2', v)} />
      </View>
      <View style={s.row}>
        <FieldInput label="City" value={lead.city} onChangeText={(v) => onUpdate(idx, 'city', v)} />
        <View style={{ width: 10 }} />
        <FieldInput label="State" value={lead.state} onChangeText={(v) => onUpdate(idx, 'state', v)} />
        <View style={{ width: 10 }} />
        <FieldInput label="ZIP" value={lead.zip} onChangeText={(v) => onUpdate(idx, 'zip', v)} />
      </View>
    </Card>
  );
});

export default function BatchReviewScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('BatchReviewScreen');
  }, []);

  const { user, leads: initialLeads = [], sourceLabel = 'Batch scan' } = route.params;

  const listRef = useRef(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [stateFilter, setStateFilter] = useState('ALL');
  const [leads, setLeads] = useState(() =>
    initialLeads.map((lead) => ({
      ...lead,
      keep: lead.keep !== undefined ? lead.keep : true,
      reviewed: lead.reviewed !== undefined ? lead.reviewed : false,
      ignoreDuplicate: lead.ignoreDuplicate !== undefined ? lead.ignoreDuplicate : false,
    }))
  );

  const uniqueStates = useMemo(() => {
    const states = leads.map(l => l.state?.trim().toUpperCase()).filter(Boolean);
    return ['ALL', ...new Set(states)].sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    if (stateFilter === 'ALL') return leads;
    return leads.filter(l => l.state?.trim().toUpperCase() === stateFilter);
  }, [leads, stateFilter]);

  const scrollToBottom = () => {
    if (filteredLeads.length === 0) return;
    // Tiny delay allows layout to settle before scrolling
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const updateLead = useCallback((idx, key, value) => {
    setLeads((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }, []);

  const removeLead = useCallback((idx) => {
    setLeads((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const toggleKeep = useCallback((idx) => {
    setLeads((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], keep: !next[idx].keep };
      return next;
    });
  }, []);

  const saveAll = async () => {
    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    const nextQueue = [...queue];
    const duplicates = [];
    const saved = [];
    const now = new Date().toISOString();

    for (const lead of filteredLeads.filter((item) => item.keep)) {
      const tagged = { ...buildTaggedLead(lead, user), updatedAt: now };
      const duplicate = allowDuplicates ? null : findDuplicateInLeads(tagged, nextQueue);
      if (duplicate && !lead.ignoreDuplicate) {
        duplicates.push({ lead: tagged, duplicate });
      } else {
        nextQueue.push({
          ...tagged,
          duplicateWarning: duplicate
            ? `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}`
            : '',
        });
        saved.push(tagged);
      }
    }

    if (!allowDuplicates && duplicates.length) {
      showThemedAlert(
        'Duplicates detected',
        `${duplicates.length} prospect(s) look like duplicates already in your queue. Review them and tap "Keep anyway" if you still want them saved.`,
      );
      setLeads((prev) => prev.map((lead) => {
        const hit = duplicates.find(
          (item) =>
            item.lead.businessName === lead.businessName &&
            item.lead.phone === lead.phone &&
            item.lead.email === lead.email,
        );
        return hit
          ? { ...lead, duplicateWarning: `${hit.duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${hit.duplicate.reason}` }
          : lead;
      }));
    }

    if (!saved.length) return;
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextQueue));
    playSoundEffect('prospect-added').catch(() => {});

    saved.forEach((lead) => {
      recordUserActivityEvent('prospect_added', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType,
        source_type: lead.captureMethod,
      }).catch(() => {});
    });

    const msg = await getStyledMessage('prospectAdded');
    showThemedAlert('Batch saved', msg || `${saved.length} prospect(s) added to queue.`, [
      { text: 'Done', onPress: () => navigation.navigate('Dashboard', { user }) },
    ]);
  };

  const renderItem = useCallback(
    ({ item, index }) => (
      <LeadCard lead={item} idx={index} onUpdate={updateLead} onToggle={toggleKeep} onRemove={removeLead} />
    ),
    [updateLead, toggleKeep, removeLead],
  );

  const keyExtractor = useCallback((item, idx) => item.id || String(idx), []);

  return (
    <View style={s.root}>
      <ScreenHeader title="Batch Review" badge={`${leads.length} FOUND`} onBack={() => navigation.goBack()} />

      {filteredLeads.length > 3 && (
        <TouchableOpacity style={s.skipBtn} onPress={scrollToBottom} activeOpacity={0.7}>
          <Text style={s.skipBtnText}>SKIP TO ACTIONS ↓</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={listRef}
        data={filteredLeads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={leads}
        ListHeaderComponent={
          <>
            <Card accent>
              <Text style={s.introTitle}>{sourceLabel}</Text>
              <Text style={s.introText}>Review each extracted lead, remove junk entries, and save only what you want.</Text>
            </Card>

            {uniqueStates.length > 2 && (
              <View style={s.filterContainer}>
                <SectionLabel>Filter by State</SectionLabel>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stateScroll}>
                  {uniqueStates.map(st => (
                    <TouchableOpacity
                      key={st}
                      style={[s.stateTab, stateFilter === st && s.stateTabActive]}
                      onPress={() => setStateFilter(st)}
                    >
                      <Text style={[s.stateTabText, stateFilter === st && s.stateTabTextActive]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        }
        ListFooterComponent={
          <>
            <SectionLabel>Actions</SectionLabel>
            <View style={s.dupRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.dupLabel}>Allow Duplicate Leads</Text>
                <Text style={s.dupSub}>Bypass duplicate detection and save all selected leads</Text>
              </View>
              <Switch
                value={allowDuplicates}
                onValueChange={setAllowDuplicates}
                trackColor={{ false: '#2a2d3a', true: 'rgba(123,63,190,0.5)' }}
                thumbColor={allowDuplicates ? '#7B3FBE' : '#4a5568'}
              />
            </View>
            <PrimaryButton
              title={allowDuplicates ? `Save All ${leads.filter(l => l.keep).length} Prospects` : 'Save Selected Prospects'}
              onPress={saveAll}
              style={allowDuplicates ? { backgroundColor: '#7B3FBE' } : null}
            />
            <SecondaryButton title="Back to Scan" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
            <TouchableOpacity
              onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={s.backToTopText}>↑ BACK TO TOP</Text>
            </TouchableOpacity>
          </>
        }
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={11}
        maxToRenderPerBatch={10}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  introTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  introText: { color: COLORS.muted, marginTop: 4, fontSize: 12, lineHeight: 17 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTitle: { color: COLORS.textDim, fontWeight: '700', fontSize: 13, letterSpacing: 0.5 },
  keepToggle: { color: COLORS.success, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  keepToggleOff: { color: COLORS.muted },
  removeText: { color: COLORS.danger, fontSize: 11, fontWeight: '800' },
  dimmedCard: { opacity: 0.45 },
  warningBox: {
    borderWidth: 1, borderColor: 'rgba(204,16,64,0.3)',
    backgroundColor: 'rgba(204,16,64,0.06)',
    borderRadius: 10, padding: 10, marginBottom: 10,
  },
  warningText: { color: COLORS.accent2, fontSize: 12, lineHeight: 17 },
  keepAnyway: { color: COLORS.accent, fontWeight: '700', marginTop: 6, fontSize: 12 },
  row: { flexDirection: 'row', marginTop: 10 },
  dupRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(123,63,190,0.08)', borderWidth: 1, borderColor: 'rgba(123,63,190,0.2)',
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  dupLabel: { color: '#B8BDD0', fontSize: 13, fontWeight: '700' },
  dupSub: { color: '#4a5568', fontSize: 11, marginTop: 3, lineHeight: 15 },
  findPhoneBtn: {
    marginTop: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.3)',
    backgroundColor: 'rgba(0,201,255,0.06)',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 72,
  },
  findPhoneText: { color: COLORS.accent, fontSize: 11, fontWeight: '700' },
  candidateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  candidateChip: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  candidateChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.1)',
  },
  candidateChipText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  candidateChipActiveText: {
    color: COLORS.accent,
  },
  skipBtn: {
    backgroundColor: COLORS.surface2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  filterContainer: {
    marginTop: 10,
    marginBottom: 5,
  },
  stateScroll: {
    paddingBottom: 10,
    gap: 8,
  },
  stateTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stateTabActive: {
    backgroundColor: 'rgba(0,201,255,0.15)',
    borderColor: COLORS.accent,
  },
  stateTabText: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  stateTabTextActive: {
    color: COLORS.accent,
  },
  backToTopText: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});