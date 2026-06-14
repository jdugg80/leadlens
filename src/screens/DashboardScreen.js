import { useState, useCallback, useRef, useEffect } from 'react';
import GeoTargetProjectionBadge from '../components/GeoTargetProjectionBadge';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, ActivityIndicator, Animated, useWindowDimensions, PanResponder } from 'react-native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, LEADS_STORAGE_KEY, SUPABASE_SETTINGS_KEY, EMPTY_LEAD, ROLES, DAILY_GOAL_CHIME_KEY_PREFIX } from '../constants';
import { maybeRunAutoExport } from '../utils/autoExport';
import { preloadSoundEffects, playSoundEffect, getSoundsEnabled, getDailyGoalChimeEnabled } from '../utils/soundManager';
import { sortLeadsNewestFirst, getLeadTimestamp, ensureLeadCreatedAt, sortQueueProspects, calculateLeadViability } from '../utils/leadHelpers';
import { SectionLabel, StatusBadge, Card } from '../components/UI';
import ManagerDashboardScreen from './ManagerDashboardScreen';
import { saveLeads } from '../utils/exportProfiles';
import { getAIWelcomeSuggestions, clearAIWelcomeCache, isAIWelcomeEnabled, hasAIWelcomeBeenShownToday, markAIWelcomeShownToday, loadAIRecommendationSettings, getAIPersonalityStyle } from '../utils/aiWelcome';
import { logOutreachActivity, OUTREACH_TYPES } from '../utils/outreachUtils';
import { loadMyZips, buildZipActivity, getRecommendedZipAreas, GOALS_STORAGE_KEY } from '../utils/territoryUtils';
import { getCurrentCoords } from '../utils/geoEnrich';
import { enrichLead, enqueueEnrichLead } from '../utils/claudeApi';
import { loadUserLearningProfile, recordUserActivityEvent } from '../utils/userLearning';
import TutorialOverlay from '../components/TutorialOverlay';
import { TUTORIAL_STEPS } from '../utils/tutorialData';
import { hasTutorialBeenSeen, markTutorialSeen, TUTORIALS } from '../utils/tutorialManager';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import { getStyledMessage } from '../utils/aiPersonality';
import { saveUserLocationStatus } from '../features/lenssignal/saveUserLocationStatus';

import { registerLensSignalPushToken } from '../features/lenssignal/registerPushToken';
import { processQueue } from '../utils/taskRunner';
import { deleteProspect, deleteProspects } from '../utils/backendSync';
import { hasRequestedBulkPermissions, markBulkPermissionsRequested, requestAllPermissions } from '../utils/permissionManager';
import BetaTracker from '../../utils/betaTracker';

import { createSupabaseClient } from '../utils/supabaseClient';

import { syncProspectsFromSupabase } from '../utils/backendSync';

const safeText = (value, fallback = '') => {
  if (value === null || value === undefined) return fallback;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  if (typeof value === 'object') {
    return (
      value.message ||
      value.error ||
      value.label ||
      value.status ||
      JSON.stringify(value)
    );
  }

  return String(value);
};
const getLeadCardKey = (lead = {}, index = 0, prefix = 'lead') => {
  const id = lead?.id ? String(lead.id) : '';
  const createdAt = lead?.createdAt || lead?.created_at_client || '';
  const savedAt = lead?.savedAt || lead?.saved_at || '';
  const businessName = lead?.businessName || lead?.business_name || 'unknown';

  return `${prefix}:${id || createdAt || savedAt || businessName}:${index}`;
};

const getGeoTargetSummary = (lead = {}) => {
  const geoTarget =
    lead.geotarget ||
    lead.geoTarget ||
    lead.geo_target ||
    lead.raw_lead?.geotarget ||
    lead.raw_lead?.geoTarget ||
    {};
  const bestFix =
    geoTarget.bestFix ||
    geoTarget.best_fix ||
    {};

  const status =
    lead.capture_location_status ||
    lead.captureLocationStatus ||
    geoTarget?.status?.label ||
    geoTarget?.status ||
    bestFix?.status ||
    bestFix?.source ||
    null;

  const accuracy =
    lead.capture_accuracy_meters ??
    lead.captureAccuracyMeters ??
    bestFix?.accuracyMeters ??
    bestFix?.accuracy_meters ??
    geoTarget?.accuracyMeters ??
    geoTarget?.accuracy_meters ??
    null;

  const confidence =
    lead.capture_location_confidence ??
    lead.captureLocationConfidence ??
    bestFix?.confidence ??
    geoTarget?.confidence ??
    null;

  const latitude =
    lead.capture_latitude ??
    lead.captureLatitude ??
    bestFix?.latitude ??
    geoTarget?.latitude ??
    null;

  const longitude =
    lead.capture_longitude ??
    lead.captureLongitude ??
    bestFix?.longitude ??
    geoTarget?.longitude ??
    null;

  const hasGeoTarget =
    !!status ||
    latitude !== null ||
    longitude !== null ||
    accuracy !== null ||
    confidence !== null ||
    !!geoTarget?.bestFix ||
    !!geoTarget?.status;

  return {
    hasGeoTarget,
    status: status || 'Location Captured',
    accuracy,
    confidence,
    latitude,
    longitude,
  };
};

function getWorkingDaysRemaining() {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let remaining = 0;
  for (let day = today.getDate(); day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (d.getDay() >= 1 && d.getDay() <= 5) { // Mon-Fri
      remaining++;
    }
  }
  return remaining;
}

function getAverageDailyExports(leads) {
  if (!leads || leads.length === 0) return '0.0';

  const exportsByDay = leads.reduce((acc, lead) => {
    if (lead.exportedAt) {
      const day = new Date(lead.exportedAt).toISOString().slice(0, 10);
      acc[day] = (acc[day] || 0) + 1;
    }
    return acc;
  }, {});

  const daysWithExports = Object.keys(exportsByDay).length;
  if (daysWithExports === 0) return '0.0';

  const totalExports = Object.values(exportsByDay).reduce((sum, count) => sum + count, 0);
  return (totalExports / daysWithExports).toFixed(1);
}

