import { useEffect, useState, useCallback, memo, useRef, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Switch, StyleSheet, ActivityIndicator, ScrollView, PanResponder, Animated } from 'react-native';
import Constants from 'expo-constants';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { COLORS, LEADS_STORAGE_KEY, GOOGLE_PLACES_API_KEY } from '../constants';
import { searchGooglePlacesByText } from '../utils/nearbySearch';
import { getCurrentCoords } from '../utils/geoEnrich';
import { ScreenHeader, FieldInput, PrimaryButton, Card, SectionLabel, SecondaryButton } from '../components/UI';
import AddressRow from '../components/AddressRow';
import { screenWidth } from '../utils/responsive';
import { applyRequiredPlaceholders, findDuplicateInLeads, inferVertical, normalizeLead, calculateLeadViability } from '../utils/leadHelpers';
import { showThemedAlert } from '../components/ThemedAlert';
import ProspectOutreachModal from '../components/ProspectOutreachModal';
import { playSoundEffect } from '../utils/soundManager';
import { recordUserActivityEvent } from '../utils/userLearning';
import { getStyledMessage } from '../utils/aiPersonality';
import { enqueueEnrichLead } from '../utils/claudeApi';
import { processQueue } from '../utils/taskRunner';
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

const LeadCard = memo(function LeadCard({ lead, idx, onUpdate, onRemove }) {
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [swipeOffset] = useState(new Animated.Value(0));
  const panResponder = useRef(null);

  // Setup pan responder for swipe gesture
  useEffect(() => {
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx }) => Math.abs(dx) > 10,
      onPanResponderMove: (_, { dx }) => {
        // Only allow swiping left (negative dx)
        if (dx < 0) {
          swipeOffset.setValue(Math.max(dx, -(screenWidth * 0.20)));
        }
      },
      onPanResponderRelease: (_, { dx }) => {
        // If swiped more than 60px left, delete
        if (dx < -60) {
          handleDelete();
        } else {
          // Snap back to original position
          Animated.spring(swipeOffset, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    });
  }, [swipeOffset]);

  const handleDelete = () => {
    // Animate slide out to left
    Animated.timing(swipeOffset, {
      toValue: -screenWidth,
      duration: 300,
      useNativeDriver: false,
    }).start(() => {
      onRemove(idx);
    });
  };

  const findPhone = async () => {
    if (!lead.businessName) {
      showThemedAlert('Missing Name', 'Enter a business name first.');
      return;
    }
    setPhoneLoading(true);
    try {
      // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
      const userCoords = await Promise.race([
        getCurrentCoords(),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);
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

  const deleteButtonOpacity = swipeOffset.interpolate({
    inputRange: [-80, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={s.cardContainer}>
      {/* Delete action appears on swipe left */}
      <Animated.View style={[s.deleteAction, { opacity: deleteButtonOpacity }]}>
        <TouchableOpacity style={s.deleteActionBtn} onPress={handleDelete}>
          <Text style={s.deleteActionText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Card (swipeable) */}
      <Animated.View
        style={[
          s.swipeableCard,
          {
            transform: [{ translateX: swipeOffset }],
          },
        ]}
        {...panResponder.current?.panHandlers}
      >
        <Card>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Lead {idx + 1}</Text>
            <Text style={s.swipeHint}>← swipe to delete</Text>
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
                  {lead.phoneCandidates.map((p, pIdx) => {
                    const phoneText = typeof p === 'object' ? (p.number || p.phone || '') : String(p || '');
                    const isActive = lead.phone === phoneText || lead.phone === p;
                    return (
                      <TouchableOpacity
                        key={pIdx}
                        style={[s.candidateChip, isActive && s.candidateChipActive]}
                        onPress={() => onUpdate(idx, 'phone', phoneText)}
                      >
                        <Text style={[s.candidateChipText, isActive && s.candidateChipActiveText]}>
                          {phoneText}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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
          <AddressRow
            renderField={(props) => <FieldInput {...props} />}
            city={lead.city}
            onCityChange={(v) => onUpdate(idx, 'city', v)}
            state={lead.state}
            onStateChange={(v) => onUpdate(idx, 'state', v)}
            zip={lead.zip}
            onZipChange={(v) => onUpdate(idx, 'zip', v)}
          />
        </Card>
      </Animated.View>
    </View>
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
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [outreachProspect, setOutreachProspect] = useState(null);

  const [leads, setLeads] = useState(() =>
    initialLeads.map((lead) => ({
      ...lead,
      id: lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
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
    // Scroll to a very large offset to ensure we hit the bottom regardless of list length
    listRef.current?.scrollToOffset({ offset: 99999, animated: true });
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

  const toggleSelection = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleLongPress = (id) => {
    setSelectionMode(true);
    toggleSelection(id);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const selectAll = () => {
    const allIds = new Set(filteredLeads.map(l => l.id));
    setSelectedIds(allIds);
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    showThemedAlert(
      `Delete ${selectedIds.size} Prospects?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setLeads(prev => prev.filter(l => !selectedIds.has(l.id)));
            clearSelection();
          },
        },
      ]
    );
  };

  const toggleKeep = useCallback((idx) => {
    setLeads((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], keep: !next[idx].keep };
      return next;
    });
  }, []);

  const saveAll = async () => {
    // Read from MMKV first, then fall back to raw AsyncStorage if MMKV returns empty.
    // MMKV can silently return null/[] on some devices — this prevents new scans
    // from overwriting the existing queue instead of appending to it.
    let existing = AsyncStorage.getJSONSync(LEADS_STORAGE_KEY, []);
    if (!existing || !existing.length) {
      try {
        const RawStorage = require('@react-native-async-storage/async-storage').default;
        const raw = await RawStorage.getItem(LEADS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            existing = parsed;
            console.log('[BatchReview] MMKV empty — recovered', parsed.length, 'leads from AsyncStorage');
          }
        }
      } catch (e) {
        console.warn('[BatchReview] AsyncStorage fallback read failed:', e.message);
      }
    }
    console.log('[BatchReview][SAVE_DEBUG] MMKV read:', JSON.stringify(existing?.length), 'leads');
    console.log('[BatchReview][SAVE_DEBUG] LEADS_STORAGE_KEY:', LEADS_STORAGE_KEY);
    const nextQueue = [...existing];
    const duplicates = [];
    const saved = [];
    const now = new Date().toISOString();

    const isSpreadsheetImport = sourceLabel === 'Excel import';

    for (const lead of filteredLeads.filter((item) => item.keep)) {
      const tagged = { ...buildTaggedLead(lead, user), updatedAt: now };
      const checkAgainst = isSpreadsheetImport ? existing : nextQueue;
      const duplicate = allowDuplicates ? null : findDuplicateInLeads(tagged, checkAgainst);
      if (duplicate && !lead.ignoreDuplicate) {
        duplicates.push({ lead: tagged, duplicate });
      } else {
        const batchLead = {
          ...tagged,
          queueStatus: 'new',
          queueSortGroup: 0,
          collectedAt: now,
          duplicateWarning: duplicate
            ? `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}`
            : '',
        };
        const finalLead = { ...batchLead, ...calculateLeadViability(batchLead) };
        nextQueue.push(finalLead);
        saved.push(finalLead);
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

    // Primary write via MMKV (sync, instant)
    AsyncStorage.setJSONSync(LEADS_STORAGE_KEY, nextQueue);
    // Safety backup via raw AsyncStorage — guarantees persistence if MMKV silent-failed
    const RawStorage = require('@react-native-async-storage/async-storage').default;
    RawStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextQueue)).catch((e) =>
      console.warn('[BatchReview] AsyncStorage backup write failed:', e.message)
    );

    playSoundEffect('prospect-added').catch(() => {});

    // Enqueue each saved lead for background AI enrichment
    saved.forEach((lead) => {
      enqueueEnrichLead(lead).catch(() => {});
    });
    processQueue().catch(() => {});

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
      {
        text: 'Reach Out',
        onPress: () => {
          const firstReachable = saved.find((l) => l.email || l.phone) || saved[0];
          if (firstReachable) setOutreachProspect(firstReachable);
        },
      },
      { text: 'Done', onPress: () => navigation.navigate('Dashboard', { user }) },
    ]);
  };

  const renderItem = useCallback(
    ({ item, index }) => {
      const isSelected = selectedIds.has(item.id);
      return (
        <TouchableOpacity
          onPress={() => selectionMode && toggleSelection(item.id)}
          onLongPress={() => handleLongPress(item.id)}
          activeOpacity={selectionMode ? 0.7 : 1}
        >
          <LeadCard lead={item} idx={index} onUpdate={updateLead} onRemove={removeLead} />
          {selectionMode && (
            <View style={[s.selectionOverlay, isSelected && s.selectionOverlayActive]}>
              <Text style={s.selectionCheck}>{isSelected ? '✓' : ''}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [updateLead, removeLead, selectionMode, selectedIds]
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
            {selectionMode ? (
              <>
                <SecondaryButton title={`Delete ${selectedIds.size} Selected`} onPress={deleteSelected} style={{ marginTop: 10, backgroundColor: COLORS.danger }} />
                <TouchableOpacity onPress={selectAll} style={{ marginTop: 10, alignItems: 'center' }}>
                  <Text style={s.backToTopText}>SELECT ALL</Text>
                </TouchableOpacity>
              </>
            ) : (
              <SecondaryButton title="Back to Scan" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
            )}
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
      <ProspectOutreachModal
        visible={!!outreachProspect}
        prospect={outreachProspect}
        user={user}
        onClose={() => {
          setOutreachProspect(null);
          navigation.navigate('Dashboard', { user });
        }}
        onSent={() => {
          setOutreachProspect(null);
          navigation.navigate('Dashboard', { user });
        }}
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
  cardContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  swipeableCard: {
    zIndex: 1,
  },
  deleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: screenWidth * 0.20,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  deleteActionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  deleteActionText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  swipeHint: {
    color: COLORS.muted,
    fontSize: 10,
    fontStyle: 'italic',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectionOverlayActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0, 201, 255, 0.2)',
  },
  selectionCheck: {
    color: COLORS.accent,
    fontSize: 48,
    fontWeight: 'bold',
  },
});