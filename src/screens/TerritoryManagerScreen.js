import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { storage as AsyncStorage } from '../utils/storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { read, utils } from 'xlsx';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, LEADS_STORAGE_KEY, SUPABASE_SETTINGS_KEY } from '../constants';
import { ScreenHeader, Card, SectionLabel, PrimaryButton, SecondaryButton } from '../components/UI';
import { extractLeadsFromImage } from '../utils/claudeApi';
import { createSupabaseClient } from '../utils/supabaseClient';
import {
  loadMyZips, saveMyZips, loadSharedTerritories, saveSharedTerritories,
  buildZipEntry, validateZipBatch, buildZipActivity, getHeatLevel, getHeatColor,
  GOALS_STORAGE_KEY,
  matchLeadsToTerritory, syncTerritoryToSupabase, fetchSharedTerritories,
  fetchMyTerritoryFromSupabase,
  normalizeZipEntry, isValidZip, getHeatLabel,
} from '../utils/territoryUtils';
import { TARGET_LENS_PROFILES_KEY, TARGET_LENS_SEARCH_MODE_KEY } from '../constants';
import { showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';

const TABS = ['Heat Map', 'My ZIPs', 'Leads', 'Team'];

function PulsingZipTile({ item, colors, level }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const duration = level === 'on-target' ? 800
      : level === 'warm'      ? 1200
      : level === 'light'     ? 2000
      : level === 'cold'      ? 3500
      : 0; // inactive — no pulse

    if (!duration) return;

    const scaleAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: level === 'on-target' ? 1.06 : 1.03, duration, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration, useNativeDriver: true }),
      ])
    );

    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.4, duration, useNativeDriver: true }),
      ])
    );

    scaleAnim.start();
    glowAnim.start();

    return () => {
      scaleAnim.stop();
      glowAnim.stop();
    };
  }, [level]);

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0, level === 'on-target' ? 0.55 : level === 'warm' ? 0.35 : 0.2],
  });

  return (
    <Animated.View style={[
      s.heatCell,
      { borderColor: colors.border, backgroundColor: colors.bg, transform: [{ scale: pulse }] }
    ]}>
      {/* Glow ring */}
      <Animated.View style={[
        s.heatGlow,
        { borderColor: colors.text, opacity: glowOpacity }
      ]} />
      <Text style={[s.heatZip, { color: colors.text }]}>{item.zip}</Text>
      <Text style={[s.heatCount, { color: colors.text }]}>
        {item.prospectCount90d || 0}
      </Text>
      <Text style={s.heatLeadLabel}>prospects 90d</Text>
      <Text style={[s.heatWeekly, { color: colors.text }]}>
        {item.weeklyCount || 0} this wk
      </Text>
      <Text style={[s.heatLevelLabel, { color: colors.text }]}>
        {getHeatLabel(level)}
      </Text>
    </Animated.View>
  );
}