export default function DashboardScreen({ navigation, route }) {
  const { width: windowWidth } = useWindowDimensions();
  const user = route?.params?.user || {};
  const displayName = user.repName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.repEmail || 'LeadLens User';
  const displayRole = user.role || 'Rep';
  const [leads, setLeads] = useState([]);
  const [sortCriteria, setSortCriteria] = useState('newest'); // 'newest', 'oldest', 'name', 'status'
  const prospects = leads; // alias for UI references
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [aiWelcome, setAiWelcome] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiWelcomeEnabled, setAiWelcomeEnabled] = useState(true);
  const [recommendationSettings, setRecommendationSettings] = useState({
    currentLocation: true,
    openProspects: true,
    highActivity: true,
    leastRecent: true,
  });
  const [recommendedArea, setRecommendedArea] = useState(null);
  const [recommendedBackups, setRecommendedBackups] = useState([]);
  const [recommendationFallback, setRecommendationFallback] = useState(null);
  const [zipActivity, setZipActivity] = useState([]);
  const [enrichingId, setEnrichingId] = useState(null);
  const insets = useSafeAreaInsets();

  // Tutorial state
  const [activeTutorial, setActiveTutorial] = useState(null);
  // Prevent tutorial auto-trigger from firing on every focus (useFocusEffect runs on every return)
  const tutorialChecked = useRef(false);

  const showTutorial = (id) => setActiveTutorial(id);
  const closeTutorial = async () => {
    if (activeTutorial) await markTutorialSeen(activeTutorial);
    setActiveTutorial(null);
  };

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const sortLeads = (data, criteria) => {
    const list = [...(data || [])].map(ensureLeadCreatedAt);
    switch (criteria) {
      case 'oldest':
        return list.sort((a, b) => getLeadTimestamp(a) - getLeadTimestamp(b));
      case 'name':
        return list.sort((a, b) => (a.businessName || '').localeCompare(b.businessName || ''));
      case 'status':
        return list.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
      case 'newest':
      default:
        return sortQueueProspects(list);
    }
  };

  useEffect(() => {
    BetaTracker.screen('Dashboard');

    // Heartbeat: Update last_seen_at in Supabase
    if (user?.id) {
      (async () => {
        try {
          // Use sync API for instant heartbeat data
          const rawSupa = AsyncStorage.getSync('@leadlens_supabase_settings');
          const settings = rawSupa ? JSON.parse(rawSupa) : {};
          const supabase = createSupabaseClient(settings);
          if (supabase) {
            await supabase
              .from('profiles')
              .update({ last_seen_at: new Date().toISOString() })
              .eq('id', user.id);
          }
        } catch (err) {
          console.warn('[Dashboard] Heartbeat failed:', err.message);
        }
      })();
    }
  }, []);


  useEffect(() => {
    (async () => {
      const alreadyChecked = await hasRequestedBulkPermissions();
      if (!alreadyChecked) {
        showThemedAlert(
          'Permissions Required',
          'LeadLens requires Camera, Location, Notification, and Microphone access to provide the best experience. Would you like to set these up now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Start Setup',
              onPress: async () => {
                await requestAllPermissions();
                await markBulkPermissionsRequested();
              }
            }
          ]
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (user?.id) {
      registerLensSignalPushToken().catch(() => {});
    }
  }, [user?.id]);

  useEffect(() => {
    loadAIRecommendationSettings().then(setRecommendationSettings).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;

    // Safety timeout: ensure we show the dashboard within 6 seconds no matter what
    const safetyTimer = setTimeout(() => {
      if (active) {
        console.log('[DashboardScreen] Safety timeout reached, forcing data load state');
        setIsDataLoaded(true);
      }
    }, 6000);

    (async () => {
      try {
        // Load leads — try MMKV first, fall back to raw AsyncStorage
        let rawLeads = AsyncStorage.getJSONSync(LEADS_STORAGE_KEY, null);
        if (!rawLeads) {
          try {
            const RawStorage = require('@react-native-async-storage/async-storage').default;
            const raw = await RawStorage.getItem(LEADS_STORAGE_KEY);
            rawLeads = raw ? JSON.parse(raw) : [];
          } catch { rawLeads = []; }
        }
        const myZips = await loadMyZips().catch(() => []);
        const rawGoals = AsyncStorage.getJSONSync(GOALS_STORAGE_KEY, {});

        if (!active) return;

        const sortedLeads = sortLeads(rawLeads, sortCriteria);
        setLeads(sortedLeads);
        const activity = buildZipActivity(myZips, sortedLeads);
        setZipActivity(activity);
        maybeRunAutoExport(user).catch(() => {});
        await preloadSoundEffects().catch(() => {});
        setSelectionMode(false);
        setSelectedLeadIds([]);

        const todayString = new Date().toISOString().slice(0, 10);
        const goalValue = Math.max(1, Number(rawGoals?.dailyProspects) || 10);
        const goalCount = sortedLeads.filter((l) => {
          const d = new Date(l.savedAt || l.capturedAt || l.createdAt || l.created_at_client || '');
          return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
        }).length;
        const goalKey = `${DAILY_GOAL_CHIME_KEY_PREFIX}${todayString}`;
        if (goalCount >= goalValue) {
          const playedToday = await AsyncStorage.getItem(goalKey).catch(() => null);
          if (!playedToday && getSoundsEnabled() && getDailyGoalChimeEnabled()) {
            playSoundEffect('daily-goal-met').catch(() => {});
            AsyncStorage.setItem(goalKey, 'true').catch(() => {});

            getStyledMessage('dailyGoalMet').then(msg => {
              if (msg) showThemedAlert('Goal Reached!', msg);
            }).catch(() => {});

            recordUserActivityEvent('goal_met', {
              goal_value: goalValue,
              actual_count: goalCount,
              goal_completion_ratio: goalCount / goalValue
            }).catch(() => {});
          }
        }

        // Auto-trigger scan tutorial on very first visit only.
        // Guard with ref so useFocusEffect re-runs don't retrigger it.
        if (!tutorialChecked.current) {
          tutorialChecked.current = true;
          const scanSeen = await hasTutorialBeenSeen(TUTORIALS.SCAN).catch(() => true);
          if (!scanSeen && active) {
            setTimeout(() => setActiveTutorial(TUTORIALS.SCAN), 800);
          }
        }

        // Load AI welcome card async — non-blocking and only once per day.
        const enabled = await isAIWelcomeEnabled().catch(() => true);
        if (active) setAiWelcomeEnabled(enabled);

        const currentLocation = recommendationSettings.currentLocation
          ? await Promise.race([
              getCurrentCoords(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 3500))
            ]).catch(() => null)
          : null;

        const learningProfile = recommendationSettings.personalizedRecommendations && user
          ? await loadUserLearningProfile().catch(() => null)
          : null;

        const personalityStyle = await getAIPersonalityStyle().catch(() => null);

        const recommendationResult = getRecommendedZipAreas(rawLeads, myZips, currentLocation, {
          ...recommendationSettings,
          zipActivity: activity,
          learningProfile,
          personalityStyle,
        });

        if (active) {
          setRecommendedArea(recommendationResult.recommendedZip || null);
          setRecommendedBackups(recommendationResult.backups || []);
          setRecommendationFallback(recommendationResult.fallback || null);

          if (recommendationResult.recommendedZip) {
            recordUserActivityEvent('zip_recommended', {
              zip: recommendationResult.recommendedZip.zip
            }).catch(() => {});
          }

          setIsDataLoaded(true);
          clearTimeout(safetyTimer);
        }

        if (enabled && user && user.repName) {
          const shownToday = await hasAIWelcomeBeenShownToday(user).catch(() => false);
          if (!shownToday && active) {
            setAiLoading(true);
            const result = await getAIWelcomeSuggestions(user, rawLeads, activity, recommendationResult).catch(() => null);
            if (result && active) {
              setAiWelcome(result);
              await markAIWelcomeShownToday(user).catch(() => {});
            } else if (recommendationResult.recommendedZip && active) {
              setAiWelcome({
                recommendation: recommendationResult.recommendedZip,
                backups: recommendationResult.backups,
                fallback: recommendationResult.fallback,
              });
            }
            if (active) setAiLoading(false);
          } else {
            if (active) {
              setAiWelcome(null);
              setAiLoading(false);
            }
          }
        } else {
          if (active) {
            setAiWelcome(null);
            setAiLoading(false);
          }
        }
      } catch (err) {
    BetaTracker.crash('Dashboard', err);
        console.warn('[DashboardScreen] Initialization failed:', err);
        if (active) {
          setIsDataLoaded(true);
          clearTimeout(safetyTimer);
        }
      }
    })();

    return () => {
      active = false;
      clearTimeout(safetyTimer);
    };
  }, [user, recommendationSettings]));

  const handleRefreshAIWelcome = async () => {
    clearAIWelcomeCache();
    setAiWelcome(null);
    setAiLoading(true);
    try {
      const personalityStyle = await getAIPersonalityStyle();
      const result = await getAIWelcomeSuggestions(user, prospects, zipActivity, {
        recommendedZip: recommendedArea,
        backups: recommendedBackups,
        fallback: recommendationFallback,
        personalityStyle,
      });
      if (result) {
        setAiWelcome(result);
        await markAIWelcomeShownToday(user).catch(() => {});
      } else if (recommendedArea) {
        setAiWelcome({
          recommendation: recommendedArea,
          backups: recommendedBackups,
          fallback: recommendationFallback,
        });
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleViewRecommendedArea = () => {
    if (!recommendedArea) return;
    recordUserActivityEvent('zip_recommended_view', { zip: recommendedArea.zip }).catch(() => {});
    navigation.navigate('TerritoryMap', {
      user,
      initialZip: recommendedArea.zip,
    });
  };

  const handleSearchRecommendedArea = () => {
    if (!recommendedArea) return;
    recordUserActivityEvent('nearby_search_ran', {
      zip: recommendedArea.zip,
      source_type: 'recommendation'
    }).catch(() => {});
    navigation.navigate('TerritoryMap', {
      user,
      initialZip: recommendedArea.zip,
      initialNearbySearch: true,
    });
  };

  const handleStartRoute = () => {
    saveUserLocationStatus('start_my_day').catch(() => {});
    // Note: If a dedicated routing engine is added later, this will deep-link there.
    // For now, we view the recommended area on the map to start planning.
    handleViewRecommendedArea();
  };

  const handleOpenHeatMap = () => {
    navigation.navigate('TerritoryMap', { user });
  };

  const handleViewProspects = () => {
    // Scroll to queue or just focus it.
    // Since we are already on the Dashboard, we can just ensure the queue is visible or filter it.
    // For now, we'll just navigate to the top of the dashboard scroll.
  };

  const quickCall = (lead) => {
    const digits = String(lead.phone || '').replace(/\D/g, '');
    if (!digits) return;
    Linking.openURL(`tel:${digits}`).catch(() => showThemedAlert('Cannot open phone app'));
    if (lead.id) {
      logOutreachActivity(lead.id, OUTREACH_TYPES.CALL.key);
      recordUserActivityEvent('prospect_called', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType
      }).catch(() => {});
    }
  };

  const quickText = (lead) => {
    const digits = String(lead.phone || '').replace(/\D/g, '');
    if (!digits) return;
    Linking.openURL(`sms:${digits}`).catch(() => showThemedAlert('Cannot open messaging app'));
    if (lead.id) {
      logOutreachActivity(lead.id, OUTREACH_TYPES.TEXT.key);
      recordUserActivityEvent('intro_text_sent', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType
      }).catch(() => {});
    }
  };

  const quickEmail = (lead) => {
    if (!lead.email) return;
    Linking.openURL(`mailto:${lead.email}`).catch(() => showThemedAlert('Cannot open email app'));
    if (lead.id) {
      logOutreachActivity(lead.id, OUTREACH_TYPES.EMAIL.key);
      recordUserActivityEvent('intro_email_sent', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType
      }).catch(() => {});
    }
  };

  const quickMaps = (lead) => {
    const parts = [lead.streetNumber, lead.streetName, lead.city, lead.state, lead.zip].filter(Boolean).join(' ');
    if (!parts) return;
    const query = encodeURIComponent(parts);
    Linking.openURL(`https://maps.google.com/?q=${query}`).catch(() =>
      Linking.openURL(`https://maps.apple.com/?q=${query}`).catch(() => showThemedAlert('Cannot open maps'))
    );
  };

  const quickWebsite = (website) => {
    if (!website) return;
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    Linking.openURL(url).catch(() => showThemedAlert('Cannot open browser'));
  };

  if (!isDataLoaded || ([ROLES.BRANCH_MANAGER, ROLES.REGIONAL_MANAGER].includes(user?.role))) {
    if ([ROLES.BRANCH_MANAGER, ROLES.REGIONAL_MANAGER].includes(user?.role)) {
      return <ManagerDashboardScreen navigation={navigation} user={user} leads={leads} />;
    }
    return (
      <View style={[s.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ThemedAlertHost />
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  const handleSignOut = () => {
    showThemedAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        // Best-effort cleanup — navigation always happens even if something fails
        try {
          await AsyncStorage.removeItem('@leadlens_auth_profile').catch(() => {});
          await AsyncStorage.removeItem(LEADS_STORAGE_KEY).catch(() => {});

          const rawSupa = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY).catch(() => null);
          const settings = rawSupa ? JSON.parse(rawSupa) : {};
          const supabase = createSupabaseClient(settings);
          if (supabase) await supabase.auth.signOut().catch(() => {});

          await BetaTracker.endSession().catch(() => {});
        } catch (err) {
          console.warn('[Dashboard] Sign out cleanup failed:', err?.message);
        }

        // Always navigate — never block sign out on cleanup failures
        navigation.replace('Login');
      }},
    ]);
  };

  const getLeadId = (lead = {}) =>
    String(
      lead?.id ||
      lead?.leadId ||
      lead?.queueId ||
      lead?.createdAt ||
      lead?.savedAt ||
      lead?.capturedAt ||
      lead?.businessName ||
      ''
    ).trim();

  const isLeadSelected = (lead) => selectedLeadIds.includes(getLeadId(lead));

  const handleSortPress = () => {
    showThemedAlert('Sort Queue', 'How would you like to arrange your prospects?', [
      { text: 'Newest First', onPress: () => updateSort('newest') },
      { text: 'Oldest First', onPress: () => updateSort('oldest') },
      { text: 'Business Name (A-Z)', onPress: () => updateSort('name') },
      { text: 'Status', onPress: () => updateSort('status') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const updateSort = (criteria) => {
    setSortCriteria(criteria);
    setLeads(prev => sortLeads(prev, criteria));
  };

  const toggleLeadSelection = (lead) => {
    const id = getLeadId(lead);
    if (!id) return;

    setSelectionMode(true);
    setSelectedLeadIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter(existingId => existingId !== id);
        if (next.length === 0) setSelectionMode(false);
        return next;
      }

      return [...prev, id];
    });
  };

  const clearLeadSelection = () => {
    setSelectedLeadIds([]);
    setSelectionMode(false);
  };

  const selectAll = () => {
    const leadIds = prospects.map(getLeadId).filter(Boolean);
    if (selectedLeadIds.length === leadIds.length) {
      clearLeadSelection();
    } else {
      setSelectedLeadIds(leadIds);
      setSelectionMode(true);
    }
  };

  const deleteSelectedLeads = () => {
    if (!selectedLeadIds.length) return;
    showThemedAlert(`Delete ${selectedLeadIds.length} lead${selectedLeadIds.length > 1 ? 's' : ''}?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const selectedLeads = prospects.filter((lead) => selectedLeadIds.includes(getLeadId(lead)));
        selectedLeads.forEach(lead => {
          recordUserActivityEvent('prospect_deleted', {
            prospect_id: getLeadId(lead),
            zip: lead.zip,
            business_type: lead.vertical || lead.industry || lead.businessType
          }).catch(() => {});
        });

        try {
          const rawSupa = await AsyncStorage.getItem('@leadlens_supabase_settings');
          const settings = rawSupa ? JSON.parse(rawSupa) : {};
          await deleteProspects(selectedLeadIds, settings);

          if (__DEV__) {
            console.log("BATCH DELETE BUTTON PRESSED FOR PROSPECTS:", selectedLeadIds);
          }
        } catch (e) {
          console.error("DELETE PROSPECTS FAILED:", e);
        }

        const updated = prospects.filter((lead) => !selectedLeadIds.includes(getLeadId(lead)));
        setLeads(updated);
        clearLeadSelection();
      }},
    ]);
  };

  const deleteSingleLead = (lead) => {
    const id = getLeadId(lead);
    if (!id) {
      console.warn("DELETE PROSPECT FAILED: Missing prospect ID");
      return;
    }

    showThemedAlert('Delete lead?', 'This will remove this lead from your queue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (__DEV__) {
          console.log("DELETE BUTTON PRESSED FOR PROSPECT:", lead);
          console.log("DELETE TARGET ID:", id);
        }
        recordUserActivityEvent('prospect_deleted', {
          prospect_id: id,
          zip: lead.zip,
          business_type: lead.vertical || lead.industry || lead.businessType
        }).catch(() => {});

        try {
          const rawSupa = await AsyncStorage.getItem('@leadlens_supabase_settings');
          const settings = rawSupa ? JSON.parse(rawSupa) : {};
          await deleteProspect(id, settings);

          if (__DEV__) {
            console.log("PROSPECT DELETED FROM QUEUE:", id);
          }
        } catch (e) {
          console.error("DELETE PROSPECT FAILED:", e);
        }

        const updated = prospects.filter((item) => getLeadId(item) !== id);
        setLeads(updated);
        setSelectedLeadIds((prev) => {
          const next = prev.filter(existingId => existingId !== id);
          if (next.length === 0) setSelectionMode(false);
          return next;
        });
      }},
    ]);
  };

  const enrichProspect = async (lead, idx) => {
    const id = lead.id || `idx_${idx}`;
    setEnrichingId(id);
    try {
      // Background-safe enrichment: enqueue it
      await enqueueEnrichLead(lead);
      processQueue().catch(() => {});

      // Immediate attempt for UX
      const enriched = await enrichLead(lead);
      const updated = [...leads];
      const mergedLead = { ...lead, ...enriched };
      updated[idx] = { ...mergedLead, ...calculateLeadViability(mergedLead) };
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
      setLeads(updated);
      const filled = ['phone', 'email', 'streetName', 'city'].filter(k => enriched[k] && !lead[k]);
      if (filled.length) {
        showThemedAlert('Enriched!', `Filled in: ${filled.join(', ')}`);
      } else {
        showThemedAlert('No new data', 'Could not find additional info for this prospect.');
      }
    } catch {
      showThemedAlert('Processing in background', 'Lead added to enrichment queue.');
    } finally {
      setEnrichingId(null);
    }
  };

  const goEdit = (lead, idx) => {
    recordUserActivityEvent('prospect_viewed', {
      prospect_id: getLeadId(lead),
      zip: lead.zip,
      business_type: lead.vertical || lead.industry || lead.businessType
    }).catch(() => {});
    navigation.navigate('Review', { user, lead, editIdx: idx });
  };
  // Metrics
  const todayCount = prospects.filter(l => {
    const d = new Date(l.savedAt || l.capturedAt || l.createdAt || '');
    const t = new Date();
    return d.toDateString() === t.toDateString();
  }).length;

  return (
    <View style={s.root}>
      <ThemedAlertHost />

      {/* Tutorial overlay */}
      <TutorialOverlay
        visible={!!activeTutorial}
        steps={activeTutorial ? TUTORIAL_STEPS[activeTutorial] : []}
        onDone={closeTutorial}
      />

      {/* ── TOP BAR ── */}
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={s.topBarInner}>
          {/* Title */}
          <View>
            <Image
              source={require('../../assets/leadlens/LeadLens_header_logo_v4.png')}
              style={{ width: Math.min(windowWidth * 0.36, 150), height: Math.min(windowWidth * 0.36, 150) * (54 / 150), marginBottom: 4 }}
              resizeMode="contain"
            />
            <Text style={s.topSub}>{displayName} · {displayRole}</Text>
          </View>

          {/* Right actions */}
          <View style={s.topRight}>
            <TouchableOpacity style={s.topBtn} onPress={() => navigation.navigate('Settings', { user })}>
              <Text style={s.topBtnIcon}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.topBtn} onPress={() => navigation.navigate('FAQ', { user })}>
              <Text style={s.topBtnIcon}>❓</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.topBtn} onPress={() => navigation.navigate('Support', { user })}>
              <Text style={s.topBtnIcon}>🛟</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.topBtn}
              onPress={() => {
                if (!user || !Object.keys(user).length) {
                  showThemedAlert('Admin unavailable', 'User profile is not loaded yet. Please try again after login.');
                  return;
                }
                navigation.navigate('Admin', { user });
              }}
            >
              <Text style={s.topBtnIcon}>🔒</Text>
            </TouchableOpacity>
            {/* Avatar / sign out */}
            <TouchableOpacity style={s.avatar} onPress={handleSignOut}>
              <Text style={s.avatarText}>{displayName?.[0] ?? '?'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* Purple/red accent line */}
        <View style={s.topAccentLine}>
          <View style={s.topAccentL} /><View style={s.topAccentR} />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── METRIC TILES ── */}
        <View style={s.metricRow}>
          <View style={[s.metricTile, { borderColor: 'rgba(0,201,255,0.3)' }]}>
            <View style={s.metricTileCornerTL} />
            <Text style={[s.metricValue, { color: COLORS.accent }]}>{todayCount}</Text>
            <Text style={s.metricLabel}>TODAY</Text>
          </View>
          <View style={[s.metricTile, { borderColor: 'rgba(123,63,190,0.3)' }]}>
            <View style={[s.metricTileCornerTL, { borderColor: COLORS.purple }]} />
            <Text style={[s.metricValue, { color: COLORS.purple }]}>{prospects.length}</Text>
            <Text style={s.metricLabel}>IN QUEUE</Text>
          </View>
          <View style={[s.metricTile, { borderColor: 'rgba(0,229,160,0.3)' }]}>
            <View style={[s.metricTileCornerTL, { borderColor: COLORS.success }]} />
            <Text style={[s.metricValue, { color: COLORS.success }]}>{getAverageDailyExports(prospects)}</Text>
            <Text style={s.metricLabel}>AVG DAILY EXPORTS</Text>
          </View>
          <View style={[s.metricTile, { borderColor: 'rgba(204,16,64,0.3)' }]}>
            <View style={[s.metricTileCornerTL, { borderColor: COLORS.accent2 }]} />
            <Text style={[s.metricValue, { color: COLORS.accent2 }]}>{getWorkingDaysRemaining()}</Text>
            <Text style={s.metricLabel}>WORK DAYS LEFT</Text>
          </View>
        </View>

        {/* ── AI WELCOME CARD ── */}
        {aiLoading && (
          <View style={s.aiCard}>
            <View style={s.aiCardCornerTL} /><View style={s.aiCardCornerBR} />
            <ActivityIndicator size="small" color={COLORS.accent} />
            <Text style={s.aiLoading}>Getting your daily briefing...</Text>
          </View>
        )}
        {!aiLoading && aiWelcome && (
          <View style={s.aiCard}>
            <View style={s.aiCardCornerTL} /><View style={s.aiCardCornerBR} />
            <View style={s.aiHeader}>
              <Text style={s.aiTitle}>⚡ {safeText(aiWelcome.greeting, 'Daily Briefing')}</Text>
              <View style={s.aiHeaderActions}>
                <TouchableOpacity
                  onPress={handleRefreshAIWelcome}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.aiRefresh}>↻</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAiWelcome(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={s.aiClose}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
            {/* ... rest of the card ... */}
            {!!aiWelcome.insight && (
               <Text style={s.aiInsight}>{safeText(aiWelcome.insight)}</Text>
            )}    
            {recommendedArea ? (
              <View style={s.aiRecommendationBox}>
                <View style={s.aiRecommendationHeader}>
                  <Text style={s.aiRecommendationHeading}>Recommended ZIP</Text>
                  <TouchableOpacity onPress={handleViewRecommendedArea}>
                    <Text style={s.aiRecommendationZip}>{safeText(recommendedArea.zip)}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.aiRecommendationDetail}>
                  {safeText(
                   recommendedArea.reason || recommendedArea.summary,
                  'High opportunity area based on recent activity.'
               )}
             </Text>
                <View style={s.aiRecommendationActions}>
                  <TouchableOpacity style={s.aiRecommendationButton} onPress={handleViewRecommendedArea}>
                    <Text style={s.aiRecommendationButtonText}>View Area</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.aiRecommendationButton} onPress={handleStartRoute}>
                    <Text style={s.aiRecommendationButtonText}>Start Route</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.aiRecommendationButton} onPress={handleSearchRecommendedArea}>
                    <Text style={s.aiRecommendationButtonText}>Search Nearby</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.aiRecommendationButton, s.aiRecommendationButtonAlt]} onPress={handleOpenHeatMap}>
                    <Text style={s.aiRecommendationButtonText}>Heat Map</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.aiRecommendationButton, s.aiRecommendationButtonAlt]} onPress={handleViewProspects}>
                    <Text style={s.aiRecommendationButtonText}>View Prospects</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            {recommendedBackups.length > 0 && (
              <Text style={s.aiBackupText}>
                 Other good areas: {recommendedBackups.map((b) => safeText(b.zip)).join(', ')}
              </Text>
            )}
            {!!recommendationFallback && (
              <Text style={s.aiFallbackText}>{safeText(recommendationFallback)}</Text>
            )}
            {(aiWelcome.suggestions || []).map((sug, i) => (
              <View key={i} style={s.aiSuggestion}>
                <Text style={s.aiSuggestionIcon}>{safeText(sug.icon, '•')}</Text>
                <Text style={s.aiSuggestionText}>{safeText(sug.text)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── CAPTURE SECTION ── */}
        <SectionLabel>New Prospect</SectionLabel>
        <View style={s.actionRow}>
          <ActionTile
            icon="📷" label="Scan" sub="Card · Storefront · Gallery"
            color={COLORS.accent}
            onPress={() => navigation.navigate('Capture', { user, lead: { ...EMPTY_LEAD } })}
            onHelp={() => showTutorial(TUTORIALS.SCAN)}
          />
          <ActionTile
            icon="✏️" label="Manual" sub="Type or speak"
            color={COLORS.accent2}
            onPress={() => navigation.navigate('ManualEntry', { user, lead: { ...EMPTY_LEAD } })}
            onHelp={() => showTutorial(TUTORIALS.MANUAL)}
          />
        </View>

        {/* ── TOOLS SECTION ── */}
        <SectionLabel>Tools</SectionLabel>
        <View style={s.actionRow}>
          <ActionTile
            icon="🗺️" label="Territory" sub="ZIPs & heat map"
            color={COLORS.success}
            onPress={() => navigation.navigate('TerritoryManager', { user })}
            onHelp={() => showTutorial(TUTORIALS.TERRITORY)}
          />
          <ActionTile
            icon="📤" label="Export" sub="Build & send prospects"
            color={COLORS.purple}
            onPress={() => navigation.navigate('Export', { user, leads })}
            onHelp={() => showTutorial(TUTORIALS.EXPORT)}
          />
        </View>
        <View style={[s.actionRow, { marginTop: 10 }]}>
          <ActionTile
            icon="🖼️" label="Card Gallery" sub="Captured images"
            color="rgba(168,139,250,1)"
            onPress={() => navigation.navigate('CardGallery', { user })}
            onHelp={() => showTutorial(TUTORIALS.GALLERY)}
          />
          <ActionTile
            icon="⚙️" label="Settings" sub="Preferences & config"
            color={COLORS.chrome}
            onPress={() => navigation.navigate('Settings', { user })}
            onHelp={() => showTutorial(TUTORIALS.SETTINGS)}
          />
        </View>

        {/* ── QUEUE HEADER ── */}
        <View style={s.queueHeader}>
          <SectionLabel>Prospect Queue</SectionLabel>
          <View style={s.queueActions}>
            {prospects.length > 0 && !selectionMode && (
              <TouchableOpacity style={s.sortBtn} onPress={handleSortPress}>
                <Text style={s.sortBtnText}>SORT ▾</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => navigation.navigate('ProspectQueue', { user })}>
              <Text style={s.exportLink}>MANAGE ›</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.queueHelpBtn}
              onPress={() => showTutorial(TUTORIALS.QUEUE)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={s.queueHelpText}>?</Text>
            </TouchableOpacity>
            {prospects.length > 0 && (
              <>
                <TouchableOpacity
                  style={s.selectBtn}
                  onPress={() => { if (selectionMode) clearLeadSelection(); else setSelectionMode(true); setSelectedLeadIds([]); }}
                >
                  <Text style={s.selectBtnText}>{selectionMode ? 'Cancel' : 'Select'}</Text>
                </TouchableOpacity>
                {!selectionMode && (
                  <TouchableOpacity onPress={() => navigation.navigate('Export', { user, leads })}>
                    <Text style={s.exportLink}>EXPORT ›</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Batch action bar */}
        {selectionMode && (
          <View style={s.batchBar}>
            <Text style={s.batchCount}>{selectedLeadIds.length} selected</Text>
            <TouchableOpacity style={s.batchCancelBtn} onPress={clearLeadSelection}>
              <Text style={s.batchCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.batchDeleteBtn, !selectedLeadIds.length && s.batchDeleteBtnOff]}
              onPress={deleteSelectedLeads}
              disabled={!selectedLeadIds.length}
            >
              <Text style={s.batchDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── QUEUE CARDS ── */}
        {prospects.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>📡</Text>
            <Text style={s.emptyText}>No prospects yet.</Text>
            <Text style={s.emptySub}>Capture your first prospect above.</Text>
          </View>
        ) : (
          prospects.map((rawLead, idx) => {
            const lead = { ...rawLead, ...calculateLeadViability(rawLead) };

            let bgColor = COLORS.surface;
            if (lead.shadeKey === 'green') bgColor = 'rgba(0, 255, 100, 0.03)';
            else if (lead.shadeKey === 'yellow') bgColor = 'rgba(255, 200, 0, 0.04)';
            else if (lead.shadeKey === 'orange') bgColor = 'rgba(255, 140, 0, 0.04)';
            else if (lead.shadeKey === 'red') bgColor = 'rgba(255, 0, 0, 0.03)';

            return (
              <SwipeableQueueCard
                key={getLeadCardKey(lead, idx, 'queue')}
                lead={lead}
                idx={idx}
                bgColor={bgColor}
                selectionMode={selectionMode}
                isSelected={isLeadSelected(lead)}
                onPress={() => selectionMode ? toggleLeadSelection(lead) : goEdit(lead, idx)}
                onLongPress={() => toggleLeadSelection(lead)}
                onDelete={() => deleteSingleLead(lead)}
                onCall={() => quickCall(lead)}
                onText={() => quickText(lead)}
                onEmail={() => quickEmail(lead)}
                onMaps={() => quickMaps(lead)}
                onWebsite={() => quickWebsite(lead.website)}
                onEnrich={(e) => { e?.stopPropagation?.(); enrichProspect(lead, idx); }}
                enrichingId={enrichingId}
                getGeoTargetSummary={getGeoTargetSummary}
                safeText={safeText}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ── Swipeable Queue Card ──────────────────────────────────────────
function SwipeableQueueCard({
  lead, idx, bgColor, selectionMode, isSelected,
  onPress, onLongPress, onDelete,
  onCall, onText, onEmail, onMaps, onWebsite, onEnrich,
  enrichingId, getGeoTargetSummary, safeText,
}) {
  const { width: cardWindowWidth } = useWindowDimensions();
  const swipeOffset = useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = cardWindowWidth * 0.38;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        !selectionMode && Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) swipeOffset.setValue(g.dx);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          Animated.timing(swipeOffset, {
            toValue: -cardWindowWidth, duration: 220, useNativeDriver: true,
          }).start(() => onDelete());
        } else {
          Animated.spring(swipeOffset, {
            toValue: 0, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const deleteOpacity = swipeOffset.interpolate({
    inputRange: [-SWIPE_THRESHOLD, -40],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const barColor =
    lead.shadeKey === 'green' ? COLORS.success
    : lead.shadeKey === 'yellow' ? '#f5b041'
    : lead.shadeKey === 'orange' ? '#e67e22'
    : COLORS.accent2;

  const geo = getGeoTargetSummary(lead);

  return (
    <View style={s.swipeCardContainer}>
      {/* Delete action revealed behind */}
      <Animated.View style={[s.swipeDeleteAction, { opacity: deleteOpacity }]}>
        <TouchableOpacity style={s.swipeDeleteBtn} onPress={onDelete}>
          <Text style={s.swipeDeleteText}>🗑{'\n'}Delete</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Card sliding on top */}
      <Animated.View style={{ transform: [{ translateX: swipeOffset }] }} {...panResponder.panHandlers}>
        <TouchableOpacity
          style={[s.queueCard, { backgroundColor: bgColor }, selectionMode && isSelected && s.queueCardSelected]}
          onPress={onPress}
          onLongPress={onLongPress}
          activeOpacity={0.75}
        >
          {/* Left status bar */}
          <View style={[s.queueCardBar, { backgroundColor: barColor }]} />

          {/* Selection circle */}
          {selectionMode && (
            <View style={[s.selectCircle, isSelected && s.selectCircleOn]}>
              {isSelected && <Text style={s.selectCheck}>✓</Text>}
            </View>
          )}

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={s.queueBiz} numberOfLines={1}>{lead.businessName || 'Unnamed Business'}</Text>
            </View>
            <Text style={s.queueSub} numberOfLines={1}>
              {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
              {lead.phone ? ` · ${lead.phone}` : ''}
            </Text>

            {/* Viability and Missing field badges */}
            <View style={s.missingRow}>
              <View style={[s.missingBadge, {
                backgroundColor: lead.shadeKey === 'green' ? 'rgba(0,200,100,0.1)' : lead.shadeKey === 'yellow' ? 'rgba(255,200,0,0.1)' : lead.shadeKey === 'orange' ? 'rgba(255,140,0,0.1)' : 'rgba(255,0,0,0.1)',
                borderColor: lead.shadeKey === 'green' ? 'rgba(0,200,100,0.3)' : lead.shadeKey === 'yellow' ? 'rgba(255,200,0,0.3)' : lead.shadeKey === 'orange' ? 'rgba(255,140,0,0.3)' : 'rgba(255,0,0,0.3)'
              }]}>
                <Text style={[s.missingText, {
                  color: lead.shadeKey === 'green' ? '#00b359' : lead.shadeKey === 'yellow' ? '#b38600' : lead.shadeKey === 'orange' ? '#cc7000' : '#cc0000'
                }]}>
                  {lead.viabilityLabel} · {lead.viabilityScore}/3
                </Text>
              </View>
              {lead.missingViabilityFields?.length > 0 && (
                <Text style={{ fontSize: 10, color: COLORS.muted, marginLeft: 4, alignSelf: 'center' }}>
                  Missing: {lead.missingViabilityFields.join(', ')}
                </Text>
              )}
            </View>

            {geo.hasGeoTarget && (
              <View style={s.geoTargetRow}>
                <View style={s.geoTargetBadge}>
                  <Text style={s.geoTargetBadgeText}>{`GT Lock: ${safeText(geo.status)}`}</Text>
                </View>
                <Text style={s.geoTargetMeta}>
                  {`${geo.accuracy !== null ? `Accuracy: ${Math.round(Number(geo.accuracy))}m` : 'Accuracy: —'}${geo.confidence !== null ? ` · Confidence: ${Math.round(Number(geo.confidence))}%` : ''}`}
                </Text>
                <GeoTargetProjectionBadge geo={geo} />
              </View>
            )}

            {/* Quick action buttons */}
            {!selectionMode && (
              <View style={s.qaRow}>
                {!!lead.phone && (
                  <>
                    <TouchableOpacity style={s.qaBtn} onPress={onCall} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={s.qaIcon}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.qaBtn} onPress={onText} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                      <Text style={s.qaIcon}>💬</Text>
                    </TouchableOpacity>
                  </>
                )}
                {!!lead.email && (
                  <TouchableOpacity style={s.qaBtn} onPress={onEmail} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={s.qaIcon}>✉️</Text>
                  </TouchableOpacity>
                )}
                {!!(lead.streetName || lead.city) && (
                  <TouchableOpacity style={s.qaBtn} onPress={onMaps} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={s.qaIcon}>📍</Text>
                  </TouchableOpacity>
                )}
                {!!lead.website && (
                  <TouchableOpacity style={s.qaBtn} onPress={onWebsite} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                    <Text style={s.qaIcon}>🌐</Text>
                  </TouchableOpacity>
                )}
                {(!lead.phone || !lead.email || !lead.streetName) && (
                  <TouchableOpacity
                    style={[s.qaBtn, s.enrichBtn]}
                    onPress={onEnrich}
                    disabled={enrichingId === (lead.id || `idx_${idx}`)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    {enrichingId === (lead.id || `idx_${idx}`)
                      ? <ActivityIndicator size={12} color={COLORS.accent} />
                      : <Text style={s.qaIcon}>✨</Text>
                    }
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[s.qaBtn, s.deleteBtn]}
                  onPress={onDelete}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={s.qaIcon}>🗑</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Right column: status badge + updated timestamp stacked */}
          <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch' }}>
            <StatusBadge status={lead.status} />
            {!!lead.updatedAt && (
              <Text style={s.updatedAtText}>
                {'Updated: ' + new Date(lead.updatedAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' }) + '\n' + new Date(lead.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            )}
          </View>
        </TouchableOpacity>
        {!selectionMode && (
          <Text style={s.swipeHint}>← swipe to delete</Text>
        )}
      </Animated.View>
    </View>
  );
}

// ── Action Tile Component ──────────────────────────────────────────
function ActionTile({ icon, label, sub, color, onPress, onHelp }) {
  return (
    <TouchableOpacity
      style={[s.actionTile, { borderColor: color + '55' }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Corner pips */}
      <View style={[s.tileCornTL, { borderColor: color + '70' }]} />
      <View style={[s.tileCornBR, { borderColor: color + '70' }]} />
      {/* Top color bar */}
      <View style={[s.tileBar, { backgroundColor: color }]} />
      {/* Help button */}
      {!!onHelp && (
        <TouchableOpacity style={s.tileHelp} onPress={onHelp} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.tileHelpText}>?</Text>
        </TouchableOpacity>
      )}
      <Text style={s.tileIcon}>{icon}</Text>
      <Text style={[s.tileLabel, { color: COLORS.text }]}>{label}</Text>
      <Text style={s.tileSub}>{sub}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // Top bar
  topBar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  topLogo: { width: 150, height: 54, marginBottom: 4 },
  topTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text, letterSpacing: 0.5 },
  topSub: { fontSize: 10, color: COLORS.muted, letterSpacing: 0.5, marginTop: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBtn: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    alignItems: 'center', justifyContent: 'center',
  },
  topBtnIcon: { fontSize: 15 },
  topAccentLine: { flexDirection: 'row', height: 2 },
  topAccentL: { flex: 1, backgroundColor: COLORS.purple, opacity: 0.75 },
  topAccentR: { flex: 1, backgroundColor: COLORS.accent2, opacity: 0.75 },
  avatar: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.purple,
    borderWidth: 1, borderColor: COLORS.borderLit,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '900', color: '#fff' },

  scroll: { flex: 1, paddingHorizontal: 14 },

  // Metric tiles
  metricRow: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 4 },
  metricTile: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: 12, padding: 10,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  metricTileCornerTL: {
    position: 'absolute', top: 0, left: 0, width: 10, height: 10,
    borderTopWidth: 2, borderLeftWidth: 2, borderColor: COLORS.accent, borderTopLeftRadius: 12,
  },
  metricValue: { fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  metricLabel: { fontSize: 8, fontWeight: '700', color: COLORS.muted, letterSpacing: 1.5, marginTop: 2 },

  // AI card
  aiCard: {
    backgroundColor: COLORS.surface, borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.2)', borderRadius: 14,
    padding: 14, marginTop: 14, marginBottom: 4,
    flexDirection: 'row', flexWrap: 'wrap',
    position: 'relative', overflow: 'hidden',
  },
  aiCardCornerTL: {
    position: 'absolute', top: 0, left: 0, width: 12, height: 12,
    borderTopWidth: 2, borderLeftWidth: 2,
    borderColor: 'rgba(0,201,255,0.5)', borderTopLeftRadius: 14,
  },
  aiCardCornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
    borderBottomWidth: 2, borderRightWidth: 2,
    borderColor: 'rgba(204,16,64,0.4)', borderBottomRightRadius: 14,
  },
  aiHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' },
  aiHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aiTitle: { color: COLORS.text, fontSize: 14, fontWeight: '700', flex: 1, lineHeight: 20 },
  aiRefresh: { color: COLORS.accent, fontSize: 18 },
  aiClose: { color: COLORS.muted, fontSize: 18 },
  aiInsight: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginTop: 8, width: '100%' },
  aiLoading: { color: COLORS.muted, fontSize: 12, marginLeft: 10 },
  aiSuggestion: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, width: '100%' },
  aiSuggestionIcon: { fontSize: 15, marginTop: 1 },
  aiSuggestionText: { color: COLORS.text, fontSize: 13, flex: 1, lineHeight: 18 },
  aiRecommendationBox: { width: '100%', padding: 12, backgroundColor: 'rgba(0,201,255,0.08)', borderRadius: 12, marginTop: 12 },
  aiRecommendationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  aiRecommendationHeading: { color: COLORS.accent, fontWeight: '800', fontSize: 12 },
  aiRecommendationZip: { color: COLORS.text, fontSize: 18, fontWeight: '900', textDecorationLine: 'underline' },
  aiRecommendationDetail: { color: COLORS.textDim, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  aiRecommendationActions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  aiRecommendationButton: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.accent, alignItems: 'center', minWidth: '30%' },
  aiRecommendationButtonAlt: { backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border },
  aiRecommendationButtonText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  aiBackupText: { color: COLORS.muted, fontSize: 12, marginTop: 8, width: '100%' },
  aiFallbackText: { color: COLORS.muted, fontSize: 12, marginTop: 6, width: '100%' },

  // Action tiles
  actionRow: { flexDirection: 'row', gap: 10 },
  actionTile: {
    flex: 1, backgroundColor: COLORS.surface,
    borderWidth: 1, borderRadius: 16,
    paddingVertical: 22, paddingHorizontal: 12,
    alignItems: 'center', gap: 6,
    overflow: 'hidden', position: 'relative',
  },
  tileBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2 },
  tileCornTL: {
    position: 'absolute', top: 0, left: 0, width: 10, height: 10,
    borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 16,
  },
  tileCornBR: {
    position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
    borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 16,
  },
  tileIcon:  { fontSize: 30 },
  tileLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  tileSub:   { fontSize: 10, color: COLORS.muted, textAlign: 'center' },
  tileHelp: {
    position: 'absolute', top: 8, right: 8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  tileHelpText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },

  // Queue header
  queueHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  queueActions: { flexDirection: 'row', gap: 8, marginTop: 16, alignItems: 'center' },
  sortBtn: {
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: COLORS.borderLit,
  },
  sortBtnText: { color: COLORS.muted, fontWeight: '800', fontSize: 10, letterSpacing: 0.5 },
  queueHelpBtn: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: COLORS.borderLit,
    alignItems: 'center', justifyContent: 'center',
  },
  queueHelpText: { color: COLORS.muted, fontSize: 11, fontWeight: '700' },
  selectBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: 'rgba(0,201,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.35)',
  },
  selectBtnText: { color: COLORS.accent, fontWeight: '800', fontSize: 11 },
  exportLink: { color: COLORS.accent, fontWeight: '700', fontSize: 11, letterSpacing: 0.5, marginTop: 6 },

  // Batch bar
  batchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.3)', borderRadius: 12,
    padding: 10, marginBottom: 10, gap: 8,
  },
  batchCount: { color: COLORS.text, fontWeight: '800', flex: 1, fontSize: 13 },
  batchCancelBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  batchCancelText: { color: COLORS.textDim, fontWeight: '700', fontSize: 12 },
  batchDeleteBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: 'rgba(255,59,92,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,59,92,0.4)',
  },
  batchDeleteBtnOff: { opacity: 0.4 },
  batchDeleteText: { color: COLORS.danger, fontWeight: '800', fontSize: 12 },

  // Empty state
  emptyWrap: { alignItems: 'center', marginTop: 40, gap: 8 },
  emptyIcon: { fontSize: 40, opacity: 0.4 },
  emptyText: { color: COLORS.textDim, fontSize: 14, fontWeight: '600' },
  emptySub:  { color: COLORS.muted, fontSize: 12 },

  // Queue cards
  queueCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 12, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8, gap: 10,
    overflow: 'hidden', position: 'relative',
  },
  queueCardSelected: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.06)' },
  queueCardBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },

  // Selection
  selectCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  selectCircleOn: { backgroundColor: COLORS.accent },
  selectCheck: { color: '#000', fontWeight: '900', fontSize: 12 },

  queueBiz: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  updatedAtText: { fontSize: 9, color: COLORS.muted, fontWeight: '600', textAlign: 'right', lineHeight: 13 },
  queueSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  // Missing badges
  missingRow: { flexDirection: 'row', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  missingBadge: {
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    backgroundColor: 'rgba(204,16,64,0.1)',
    borderWidth: 1, borderColor: 'rgba(204,16,64,0.3)',
  },
  missingText: { fontSize: 9, color: COLORS.accent2, fontWeight: '700', letterSpacing: 0.3 },

  // Quick actions
  qaRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  qaBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  enrichBtn: { borderColor: 'rgba(0,201,255,0.4)', backgroundColor: 'rgba(0,201,255,0.08)' },
  deleteBtn:  { borderColor: 'rgba(255,59,92,0.3)', backgroundColor: 'rgba(255,59,92,0.06)' },
  qaIcon: { fontSize: 13 },

  geoTargetRow: {
  marginTop: 7,
  gap: 4,
},

geoTargetBadge: {
  alignSelf: 'flex-start',
  borderRadius: 6,
  paddingHorizontal: 7,
  paddingVertical: 3,
  backgroundColor: 'rgba(0,201,255,0.08)',
  borderWidth: 1,
  borderColor: 'rgba(0,201,255,0.28)',
},

geoTargetBadgeText: {
  fontSize: 10,
  color: COLORS.accent,
  fontWeight: '800',
  letterSpacing: 0.2,
},

geoTargetMeta: {
  fontSize: 10,
  color: COLORS.muted,
  fontWeight: '600',
},

  // ── Swipe-to-delete styles ──
  swipeCardContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  swipeDeleteAction: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 18, // accounts for swipeHint height
    width: 80,
    backgroundColor: COLORS.accent2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeDeleteBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  swipeHint: {
    fontSize: 9,
    color: COLORS.muted,
    textAlign: 'right',
    paddingRight: 6,
    paddingBottom: 2,
    opacity: 0.5,
  },
});