import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity,
  StyleSheet, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated, Linking,
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
import { extractAddressListFromDocument } from '../services/extractProspectAI';
import { createSupabaseClient } from '../utils/supabaseClient';
import {
  loadMyZips, saveMyZips, loadSharedTerritories, saveSharedTerritories,
  buildZipEntry, validateZipBatch, buildZipActivity, getHeatLevel, getHeatColor,
  GOALS_STORAGE_KEY,
  matchLeadsToTerritory, syncTerritoryToSupabase, fetchSharedTerritories,
  fetchMyTerritoryFromSupabase,
  normalizeZipEntry, isValidZip, getHeatLabel,
  deleteTerritoryZipsFromSupabase, publishBranchRoster,
} from '../utils/territoryUtils';
import { TARGET_LENS_PROFILES_KEY, TARGET_LENS_SEARCH_MODE_KEY } from '../constants';
import { showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';
import { parseZipRosterAOA, matchRepZips, getDistinctRepNames } from '../utils/zipRosterImport';
import {
  parseAddressListAOA, geocodeAddressEntries, buildLeadFromGeocodedEntry,
  filterEntriesByTerritory,
} from '../utils/addressListImport';
import { getCurrentCoords } from '../utils/geoEnrich';

const TABS = ['Heat Map', 'My ZIPs', 'Lists', 'Leads', 'Team'];

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
        {item.weeklyAvg90d ?? 0}/wk avg
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
  const [pendingListEntries, setPendingListEntries] = useState(null); // parsed, unnamed import awaiting a list name
  const [listNameInput, setListNameInput] = useState('');

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

  const refreshData = async (zips, rawLeads = leads, removedZips = []) => {
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
        if (removedZips.length) {
          await deleteTerritoryZipsFromSupabase(supabase, removedZips);
        }
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
          await refreshData(updated, leads, [zip]);
        },
      },
    ]);
  };

  // ─── Import from Excel/CSV ──────────────────────────────────────────────────

  const handleImportSpreadsheet = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
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

  // ─── Import Team ZIP Roster (multi-rep, matches by name) ──────────────

  const handleImportZipRoster = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading roster...');

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });

      const entries = parseZipRosterAOA(aoa);
      if (!entries.length) {
        showThemedAlert('No roster data found', 'Could not detect any ZIP/rep name pairs in this file.');
        return;
      }

      const repFirstName = String(user?.repName || '').trim().split(/\s+/)[0] || '';
      const { matched, matchType } = matchRepZips(entries, repFirstName);

      if (!matched.length) {
        const distinct = getDistinctRepNames(entries);
        showThemedAlert(
          'No match found',
          `Could not find "${repFirstName}" in this roster. Names found in file: ${distinct.join(', ') || 'none'}.`
        );
        return;
      }

      const zips = [...new Set(matched.map(m => m.zip))];

      showThemedAlert(
        'Confirm Import',
        `Found ${zips.length} ZIP${zips.length !== 1 ? 's' : ''} for "${repFirstName}"${matchType === 'loose' ? ' (partial name match — please verify)' : ''}:\n\n${zips.slice(0, 15).join(', ')}${zips.length > 15 ? `, +${zips.length - 15} more` : ''}\n\nAdd these to your territory?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Add ZIPs',
            onPress: async () => {
              const { valid, duplicates } = validateZipBatch(zips, myZips);
              if (!valid.length) {
                showThemedAlert('Nothing to add', `All ${duplicates.length} matched ZIP(s) are already in your territory.`);
                return;
              }
              const newEntries = valid.map(z => buildZipEntry(z));
              const updated = [...myZips, ...newEntries];
              await saveMyZips(updated);
              await refreshData(updated);
              BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'roster_import', screen: 'TerritoryManagerScreen' });
              showThemedAlert(
                'Roster import complete',
                `${valid.length} ZIP(s) added for ${repFirstName}.${duplicates.length ? ` ${duplicates.length} already in your territory.` : ''}`
              );
            },
          },
        ]
      );
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not read roster file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Publish full roster so same-branch reps appear on the map (read-only) ──

  const handlePublishBranchRoster = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading roster...');

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });

      const entries = parseZipRosterAOA(aoa);
      if (!entries.length) {
        showThemedAlert('No roster data found', 'Could not detect any ZIP/rep name pairs in this file.');
        return;
      }

      const zipCount = new Set(entries.map((e) => e.zip)).size;
      const repCount = getDistinctRepNames(entries).length;

      showThemedAlert(
        'Publish Branch Roster',
        `Share ${zipCount} ZIP${zipCount !== 1 ? 's' : ''} across ${repCount} rep${repCount !== 1 ? 's' : ''} with reps in your branch? They will see these as read-only gray areas on the Territory Map. This replaces any roster already published for your branch.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Publish',
            onPress: async () => {
              setLoading(true);
              setStatusText('Publishing roster...');
              try {
                const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
                const settings = raw ? JSON.parse(raw) : null;
                const supabase = createSupabaseClient(settings);
                const res = await publishBranchRoster(supabase, user, entries);
                if (res.ok) {
                  BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'publish_branch_roster', screen: 'TerritoryManagerScreen' });
                  showThemedAlert('Roster published', `${res.count} ZIP assignment${res.count !== 1 ? 's' : ''} are now visible to your branch.`);
                } else if (res.reason === 'no-branch') {
                  showThemedAlert('Branch number missing', 'Your profile has no branch number, so the roster cannot be scoped to a branch. Add it in your profile and try again.');
                } else {
                  showThemedAlert('Publish failed', res.reason || 'Could not publish the roster.');
                }
              } catch (pubErr) {
                showThemedAlert('Publish failed', pubErr?.message || 'Could not publish the roster.');
              } finally {
                setLoading(false);
                setStatusText('');
              }
            },
          },
        ]
      );
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not read roster file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Remove ZIPs belonging to other reps (recovery from a bad full-file import) ──

  const handleCleanupOtherRepZips = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading roster...');

      const b64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });

      const entries = parseZipRosterAOA(aoa);
      if (!entries.length) {
        showThemedAlert('No roster data found', 'Could not detect any ZIP/rep name pairs in this file.');
        return;
      }

      const repFirstName = String(user?.repName || '').trim().split(/\s+/)[0] || '';
      const targetLower = repFirstName.toLowerCase();

      // ZIPs the roster explicitly assigns to someone else
      const otherRepZips = new Set(
        entries
          .filter(e => e.repName.trim().toLowerCase() !== targetLower)
          .map(e => e.zip)
      );

      const toRemove = myZips.filter(z => otherRepZips.has(z.zip));
      if (!toRemove.length) {
        showThemedAlert('Nothing to remove', 'None of your current ZIPs are attributed to another rep in this roster.');
        return;
      }

      showThemedAlert(
        "Remove Other Reps' ZIPs",
        `Found ${toRemove.length} ZIP(s) in your territory that this roster attributes to another rep:\n\n${toRemove.map(z => z.zip).slice(0, 15).join(', ')}${toRemove.length > 15 ? `, +${toRemove.length - 15} more` : ''}\n\nAnything not in this roster, or listed under your own name, is left untouched. Remove these?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              const removeSet = new Set(toRemove.map(z => z.zip));
              const updated = myZips.filter(z => !removeSet.has(z.zip));
              await saveMyZips(updated);
              await refreshData(updated, leads, [...removeSet]);
              BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'cleanup_other_rep_zips', screen: 'TerritoryManagerScreen' });
              showThemedAlert('Cleanup complete', `${toRemove.length} ZIP(s) removed.`);
            },
          },
        ]
      );
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Cleanup failed', err.message || 'Could not read roster file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Shared file-type detection for address-list imports ────────────────
  // Routes a picked file to the right extraction path: Excel/CSV parses
  // locally; PDFs and images go through Claude document/vision extraction
  // via extract-prospect's 'address-list' mode. Word docs aren't
  // supported — Claude has no native .docx input — so the rep is asked
  // to save/export as PDF first instead.

  const parseAddressSourceFile = async (asset) => {
    const name = String(asset.name || asset.uri || '').toLowerCase();
    const mimeType = String(asset.mimeType || '').toLowerCase();

    const isExcelOrCsv = /\.(xlsx|xls|csv)$/.test(name) ||
      mimeType.includes('spreadsheet') || mimeType.includes('csv') || mimeType.includes('excel');
    const isPdf = /\.pdf$/.test(name) || mimeType === 'application/pdf';
    const isImage = mimeType.startsWith('image/') || /\.(png|jpe?g|heic|webp)$/.test(name);
    const isWordDoc = /\.docx?$/.test(name) || mimeType.includes('word') || mimeType.includes('officedocument.wordprocessingml');

    if (isWordDoc) {
      throw new Error("Word documents aren't supported yet. Please save or export the file as a PDF first, then import that instead.");
    }

    if (isExcelOrCsv) {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });
      return parseAddressListAOA(aoa);
    }

    if (isPdf) {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      return await extractAddressListFromDocument({
        pdfBase64: b64,
        context: 'Bulk address list import for LeadLens territory/route planning.',
      });
    }

    if (isImage) {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      return await extractAddressListFromDocument({
        imageBase64: b64,
        mimeType: mimeType || 'image/jpeg',
        context: 'Bulk address list import for LeadLens territory/route planning.',
      });
    }

    // Unknown/unset mimeType — try Excel/CSV parsing as a last resort
    // (some pickers don't set mimeType reliably), then fail clearly.
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const wb = read(b64, { type: 'base64' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = utils.sheet_to_json(ws, { header: 1, defval: '' });
      const entries = parseAddressListAOA(aoa);
      if (entries.length) return entries;
    } catch (_err) {
      // fall through to the error below
    }
    throw new Error('Unrecognized file type. Please upload an Excel/CSV file, a PDF, or a photo/screenshot.');
  };

  // ─── Import Address List (map-only, private "CVS"-style lists) ─────────
  // Unlike Import Addresses for Route / Import Territory Opportunities above,
  // this does NOT filter to the rep's assigned ZIPs (a national-account list may
  // legitimately include addresses outside current territory) and does NOT add
  // anything to the Prospect Queue automatically -- it's purely a toggleable map
  // layer. A rep adds individual items to the queue later, from the map, as needed.
  // Reuses parseAddressSourceFile as-is, so Excel/CSV, PDF, and photo imports all
  // work here for free, exactly like the two flows above.

  const handleImportAddressList = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading file...');

      let entries;
      try {
        entries = await parseAddressSourceFile(result.assets[0]);
      } catch (parseErr) {
        showThemedAlert('Could not read file', parseErr.message || 'Please check the file and try again.');
        return;
      }

      if (!entries.length) {
        showThemedAlert('No addresses found', 'Could not detect any addresses in this file.');
        return;
      }

      // Parsed successfully -- now ask what to call this list (per the confirmed
      // flow: name comes AFTER parsing, not before picking the file).
      setPendingListEntries(entries);
      setListNameInput('');
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not read address file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  const handleConfirmListImport = async () => {
    const name = listNameInput.trim();
    const entries = pendingListEntries;
    if (!name) {
      showThemedAlert('Name required', 'Give this list a name (e.g. "CVS") before importing.');
      return;
    }
    if (!entries || !entries.length) {
      setPendingListEntries(null);
      return;
    }

    setPendingListEntries(null);
    setLoading(true);
    setStatusText(`Importing "${name}"...`);

    try {
      const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : null;
      const supabase = createSupabaseClient(settings);

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (sessionError || !accessToken) {
        showThemedAlert('Not signed in', 'Could not verify your session. Please sign in again and retry.');
        return;
      }
      if (!settings?.url) {
        showThemedAlert('Import failed', 'Supabase URL not found in settings.');
        return;
      }

      const rows = entries.map((e) => ({
        businessName: e.businessName || '',
        address: e.rawAddress || '',
      }));

      const MAX_ROWS_PER_CALL = 500; // matches the Edge Function's own cap
      let totalInserted = 0, totalCensus = 0, totalGoogle = 0, totalFailed = 0;

      for (let i = 0; i < rows.length; i += MAX_ROWS_PER_CALL) {
        const chunk = rows.slice(i, i + MAX_ROWS_PER_CALL);
        setStatusText(`Importing "${name}"... ${i + chunk.length} of ${rows.length}`);

        const res = await fetch(`${settings.url}/functions/v1/import-address-list`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listName: name, rows: chunk }),
        });
        const resultJson = await res.json().catch(() => null);

        if (!res.ok || !resultJson?.ok) {
          showThemedAlert(
            'Import incomplete',
            `${totalInserted} of ${rows.length} address(es) imported before an error: ${resultJson?.error || `HTTP ${res.status}`}`
          );
          return;
        }

        totalInserted += resultJson.inserted || 0;
        totalCensus += resultJson.geocodedViaCensus || 0;
        totalGoogle += resultJson.geocodedViaGoogle || 0;
        totalFailed += resultJson.geocodeFailed || 0;
      }

      BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'import_address_list', screen: 'TerritoryManagerScreen' });
      showThemedAlert(
        'List imported',
        `${totalInserted} address${totalInserted !== 1 ? 'es' : ''} added to "${name}".${totalFailed ? ` ${totalFailed} could not be located and were skipped.` : ''} Toggle it on from the Territory Map to view.`
      );
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not import this list.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Import Addresses for Route (#19) ───────────────────────────────────
  // Accepts Excel/CSV, PDF, or a photo/screenshot. Filters to this rep's
  // assigned territory (same as the Opportunities import), geocodes the
  // matches, adds all successfully-located ones to the Prospect Queue
  // (they'll need exporting eventually either way), then hands off to
  // RoutePreviewScreen to plot the route on the map — where the rep can
  // save it for later or run it now (Google Maps for the actual drive).

  const handleImportRoute = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading file...');

      let entries;
      try {
        entries = await parseAddressSourceFile(result.assets[0]);
      } catch (parseErr) {
        showThemedAlert('Could not read file', parseErr.message || 'Please check the file and try again.');
        return;
      }

      if (!entries.length) {
        showThemedAlert('No addresses found', 'Could not detect any addresses in this file.');
        return;
      }

      const { matched, unmatched } = filterEntriesByTerritory(entries, myZips);
      if (!matched.length) {
        const noZipCount = unmatched.filter((e) => !e.zip).length;
        showThemedAlert(
          'No matches in your territory',
          `None of the ${entries.length} address(es) in this file fall within your assigned ZIP codes.${noZipCount ? ` ${noZipCount} had no detectable ZIP in the address text.` : ''}`
        );
        return;
      }

      setStatusText(`Geocoding ${matched.length} matched address(es)...`);
      const geocoded = await geocodeAddressEntries(matched, ({ current, total }) => {
        setStatusText(`Geocoding ${current} of ${total}...`);
      });

      const successful = geocoded.filter((g) => g.success);
      if (!successful.length) {
        showThemedAlert('No addresses geocoded', 'None of the addresses in this file could be located. Check the file format and try again.');
        return;
      }

      const newLeads = successful.map(buildLeadFromGeocodedEntry);
      const currentQueue = AsyncStorage.getJSONSync(LEADS_STORAGE_KEY, []);
      await AsyncStorage.setJSON(LEADS_STORAGE_KEY, [...currentQueue, ...newLeads]);

      setStatusText('Finding your location...');
      const coords = await Promise.race([
        getCurrentCoords(),
        new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
      ]).catch(() => null);

      setLoading(false);
      setStatusText('');

      const skippedOutOfTerritory = entries.length - matched.length;
      const failedCount = geocoded.length - successful.length;
      BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'route_import', screen: 'TerritoryManagerScreen' });

      if (!coords) {
        showThemedAlert(
          'Addresses added',
          `${successful.length} address${successful.length !== 1 ? 'es' : ''} added to your queue.${skippedOutOfTerritory ? ` ${skippedOutOfTerritory} outside your territory skipped.` : ''}${failedCount ? ` ${failedCount} could not be located.` : ''}\n\nCould not get your current location to preview the route.`
        );
        return;
      }

      navigation.navigate('RoutePreview', {
        stops: successful,
        startCoords: coords,
        sourceLabel: `Route Import — ${successful.length} stop${successful.length !== 1 ? 's' : ''}`,
      });
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not process the address file.');
    } finally {
      setLoading(false);
      setStatusText('');
    }
  };

  // ─── Import Territory-Filtered Opportunities (#23) ──────────────────────
  // Accepts Excel/CSV, PDF, or a photo/screenshot. Filters the parsed list
  // down to only addresses whose ZIP falls inside this rep's assigned
  // territory before geocoding — cheaper, and avoids wasting Nominatim
  // calls on addresses that will be discarded. Matched addresses are
  // added to the queue, then routing (via RoutePreviewScreen) is offered.

  const handleImportOpportunities = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;

      setLoading(true);
      setStatusText('Reading file...');

      let entries;
      try {
        entries = await parseAddressSourceFile(result.assets[0]);
      } catch (parseErr) {
        showThemedAlert('Could not read file', parseErr.message || 'Please check the file and try again.');
        return;
      }

      if (!entries.length) {
        showThemedAlert('No addresses found', 'Could not detect any addresses in this file.');
        return;
      }

      const { matched, unmatched } = filterEntriesByTerritory(entries, myZips);
      if (!matched.length) {
        const noZipCount = unmatched.filter((e) => !e.zip).length;
        showThemedAlert(
          'No matches in your territory',
          `None of the ${entries.length} address(es) in this file fall within your assigned ZIP codes.${noZipCount ? ` ${noZipCount} had no detectable ZIP in the address text.` : ''}`
        );
        return;
      }

      setStatusText(`Geocoding ${matched.length} matched address(es)...`);
      const geocoded = await geocodeAddressEntries(matched, ({ current, total }) => {
        setStatusText(`Geocoding ${current} of ${total}...`);
      });

      const successful = geocoded.filter((g) => g.success);
      const newLeads = successful.map(buildLeadFromGeocodedEntry);
      const currentQueue = AsyncStorage.getJSONSync(LEADS_STORAGE_KEY, []);
      await AsyncStorage.setJSON(LEADS_STORAGE_KEY, [...currentQueue, ...newLeads]);

      setLoading(false);
      setStatusText('');

      const skippedOutOfTerritory = entries.length - matched.length;
      BetaTracker.track('feature_use', { feature: 'TerritoryManager', action: 'opportunity_import', screen: 'TerritoryManagerScreen' });
      showThemedAlert(
        'Opportunities added',
        `${newLeads.length} address${newLeads.length !== 1 ? 'es' : ''} in your territory added to your queue.${skippedOutOfTerritory ? ` ${skippedOutOfTerritory} outside your territory skipped.` : ''}\n\nWould you like to route these too?`,
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Route Them',
            onPress: async () => {
              setLoading(true);
              setStatusText('Finding your location...');
              const coords = await Promise.race([
                getCurrentCoords(),
                new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
              ]).catch(() => null);
              setLoading(false);
              setStatusText('');

              if (!coords) {
                showThemedAlert('Location unavailable', 'Could not get your current location to build a route.');
                return;
              }

              navigation.navigate('RoutePreview', {
                stops: successful,
                startCoords: coords,
                sourceLabel: `Opportunity Route — ${successful.length} stop${successful.length !== 1 ? 's' : ''}`,
              });
            },
          },
        ]
      );
    } catch (err) {
      BetaTracker.crash('TerritoryManagerScreen', err);
      showThemedAlert('Import failed', err.message || 'Could not process the opportunity file.');
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
        <Text style={s.benchmarkNote}>90-day rolling count · {dailyGoal}/day goal ({dailyGoal * 7}/wk)</Text>
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

        <Text style={s.sectionLabel}>Import ZIPs</Text>
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

        <Text style={s.sectionLabel}>Team & Branch</Text>
        <View style={s.importRow}>
          <TouchableOpacity style={s.importBtn} onPress={handleImportZipRoster}>
            <Text style={s.importIcon}>👥</Text>
            <Text style={s.importLabel}>Import Team ZIP Roster</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.importBtn} onPress={handlePublishBranchRoster}>
            <Text style={s.importIcon}>📡</Text>
            <Text style={s.importLabel}>Publish Roster to Branch Map</Text>
          </TouchableOpacity>
        </View>
        <View style={s.importRow}>
          <TouchableOpacity style={[s.importBtn, { borderColor: COLORS.danger || '#CC1040' }]} onPress={handleCleanupOtherRepZips}>
            <Text style={s.importIcon}>🧹</Text>
            <Text style={[s.importLabel, { color: COLORS.danger || '#CC1040' }]}>Remove Other Reps' ZIPs</Text>
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
                  <Text style={s.zipRowMeta}>{activity?.prospectCount90d || 0} prospects (90d) · {activity?.weeklyAvg90d ?? 0}/wk avg · Added {new Date(entry.addedAt).toLocaleDateString()}</Text>
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

  const renderLists = () => (
    <View>
      <Card>
        <Text style={s.sectionLabel}>Route & Territory Imports</Text>
        <Text style={s.sectionHint}>
          These add matched addresses straight to your Prospect Queue.
        </Text>
        <View style={s.importRow}>
          <TouchableOpacity style={s.importBtn} onPress={handleImportRoute}>
            <Text style={s.importIcon}>🗺️</Text>
            <Text style={s.importLabel}>Import Addresses for Route</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.importBtn} onPress={handleImportOpportunities}>
            <Text style={s.importIcon}>🎯</Text>
            <Text style={s.importLabel}>Import Territory Opportunities</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.sectionLabel, { marginTop: 18 }]}>Named Address Lists</Text>
        <Text style={s.sectionHint}>
          Import a list (e.g. "CVS") to view as a toggleable layer on the Territory Map. Nothing is added to your queue automatically -- add individual addresses from the map as needed.
        </Text>
        <View style={s.importRow}>
          <TouchableOpacity style={s.importBtn} onPress={handleImportAddressList}>
            <Text style={s.importIcon}>🏬</Text>
            <Text style={s.importLabel}>Import Address List (e.g. CVS)</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Name-this-list prompt -- a plain absolute-positioned overlay, NOT React
          Native's Modal component (project-wide rule: no Modal anywhere in the app,
          see TerritoryMapScreen's TargetLens selector for the same pattern). */}
      {!!pendingListEntries && (
        <View style={s.namePromptOverlay} pointerEvents="box-none">
          <TouchableOpacity
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            activeOpacity={1}
            onPress={() => setPendingListEntries(null)}
          />
          <View style={s.namePromptCard}>
            <Text style={s.namePromptTitle}>Name this list</Text>
            <Text style={s.namePromptSubtitle}>
              {pendingListEntries.length} address{pendingListEntries.length !== 1 ? 'es' : ''} found. This name is how you'll toggle it on the map later.
            </Text>
            <TextInput
              style={s.namePromptInput}
              value={listNameInput}
              onChangeText={setListNameInput}
              placeholder='e.g. "CVS"'
              placeholderTextColor={COLORS.muted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirmListImport}
            />
            <View style={s.namePromptActions}>
              <TouchableOpacity style={s.namePromptCancelBtn} onPress={() => setPendingListEntries(null)}>
                <Text style={s.namePromptCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.namePromptConfirmBtn} onPress={handleConfirmListImport}>
                <Text style={s.namePromptConfirmText}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
        {activeTab === 'Lists' && renderLists()}
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
  sectionLabel: { color: COLORS.textDim, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  sectionHint: { color: COLORS.muted, fontSize: 11, marginBottom: 10, lineHeight: 15 },
  namePromptOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 300, elevation: 300, padding: 24 },
  namePromptCard: { width: '100%', maxWidth: 400, backgroundColor: COLORS.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: COLORS.borderLit },
  namePromptTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  namePromptSubtitle: { color: COLORS.muted, fontSize: 12, marginBottom: 14 },
  namePromptInput: { backgroundColor: COLORS.surface2, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 14, paddingVertical: 12, color: COLORS.text, fontSize: 15, marginBottom: 16 },
  namePromptActions: { flexDirection: 'row', gap: 10 },
  namePromptCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  namePromptCancelText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  namePromptConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: COLORS.accent },
  namePromptConfirmText: { color: '#000', fontSize: 14, fontWeight: '800' },

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