export default function TerritoryManagerScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('TerritoryManagerScreen');
  }, []);

  const { user } = route.params;
  const [activeTab, setActiveTab] = useState('Heat Map');
  const [myZips, setMyZips] = useState([]);
  const [sharedTerritories, setSharedTerritories] = useState([]);
  const [leads, setLeads] = useState([]);
  const [zipActivity, setZipActivity] = useState([]);
  const [matchedLeads, setMatchedLeads] = useState([]);
  const [dailyGoal, setDailyGoal] = useState(10);
  const matchedProspects = matchedLeads; // alias for UI references
  const [manualZip, setManualZip] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusText, setStatusText] = useState('');

  // TargetLens State
  const [activeProfileLabel, setActiveProfileLabel] = useState('Pest Control');
  const [searchMode, setSearchMode] = useState('Strict');

  useFocusEffect(useCallback(() => {
    (async () => {
      // Use sync API for instant territory load
      const zips = await loadMyZips();
      const shared = await loadSharedTerritories();
      const rawLeads = AsyncStorage.getJSONSync(LEADS_STORAGE_KEY, []);
      const rawGoals = AsyncStorage.getJSONSync(GOALS_STORAGE_KEY, {});
      const profileVal = AsyncStorage.getSync(TARGET_LENS_PROFILES_KEY);
      const modeVal = AsyncStorage.getSync(TARGET_LENS_SEARCH_MODE_KEY);
      const goal = Math.max(1, Number(rawGoals?.dailyProspects) || 10);
      setDailyGoal(goal);
      setMyZips(zips);
      setSharedTerritories(shared);
      setLeads(rawLeads);
      setZipActivity(buildZipActivity(zips, rawLeads));
      setMatchedLeads(matchLeadsToTerritory(rawLeads, zips));

      if (profileVal) {
        try {
          const profile = JSON.parse(profileVal);
          setActiveProfileLabel(profile.label || 'Pest Control');
        } catch (err) {
          console.warn('[TerritoryManager] Failed to parse profile:', err?.message || String(err));
          setActiveProfileLabel('Pest Control');
        }
      } else {
        setActiveProfileLabel('Pest Control');
      }

      if (modeVal) {
        setSearchMode(modeVal);
      }
    })();
  }, []));

  const refreshData = async (zips, rawLeads = leads) => {
    setMyZips(zips);
    setZipActivity(buildZipActivity(zips, rawLeads));
    setMatchedLeads(matchLeadsToTerritory(rawLeads, zips));

    // Auto-sync territory to Supabase
    try {
      const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : null;
      const supabase = createSupabaseClient(settings);
      if (supabase) {
        await syncTerritoryToSupabase(supabase, user, zips);
        console.log('[Territory] Auto-sync successful');
      }
    } catch (err) {
      console.warn('[Territory] Auto-sync failed:', err.message);
    }
  };

  // ─── Add ZIP manually ───────────────────────────────────────────────────────

  const handleAddManual = async () => {
    const zip = normalizeZipEntry(manualZip);
    if (!isValidZip(zip)) {
      showThemedAlert('Invalid ZIP', 'Please enter a valid 5-digit ZIP code.');
      return;
    }
    if (myZips.find(z => z.zip === zip)) {
      showThemedAlert('Duplicate', `ZIP ${zip} is already in your territory.`);
      return;
    }
    const updated = [...myZips, buildZipEntry(zip)];
    console.log('[Territory] Saving zips:', updated.map(z => z.zip).join(', '));
    await saveMyZips(updated);
    console.log('[Territory] Zips saved to storage');
    BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'zip_added', screen: 'TerritoryManagerScreen' });
    await refreshData(updated);
    setManualZip('');
  };

  // ─── Remove ZIP ─────────────────────────────────────────────────────────────

  const handleRemoveZip = (zip) => {
    showThemedAlert('Remove ZIP', `Remove ${zip} from your territory?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = myZips.filter(z => z.zip !== zip);
          console.log('[Territory] Removing zip:', zip, '- Updated list:', updated.map(z => z.zip).join(', '));
          await saveMyZips(updated);
          console.log('[Territory] Zips saved after removal');
          await refreshData(updated);
        },
      },
    ]);
  };

  // ─── Import from Excel/CSV ──────────────────────────────────────────────────

  const handleImportSpreadsheet = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'application/vnd.ms-excel', 'text/csv', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading file...');

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Extract anything that looks like a ZIP from all cells
      const rawZips = [];
      for (const row of rows) {
        for (const cell of row) {
          const val = String(cell || '').trim();
          const digits = val.replace(/\D/g, '').slice(0, 5);
          if (digits.length === 5) rawZips.push(digits);
        }
      }

      const { valid, duplicates, invalid } = validateZipBatch(rawZips, myZips);
      if (!valid.length) {
        showThemedAlert('No new ZIPs found', `${duplicates.length} duplicates skipped, ${invalid.length} invalid entries ignored.`);
        return;
      }

      const newEntries = valid.map(z => buildZipEntry(z));
      const updated = [...myZips, ...newEntries];
      console.log('[Territory] Importing zips:', valid.join(', '));
      await saveMyZips(updated);
      console.log('[Territory] Imported zips saved to storage');
      await refreshData(updated);

      setStatusText('');
      showThemedAlert(
        'Import complete',
        `${valid.length} ZIP(s) added.${duplicates.length ? ` ${duplicates.length} duplicate(s) skipped.` : ''}${invalid.length ? ` ${invalid.length} invalid entries ignored.` : ''}`
      );
    } catch (err) {
    BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not read file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Import from Photo/OCR ──────────────────────────────────────────────────

  const handleImportPhoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showThemedAlert('Permission required', 'Photo library access is needed to import from an image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        base64: false,
      });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading ZIPs from image...');

      // Resize and compress the imported image before converting to base64
      let processedUri = result.assets[0].uri;
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
        );
        processedUri = manipulated.uri;
      } catch (manipErr) {
        console.warn('[TerritoryManager] Image manipulation failed:', manipErr);
      }

      const b64 = await FileSystem.readAsStringAsync(processedUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Use Claude to extract ZIP codes from the image
      let extractedLeads = [];
      try {
        extractedLeads = await extractLeadsFromImage(b64, 'image/jpeg');
      } catch (err) {
        showThemedAlert('Extraction Error', 'Extraction failed. Please try again.');
        throw err;
      }
      const rawZips = [];

      // Pull ZIPs from extracted lead data
      for (const lead of extractedLeads) {
        if (lead.zip) rawZips.push(lead.zip);
      }

      // Also scan raw text for 5-digit patterns using a prompt focused on ZIPs
      // The image may be a territory map, spreadsheet screenshot, or list
      if (!rawZips.length) {
        showThemedAlert('No ZIPs found', 'Could not detect any ZIP codes in that image. Try a clearer photo or use the spreadsheet import instead.');
        return;
      }

      const { valid, duplicates, invalid } = validateZipBatch(rawZips, myZips);
      if (!valid.length) {
        showThemedAlert('No new ZIPs', `${duplicates.length} duplicates, ${invalid.length} invalid entries found.`);
        return;
      }

      const newEntries = valid.map(z => buildZipEntry(z));
      const updated = [...myZips, ...newEntries];
      await saveMyZips(updated);
      await refreshData(updated);

      showThemedAlert('Import complete', `${valid.length} ZIP(s) added from image.`);
    } catch (err) {
    BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not read image.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Supabase Sync ──────────────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true);
    try {
      const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : null;
      const supabase = createSupabaseClient(settings);

      const [syncRes, sharedRes] = await Promise.all([
        syncTerritoryToSupabase(supabase, user, myZips),
        fetchSharedTerritories(supabase, user),
      ]);

      if (sharedRes.ok) {
        await saveSharedTerritories(sharedRes.data);
        setSharedTerritories(sharedRes.data);
      }

      if (!syncRes.ok) {
        showThemedAlert('Sync issue', syncRes.reason || 'Could not sync territory to Supabase.');
      } else {
        showThemedAlert('Synced ✓', `Your territory is saved. ${sharedRes.data?.length ? `${sharedRes.data.length} other rep territory(s) loaded.` : 'No other rep territories found yet.'}`);
      }
    } catch (err) {
    BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Sync failed', err.message || 'Unknown error');
    } finally {
      setSyncing(false);
    }
  };

  // ─── Render Tabs ────────────────────────────────────────────────────────────

  const renderHeatMap = () => (
    <View>
      {/* Active Profile Info */}
      <View style={s.profileStatusBox}>
        <Text style={s.profileStatusLabel}>Active TargetLens™ Focus</Text>
        <Text style={s.profileStatusValue}>{activeProfileLabel}</Text>
        {activeProfileLabel !== 'Pest Control' && (
          <View style={s.modeBadge}>
            <Text style={s.modeBadgeText}>{searchMode} Mode</Text>
          </View>
        )}
      </View>

      <Card style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryItem}>
            <Text style={s.summaryNum}>{myZips.length}</Text>
            <Text style={s.summaryLabel}>ZIPs</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={s.summaryNum}>{zipActivity.reduce((sum, z) => sum + (z.prospectCount90d || 0), 0)}</Text>
            <Text style={s.summaryLabel}>Prospects 90d</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={s.summaryNum}>{zipActivity.filter(z => z.heatLevel === 'high').length}</Text>
            <Text style={s.summaryLabel}>Hot ZIPs</Text>
          </View>
        </View>
        <Text style={s.benchmarkNote}>90-day rolling count · {dailyGoal} prospects/day goal</Text>
      </Card>

      <TouchableOpacity
        style={s.mapBtn}
        onPress={() => navigation.navigate('TerritoryMap', { user })}
        activeOpacity={0.85}
      >
        <Text style={s.mapBtnIcon}>🗺️</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.mapBtnTitle}>View Live Map</Text>
          <Text style={s.mapBtnSub}>Color-coded ZIP boundaries with team territories</Text>
        </View>
        <Text style={s.mapBtnArrow}>→</Text>
      </TouchableOpacity>

      <View style={s.legendRow}>
        {[
          ['on-target', '10+/day'],
          ['warm',      '7-9/day'],
          ['light',     '3-6/day'],
          ['cold',      '1-2/day'],
          ['inactive',  'None this week'],
        ].map(([level, label]) => {
          const colors = getHeatColor(level);
          return (
            <View key={level} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: colors.text }]} />
              <Text style={s.legendLabel}>{label}</Text>
            </View>
          );
        })}
      </View>

      {zipActivity.length === 0 ? (
        <Text style={s.empty}>No ZIPs assigned yet.{'\n'}Add ZIPs in the My ZIPs tab.</Text>
      ) : (
        <View style={s.heatGrid}>
          {zipActivity.map(item => {
            const level = item.heatLevel || getHeatLevel(item.prospectCount90d || 0);
            const colors = getHeatColor(level);
            return (
              <PulsingZipTile
                key={item.zip}
                item={item}
                colors={colors}
                level={level}
              />
            );
          })}
        </View>
      )}
    </View>
  );

  const renderMyZips = () => (
    <View>
      <Card>
        <Text style={s.fieldLabel}>Add ZIP Code</Text>
        <View style={s.zipInputRow}>
          <TextInput
            style={s.zipInput}
            value={manualZip}
            onChangeText={setManualZip}
            placeholder="Enter 5-digit ZIP"
            placeholderTextColor={COLORS.muted}
            keyboardType="numeric"
            maxLength={5}
            returnKeyType="done"
            onSubmitEditing={handleAddManual}
          />
          <TouchableOpacity style={s.addBtn} onPress={handleAddManual}>
            <Text style={s.addBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={s.importRow}>
          <TouchableOpacity style={s.importBtn} onPress={handleImportSpreadsheet}>
            <Text style={s.importIcon}>📊</Text>
            <Text style={s.importLabel}>Import from Spreadsheet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.importBtn} onPress={handleImportPhoto}>
            <Text style={s.importIcon}>📷</Text>
            <Text style={s.importLabel}>Import from Photo</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {myZips.length === 0 ? (
        <Text style={s.empty}>No ZIPs in your territory yet.</Text>
      ) : (
        <>
          <Text style={s.zipCount}>{myZips.length} ZIP{myZips.length !== 1 ? 's' : ''} in your territory</Text>
          {myZips.map(entry => {
            const activity = zipActivity.find(a => a.zip === entry.zip);
            const level = activity?.heatLevel || 'none';
            const colors = getHeatColor(level);
            return (
              <View key={entry.zip} style={[s.zipRow, { borderLeftColor: colors.text, borderLeftWidth: 3 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.zipRowCode}>{entry.zip}</Text>
                  {!!entry.notes && <Text style={s.zipRowNotes}>{entry.notes}</Text>}
                  <Text style={s.zipRowMeta}>{activity?.prospectCount90d || 0} prospects · {activity?.weeklyCount || 0} this wk · Added {new Date(entry.addedAt).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveZip(entry.zip)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={s.zipRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </>
      )}

      <SecondaryButton
        title={syncing ? 'Syncing...' : 'Sync Territory to Supabase'}
        onPress={handleSync}
        disabled={syncing}
        style={{ marginTop: 16 }}
      />
    </View>
  );

  const renderLeads = () => (
    <View>
      <Card style={{ marginBottom: 12 }}>
        <Text style={s.leadsIntro}>
          {matchedProspects.length
            ? `${matchedProspects.length} lead${matchedProspects.length !== 1 ? 's' : ''} captured in your territory ZIPs.`
            : 'No prospects in queue match your territory ZIPs yet.'}
        </Text>
      </Card>
      {matchedProspects.map((lead, idx) => {
        return (
          <TouchableOpacity
            key={lead.id || idx}
            style={s.leadRow}
            onPress={() => navigation.navigate('Review', { user, lead, editIdx: null })}
            activeOpacity={0.7}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.leadBiz}>{lead.businessName || 'Unnamed Business'}</Text>
              <Text style={s.leadSub}>
                {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
                {lead.zip ? ` · ZIP ${lead.zip}` : ''}
              </Text>
            </View>
            <Text style={[s.leadZipBadge, { color: COLORS.accent, borderColor: COLORS.accent }]}>{lead.zip}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderTeam = () => (
    <View>
      <Card style={{ marginBottom: 12 }}>
        <Text style={s.leadsIntro}>
          Team territory sharing is not enabled for private beta.
        </Text>
      </Card>
    </View>
  );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="Territory Manager" onBack={() => navigation.goBack()} />

      <View style={s.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {activeTab === 'Heat Map' && renderHeatMap()}
        {activeTab === 'My ZIPs' && renderMyZips()}
        {activeTab === 'Leads' && renderLeads()}
        {activeTab === 'Team' && renderTeam()}
      </ScrollView>

      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={s.loadingText}>{statusText || 'Processing...'}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },

  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.accent },
  tabText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: COLORS.accent },

  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.3)', borderRadius: 14,
    padding: 14, marginTop: 12,
    position: 'relative', overflow: 'hidden',
  },
  mapBtnIcon: { fontSize: 24 },
  mapBtnTitle: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  mapBtnSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  mapBtnArrow: { color: COLORS.accent, fontSize: 18, fontWeight: '700' },
  benchmarkNote: { color: COLORS.muted, fontSize: 11, textAlign: 'center', marginTop: 10 },

  summaryCard: { marginTop: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryItem: { alignItems: 'center' },
  summaryNum: { fontSize: 28, fontWeight: '900', color: COLORS.accent },
  summaryLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2, letterSpacing: 0.5 },
  summaryDivider: { width: 1, height: 40, backgroundColor: COLORS.border },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { color: COLORS.muted, fontSize: 11 },

  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  heatCell: {
    width: '30%', borderRadius: 14, borderWidth: 1.5,
    padding: 12, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', position: 'relative',
  },
  heatGlow: {
    position: 'absolute', top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 18, borderWidth: 2,
  },
  heatZip: { fontSize: 14, fontWeight: '800', zIndex: 1 },
  heatCount: { fontSize: 22, fontWeight: '900', marginTop: 4, zIndex: 1 },
  heatLeadLabel: { fontSize: 10, color: COLORS.muted, marginTop: 1, zIndex: 1 },
  heatWeekly: { fontSize: 10, fontWeight: '600', marginTop: 3, zIndex: 1 },
  heatLevelLabel: {
    fontSize: 9, fontWeight: '700', marginTop: 4,
    textTransform: 'uppercase', letterSpacing: 0.8, zIndex: 1,
  },

  fieldLabel: {
    color: COLORS.label, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
  },
  zipInputRow: { flexDirection: 'row', gap: 10 },
  zipInput: {
    flex: 1, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 16,
  },
  addBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: 10, paddingHorizontal: 20, justifyContent: 'center',
  },
  addBtnText: { color: COLORS.accent, fontWeight: '800', fontSize: 15 },
  importRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  importBtn: {
    flex: 1, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, padding: 12, alignItems: 'center', gap: 6,
  },
  importIcon: { fontSize: 22 },
  importLabel: { color: COLORS.muted, fontSize: 11, textAlign: 'center' },

  zipCount: { color: COLORS.muted, fontSize: 11, marginTop: 14, marginBottom: 6, letterSpacing: 0.5 },
  zipRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  zipRowCode: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  zipRowNotes: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  zipRowMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4 },
  zipRemove: { color: COLORS.danger, fontSize: 16, fontWeight: '700', paddingLeft: 12 },

  leadsIntro: { color: COLORS.textDim, fontSize: 13, lineHeight: 19 },
  leadRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  leadBiz: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  leadSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  leadZipBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },

  repCard: { marginBottom: 10 },
  repName: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  repMeta: { color: COLORS.muted, fontSize: 12, marginTop: 2, marginBottom: 10 },
  repZipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  repZipChip: {
    backgroundColor: 'rgba(107,114,128,0.1)', borderWidth: 1, borderColor: 'rgba(107,114,128,0.2)',
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5,
  },
  repZipText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },

  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 32, lineHeight: 20 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,15,0.94)',
    alignItems: 'center', justifyContent: 'center',
  },
  loadingText: { color: COLORS.textDim, marginTop: 12, fontSize: 14 },
});