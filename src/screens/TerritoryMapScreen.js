import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Linking, Modal, AppState, TextInput,
} from 'react-native';
import MapView, { Polygon, Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  makeSafeRegion,
  makeSafeCoordinate,
  makeSafePolygonCoordinates,
  makeSafePolygons,
  DEFAULT_TERRITORY_REGION,
} from '../utils/mapSafety';
import { screenHeight } from '../utils/responsive';
import { classifyVertical } from '../utils/leadProcessing';

// Unicode constants for safety
const ICON_CROSS = "\u2715";
const ICON_PIN = "\uD83D\uDCCD";
const ICON_PHONE = "\uD83D\uDCDE";
const ICON_EMAIL = "\u2709\uFE0F";
const ICON_WEB = "\uD83C\uDF10";
const ICON_BUILDING = "\uD83C\uDFE2";
const ICON_SEARCH = "\uD83D\uDD0D";
const ICON_TARGET = "\uD83C\uDFAF";
const ICON_GEAR = "\u2699\uFE0F";
const ICON_RELOAD = "\u21BB";
const ICON_SIGNAL = "\uD83D\uDCE1";

const _makeSafeCoordinate = (coord) => {
  if (!coord) return null;
  const lat = Number(coord.latitude ?? coord.lat);
  const lng = Number(coord.longitude ?? coord.lng);
  return (isFinite(lat) && isFinite(lng)) ? { latitude: lat, longitude: lng } : null;
};

const _normalizeZipCode = (value) => {
  const zip = String(value ?? '').replace(/\D/g, '').slice(0, 5);
  return zip.length === 5 ? zip : '';
};

const _toNormalizedZipEntry = (entry, defaults = {}) => {
  if (entry === null || entry === undefined) return null;

  if (typeof entry === 'string' || typeof entry === 'number') {
    const zip = _normalizeZipCode(entry);
    if (!zip) return null;
    return {
      zip,
      notes: String(defaults.notes || '').trim(),
      addedAt: defaults.addedAt || new Date().toISOString(),
      repName: String(defaults.repName || '').trim(),
    };
  }

  const zip = _normalizeZipCode(
    entry?.zip
    ?? entry?.zipCode
    ?? entry?.zip_code
    ?? entry?.ZIP
    ?? entry?.postalCode
    ?? entry?.postal_code
  );
  if (!zip) return null;

  return {
    ...entry,
    zip,
    notes: String(entry?.notes ?? entry?.note ?? defaults.notes ?? '').trim(),
    addedAt: entry?.addedAt || entry?.added_at || defaults.addedAt || new Date().toISOString(),
    repName: String(entry?.repName || entry?.rep_name || defaults.repName || '').trim(),
  };
};

import { loadTerritoryZipMarkersFallback } from '../utils/territoryZipLoader';
import { useFocusEffect } from '@react-navigation/native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import HomeownerFilterPanel from '../components/HomeownerFilterPanel';
import HomeownerSignalCard from '../components/HomeownerSignalCard';
import {
  COLORS,
  LEADS_STORAGE_KEY,
  GOALS_STORAGE_KEY,
  MAP_FILTERS_KEY,
  MAP_REGION_KEY,
  MAP_NEARBY_PLACES_KEY,
  TARGET_LENS_PROFILES_KEY,
  TARGET_LENS_SEARCH_MODE_KEY,
  TARGET_LENS_MODE_KEY,
} from '../constants';
import { ScreenHeader } from '../components/UI';
import {
  loadMyZips, saveMyZips, fetchMyTerritoryFromSupabase, getMyZipsRevision, buildZipActivity,
  getHeatLevel, getHeatColor, getHeatLabel,
} from '../utils/territoryUtils';
import { sortLeadsNewestFirst } from '../utils/leadHelpers';
import { getBulkZipBounds, getZipBounds } from '../utils/zipBoundaryCache';
import { getCurrentCoords } from '../utils/geoEnrich';
import { recordUserActivityEvent, loadUserLearningProfile } from '../utils/userLearning';
import { showThemedAlert } from '../components/ThemedAlert';
import { getStyledMessage } from '../utils/aiPersonality';
import { enqueueTask, TASK_TYPES } from '../utils/taskQueue';
import { processQueue } from '../utils/taskRunner';
import { supabase } from '../lib/supabase';
import {
  searchNearbyBusinesses,
  fetchPlaceDetails,
  parseAddressComponents,
  classifyGooglePlace,
} from '../utils/nearbySearch';
import {
  parseBusinessAddress,
  extractBestPhone,
  buildEnrichmentBundle,
  enrichBusinessWithPublicSources,
} from '../utils/enrichmentNormalizer';

import { LensSignalMapMarker } from '../features/lenssignal/LensSignalMapMarker';
import { LensSignalBadge } from '../features/lenssignal/LensSignalBadge';
import { LensSignalDetailsCard } from '../features/lenssignal/LensSignalDetailsCard';
import LeadFiltersBottomSheet from '../components/LeadFiltersBottomSheet';
import TargetLensProfileSelector from '../components/TargetLensProfileSelector';

import { calculateMatchConfidence } from '../services/lensSignal/lensSignalMatcher';
import { processTargetLensMatch } from '../services/targetLens/targetLensMatcher';
import Supercluster from 'supercluster';
import { MapClusterMarker } from '../features/map/MapClusterMarker';
import BetaTracker from '../../utils/betaTracker';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;
const MAP_SAFE_MODE = true;

export default function TerritoryMapScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user, initialZip, initialNearbySearch } = route?.params || {};
  const mapRef = useRef(null);
  const loadingRef = useRef(false);
  const hasLoadedMapRef = useRef(false);
  const territoryRevisionRef = useRef(0);
  const signalFetchTimerRef = useRef(null);
  const clusterBuildTimerRef = useRef(null);
  const isMapReadyRef = useRef(false);
  const superclusterRef = useRef(new Supercluster({ radius: 40, maxZoom: 16 }));
  const lastLensCountRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [initialNearbyTriggered, setInitialNearbyTriggered] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [zipMarkers, setZipMarkers] = useState([]);
  const [totalLoadedZips, setTotalLoadedZips] = useState(0);
  const [selectedZip, setSelectedZip] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedNearbyIds, setSelectedNearbyIds] = useState([]);
  const getNearbyPlaceId = (p) => p?.placeId || p?.place_id || p?.id;
  const addSelectedNearbyToQueue = () => showThemedAlert("Coming Soon", "Batch adding from map will be available shortly.");
  const [searchingNearby, setSearchingNearby] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === 'active');
  const [lowMemoryMode, setLowMemoryMode] = useState(false);
  const [region, setRegion] = useState(DEFAULT_TERRITORY_REGION);
  const regionRef = useRef(null);

  const [homeownerProspects, setHomeownerProspects] = useState([]);
  const [selectedHomeowner, setSelectedHomeowner] = useState(null);

  const DEFAULT_FILTERS = {
    targetLensMode: 'business',
    businessType: 'All Businesses',
    leadStatus: 'All',
    statuses: ['All'],
    radiusMiles: 5,
    minRating: 0,
    contactCompleteness: 'all', // 'all' | 'enriched' | 'has_phone'
    activityWindow: 'all', // 'all' | 'never' | '7d' | '30d' | '90d' | 'stale'
    newSinceLastScan: false,
    signalsOnly: false,
    signals: { lensSignal: true, contactSignal: true, pest: true, opening: true, priority: true },
    matchStrength: 'Show All',
    // Residential-specific
    homeownerFilter: 'all',
    lookbackWindow: '90d',
    minHomeValue: 0,
    maxHomeValue: 10000000,
    minSqFt: 0,
    maxSqFt: 10000,
    occupancyTypes: ['all'],
    residentialPropertyTypes: ['all'],
  };

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const isInitializedRef = useRef(false);

  // Persistence Effects
  useEffect(() => {
    if (isInitializedRef.current && filters) {
      AsyncStorage.setItem(MAP_FILTERS_KEY, JSON.stringify(filters)).catch(() => {});
      if (filters.targetLensMode) {
        AsyncStorage.setItem(TARGET_LENS_MODE_KEY, filters.targetLensMode).catch(() => {});
      }
    }
  }, [filters]);

  useEffect(() => {
    if (!loading && region && isMapReadyRef.current) {
      AsyncStorage.setItem(MAP_REGION_KEY, JSON.stringify(region)).catch(() => {});
    }
  }, [region, loading]);

  useEffect(() => {
    if (!loading && nearbyPlaces && Array.isArray(nearbyPlaces)) {
      AsyncStorage.setItem(MAP_NEARBY_PLACES_KEY, JSON.stringify(nearbyPlaces)).catch(() => {});
    }
  }, [nearbyPlaces, loading]);

  // Monitor AppState to prevent background location usage
  useEffect(() => {
    setIsAppActive(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (nextState) => {
      const active = nextState === 'active';
      setIsAppActive(active);
      if (!active) {
        if (signalFetchTimerRef.current) clearTimeout(signalFetchTimerRef.current);
      }
    });
    let memSub = null;
    try {
      memSub = AppState.addEventListener('memoryWarning', () => {
        console.warn('[TerritoryMap] memoryWarning received — enabling low memory mode');
        setLowMemoryMode(true);
        setShowNearby(false);
        setSelectedLead(null);
        setSelectedLensSignalRecord(null);
      });
    } catch (_) {}
    return () => {
      sub.remove();
      memSub?.remove?.();
    };
  }, []);

  // Load saved TargetLens profile on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TARGET_LENS_PROFILES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.category) setActiveProfile(parsed);
        }
        const modeRaw = await AsyncStorage.getItem(TARGET_LENS_SEARCH_MODE_KEY);
        if (modeRaw) setSearchMode(modeRaw);
      } catch (e) {
        console.warn('[TerritoryMap] Failed to load saved TargetLens profile:', e);
      }
    })();
  }, []);

  // Load saved TargetLens mode and default it from active profile if available
  useEffect(() => {
    (async () => {
      try {
        const savedMode = await AsyncStorage.getItem(TARGET_LENS_MODE_KEY);
        let mode = savedMode || null;
        if (!mode && activeProfile?.division) {
          mode = activeProfile.division === 'Residential' ? 'homeowner' : 'business';
        }
        if (mode) {
          setFilters(prev => ({
            ...prev,
            targetLensMode: mode === 'homeowner' ? 'homeowner' : 'business',
          }));
        }
      } catch (e) {
        console.warn('[TerritoryMap] Failed to load saved TargetLens mode:', e);
      }
    })();
  }, [activeProfile]);

  const [filtersVisible, setFiltersVisible] = useState(false);
  const [targetLensVisible, setTargetLensVisible] = useState(false);
  const [activeProfile, setActiveProfile] = useState(null);
  const [lensSignalRecords, setLensSignalRecords] = useState([]);
  const [loadingLensSignal, setLoadingLensSignal] = useState(false);
  const [selectedLensSignalRecord, setSelectedLensSignalRecord] = useState(null);
  const [leads, setLeads] = useState([]);
  const [leadMarkers, setLeadMarkers] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [searchMode, setSearchMode] = useState('Strict');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressSearching, setAddressSearching] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const autocompleteTimerRef = useRef(null);
  const lastFetchedCoordsRef = useRef({ lat: 0, lng: 0 });
  const initialLocationAppliedRef = useRef(false);
  const [clusters, setClusters] = useState([]);

  useEffect(() => { BetaTracker.screen('TerritoryMapScreen'); }, []);

  // Homeowner data loading
  useEffect(() => {
    if (filters?.targetLensMode !== 'homeowner') return;
    loadHomeownerProspects();
  }, [filters?.targetLensMode, filters?.homeownerFilter, filters?.lookbackWindow, filters?.minHomeValue, filters?.maxHomeValue, filters?.minSqFt, filters?.maxSqFt, filters?.occupancyTypes, filters?.residentialPropertyTypes]);

  async function loadHomeownerProspects() {
    try {
      const { createSupabaseClient } = require('../utils/supabaseClient');
      const supaRaw = await AsyncStorage.getItem('@leadlens_supabase_settings');
      const settings = supaRaw ? JSON.parse(supaRaw) : {};
      const supabase = createSupabaseClient(settings);
      if (!supabase) return;

      const {
        homeownerFilter,
        lookbackWindow,
        minHomeValue,
        maxHomeValue,
        minSqFt,
        maxSqFt,
        occupancyTypes,
        residentialPropertyTypes,
      } = filters || {};

      let query = supabase
        .from('targetlens_prospects')
        .select('*')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .eq('lookback_bucket', lookbackWindow || '90d')
        .order('efficiency_score', { ascending: false })
        .limit(200);

      if (homeownerFilter === 'new_owner') query = query.eq('prospect_type', 'new_homeowner');
      if (homeownerFilter === 'current_owner') query = query.eq('prospect_type', 'current_homeowner');
      if (homeownerFilter === 'rental') query = query.eq('prospect_type', 'rental');

      if (typeof minHomeValue === 'number') query = query.gte('home_value_estimated', minHomeValue);
      if (typeof maxHomeValue === 'number') query = query.lte('home_value_estimated', maxHomeValue);
      if (typeof minSqFt === 'number') query = query.gte('home_sq_footage', minSqFt);
      if (typeof maxSqFt === 'number') query = query.lte('home_sq_footage', maxSqFt);

      if (occupancyTypes && !occupancyTypes.includes('all')) {
        const mapped = occupancyTypes.map(o => {
          if (o === 'owner_occupied') return 'current_homeowner';
          if (o === 'rental') return 'rental';
          if (o === 'leased') return 'rental'; // current schema only has rental
          return o;
        }).filter(Boolean);
        if (mapped.length) query = query.in('prospect_type', mapped);
      }

      if (residentialPropertyTypes && !residentialPropertyTypes.includes('all')) {
        // property_class mapping is approximate; refine as taxonomy is finalized
        const mapped = residentialPropertyTypes.map(t => {
          if (t === 'single_family') return ['Single Family', 'Single-Family', 'RESIDENTIAL', 'R'];
          if (t === 'multi_family') return ['Multi-Family', 'Duplex', 'Triplex', 'Fourplex'];
          if (t === 'condo_townhouse') return ['Condo', 'Townhouse'];
          if (t === 'mobile_home') return ['Mobile Home', 'Manufactured'];
          if (t === 'new_construction') return ['New Construction'];
          return [t];
        }).flat();
        if (mapped.length) {
          // Use ILIKE on property_class; Supabase .in is exact, so we use .or with ilike
          const orClause = mapped.map(m => `property_class.ilike.%${m}%`).join(',');
          query = query.or(orClause);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      setHomeownerProspects(data || []);
    } catch (err) {
      console.error('[HomeownerLoad]', err.message);
    }
  }

  const moveMapTo = useCallback((target, duration = 800) => {
    if (!target?.latitude || !target?.longitude) return;
    const safe = makeSafeRegion(target, regionRef.current || DEFAULT_TERRITORY_REGION);
    regionRef.current = safe;
    setRegion(safe);
    if (mapRef.current && isMapReadyRef.current) {
      try { mapRef.current.animateToRegion(safe, duration); } catch (e) {}
    }
  }, []);

  const setSafeRegion = useCallback((nextRegion) => {
    const safe = makeSafeRegion(nextRegion, regionRef.current);
    const prev = regionRef.current || DEFAULT_TERRITORY_REGION;
    if (
      Math.abs(prev.latitude - safe.latitude) < 0.0008
      && Math.abs(prev.longitude - safe.longitude) < 0.0008
      && Math.abs(prev.latitudeDelta - safe.latitudeDelta) < 0.001
      && Math.abs(prev.longitudeDelta - safe.longitudeDelta) < 0.001
    ) return;
    regionRef.current = safe;
    setRegion(safe);
  }, []);

  const fitMapToZipMarkers = useCallback((markers = []) => {
    const points = (markers || [])
      .map((marker) => marker?.coords)
      .filter((coord) => coord && isFinite(coord.latitude) && isFinite(coord.longitude));

    if (!points.length) return;

    const forceRegionFallback = () => {
      const lats = points.map((p) => Number(p.latitude));
      const lngs = points.map((p) => Number(p.longitude));
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      const latSpan = maxLat - minLat;
      const lngSpan = maxLng - minLng;

      // Guardrail: skip fallback when points span very large geographies.
      // In that case fitToCoordinates already does a better job.
      if (latSpan > 8 || lngSpan > 12) {
        console.log('[TerritoryMap] ZIP fit fallback skipped due to wide territory span:', {
          latSpan,
          lngSpan,
          pointCount: points.length,
        });
        return;
      }

      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const latDelta = Math.max(0.08, (maxLat - minLat) * 1.35);
      const lngDelta = Math.max(0.08, (maxLng - minLng) * 1.35);
      const regionTarget = {
        latitude: centerLat,
        longitude: centerLng,
        latitudeDelta: latDelta,
        longitudeDelta: lngDelta,
      };
      moveMapTo(regionTarget, 700);
      console.log('[TerritoryMap] ZIP fit fallback region applied:', regionTarget);
    };

    const doFit = () => {
      if (!mapRef.current || !isMapReadyRef.current) return false;
      try {
        mapRef.current.fitToCoordinates(points, {
          edgePadding: { top: 72, right: 52, bottom: screenHeight * 0.24, left: 52 },
          animated: true,
        });
        console.log('[TerritoryMap] ZIP fitToCoordinates success:', points.length);
        return true;
      } catch (err) {
        console.warn('[TerritoryMap] fitToCoordinates failed:', err?.message || err);
        return false;
      }
    };

    if (!doFit()) {
      setTimeout(() => {
        if (!doFit()) {
          forceRegionFallback();
        }
      }, 450);
    }
  }, [moveMapTo]);

  const refreshLeadData = useCallback(async () => {
    if (!hasLoadedMapRef.current) return;
    let rawLeads = [];
    try {
      const mmkvRaw = AsyncStorage.getSync(LEADS_STORAGE_KEY);
      if (mmkvRaw) rawLeads = JSON.parse(mmkvRaw);
      else {
        const RawStorage = require('@react-native-async-storage/async-storage').default;
        const asyncRaw = await RawStorage.getItem(LEADS_STORAGE_KEY);
        if (asyncRaw) rawLeads = JSON.parse(asyncRaw);
      }
    } catch (e) { console.warn('[TerritoryMap] Leads reload error:', e); }

    setLeads(rawLeads || []);
    setLeadMarkers((rawLeads || []).map(l => { const c = getLeadCoords(l); return c ? { ...l, coords: c } : null; }).filter(Boolean));

    setZipMarkers(prev => {
      if (!prev?.length || !rawLeads?.length) return prev;
      const allActivity = buildZipActivity(prev.map(m => ({ zip: m.zip })), rawLeads);
      const activityByZip = {};
      for (const act of allActivity) {
        if (act.zip) activityByZip[act.zip] = act;
      }
      return prev.map(marker => {
        const act = activityByZip[marker.zip] || null;
        const level = act?.heatLevel || 'none';
        return { ...marker, level, colors: getHeatColor(level), activity: act };
      });
    });
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;

    (async () => {
      const latestRevision = await getMyZipsRevision().catch(() => 0);
      const shouldReload = !hasLoadedMapRef.current || latestRevision !== territoryRevisionRef.current;

      if (shouldReload) {
        loadingRef.current = false;
        const didLoad = await loadMap();
        if (!cancelled && didLoad !== false) {
          hasLoadedMapRef.current = true;
          territoryRevisionRef.current = latestRevision;
        }
      } else if (!cancelled) {
        await refreshLeadData();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshLeadData]));

  useEffect(() => {
    if (isAppActive && !loading && region?.latitude && Math.abs(region.latitude) > 0.1) {
      const dist = getDistanceBetweenMeters({ latitude: region.latitude, longitude: region.longitude }, { latitude: lastFetchedCoordsRef.current.lat, longitude: lastFetchedCoordsRef.current.lng });
      if (lastFetchedCoordsRef.current.lat === 0) {
        lastFetchedCoordsRef.current = { lat: region.latitude, lng: region.longitude };
        fetchLensSignals(region.latitude, region.longitude);
      } else if (dist && dist > 1800) {
        if (signalFetchTimerRef.current) clearTimeout(signalFetchTimerRef.current);
        signalFetchTimerRef.current = setTimeout(() => {
          if (!loadingRef.current && isAppActive) {
            lastFetchedCoordsRef.current = { lat: region.latitude, lng: region.longitude };
            fetchLensSignals(region.latitude, region.longitude);
          }
        }, 2000);
      }
    }
    return () => { if (signalFetchTimerRef.current) clearTimeout(signalFetchTimerRef.current); };
  }, [loading, region.latitude, region.longitude, isAppActive]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') setLocationPermissionGranted(true);
      } catch (e) {}
    })();
  }, []);

  async function loadMap({ silent = false } = {}) {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    if (!silent) setLoading(true);
    try {
      console.log('[TerritoryMap] loadMap() started, fetching zips...');
      const [myZips, rawGoals, storedFilters, storedRegion, storedNearby] = await Promise.all([
        loadMyZips(),
        AsyncStorage.getItem(GOALS_STORAGE_KEY).then(r => r ? JSON.parse(r) : {}),
        AsyncStorage.getItem(MAP_FILTERS_KEY).then(r => r ? JSON.parse(r) : null),
        AsyncStorage.getItem(MAP_REGION_KEY).then(r => r ? JSON.parse(r) : null),
        AsyncStorage.getItem(MAP_NEARBY_PLACES_KEY).then(r => r ? JSON.parse(r) : null),
      ]);

      console.log('[TerritoryMap] Resolved myZips:', {
        count: myZips?.length,
        data: myZips?.slice(0, 3),
      });

      let resolvedMyZips = Array.isArray(myZips)
        ? myZips.map((entry) => _toNormalizedZipEntry(entry)).filter(Boolean)
        : [];
      if (!resolvedMyZips.length) {
        try {
          const remoteTerritory = await fetchMyTerritoryFromSupabase(supabase, user);
          if (remoteTerritory?.ok && Array.isArray(remoteTerritory.data) && remoteTerritory.data.length > 0) {
            resolvedMyZips = remoteTerritory.data
              .map((entry) => _toNormalizedZipEntry(entry))
              .filter(Boolean);
            await saveMyZips(resolvedMyZips).catch(() => {});
            console.log('[TerritoryMap] Loaded territory ZIPs from Supabase fallback:', resolvedMyZips.length);
          }
        } catch (remoteZipErr) {
          console.warn('[TerritoryMap] Supabase territory fallback failed:', remoteZipErr?.message || remoteZipErr);
        }
      }

      // Dual-read leads — check MMKV first, fall back to raw AsyncStorage
      let rawLeads = [];
      try {
        const mmkvRaw = AsyncStorage.getSync(LEADS_STORAGE_KEY);
        if (mmkvRaw) rawLeads = JSON.parse(mmkvRaw);
        else {
          const RawStorage = require('@react-native-async-storage/async-storage').default;
          const asyncRaw = await RawStorage.getItem(LEADS_STORAGE_KEY);
          if (asyncRaw) rawLeads = JSON.parse(asyncRaw);
        }
      } catch (e) { console.warn('[TerritoryMap] Leads load error:', e); }

      if (!silent) {
        if (storedFilters) {
          const mergedFilters = {
            ...DEFAULT_FILTERS,
            ...storedFilters,
            signals: {
              ...DEFAULT_FILTERS.signals,
              ...(storedFilters.signals || {}),
            },
          };
          setFilters(mergedFilters);
          console.log('[TerritoryMap] loaded stored filters', mergedFilters);
        } else {
          setFilters(DEFAULT_FILTERS);
        }
        isInitializedRef.current = true;
      }
      if (!silent) {
        if (storedNearby) {
          setNearbyPlaces(storedNearby);
          setShowNearby(true);
        }

        if (storedRegion) {
          setSafeRegion(storedRegion);
        }
      }

      const goal = Math.max(1, Number(rawGoals?.dailyProspects) || 10);
      setDailyGoal(goal);
      setLeads(rawLeads || []);
      setLeadMarkers((rawLeads || []).map(l => { const c = getLeadCoords(l); return c ? { ...l, coords: c } : null; }).filter(Boolean));
      // Deduplicate — same zip twice causes duplicate React keys crashing the map
      const seen = new Set();
      const uniqueMyZips = [];
      for (const entry of (resolvedMyZips || [])) {
        const normalized = _toNormalizedZipEntry(entry);
        if (!normalized) continue;
        if (seen.has(normalized.zip)) continue;
        seen.add(normalized.zip);
        uniqueMyZips.push(normalized);
      }

      const zipEntriesToRender = uniqueMyZips;
      setTotalLoadedZips(zipEntriesToRender.length);

      console.log('[TerritoryMap] zipEntriesToRender:', {
        count: zipEntriesToRender?.length,
        source: 'territory',
      });
      console.log('[TerritoryMap] myZips:', resolvedMyZips?.length, '->', uniqueMyZips.length, 'unique');

      // Do not block ZIP rendering on GPS. Territory users expect their stored ZIPs
      // to appear immediately, and GPS can stall indoors or during permission prompts.
      if (!initialLocationAppliedRef.current && zipEntriesToRender.length === 0) {
        initialLocationAppliedRef.current = true;
        getCurrentCoords()
          .then((current) => {
            if (!current) return;
            setLocationPermissionGranted(true);
            moveMapTo({ ...current, latitudeDelta: 0.08, longitudeDelta: 0.08 }, 400);
            console.log('[TerritoryMap] applied initial GPS location', { latitude: current.latitude, longitude: current.longitude });
          })
          .catch(() => null);
      }

      const buildMarkersFromZipEntries = async (entries = []) => {
        const normalizedEntries = entries
          .map((entry) => _toNormalizedZipEntry(entry))
          .filter(Boolean);
        console.log('[TerritoryMap] buildMarkersFromZipEntries called for mode:', filters.targetLensMode, 'entries:', normalizedEntries.length);
        const boundsMap = await getBulkZipBounds(normalizedEntries.map((entry) => entry.zip)).catch(() => ({}));
        // Pre-compute activity for all zips in one pass instead of per-zip O(N*M)
        const allActivity = buildZipActivity(normalizedEntries, rawLeads || []);
        const activityByZip = {};
        for (const act of allActivity) {
          if (act.zip) activityByZip[act.zip] = act;
        }
        const markers = [];
        for (const normalizedEntry of normalizedEntries) {
          const zip = normalizedEntry.zip;
          const bounds = boundsMap?.[zip] || null;
          if (!bounds?.center) {
            console.warn('[TerritoryMap] No boundary center for zip:', zip);
            continue;
          }
          const act = activityByZip[zip] || null;
          const level = act?.heatLevel || 'none';
          markers.push({
            zip,
            coords: bounds.center,
            allRings: bounds.allRings || [],
            level,
            colors: getHeatColor(level),
            activity: act,
          });
        }
        console.log('[TerritoryMap] buildMarkersFromZipEntries produced markers:', markers.length);
        return markers.filter((m) => isFinite(m?.coords?.latitude) && isFinite(m?.coords?.longitude));
      };

      let finalZipMarkers = [];
      let zipSource = 'none';

      if (zipEntriesToRender.length) {
        const activeZips = zipEntriesToRender.map((z) => z.zip);
        if (activeZips.length > 0) {
          supabase.functions.invoke('signal-ingest', {
            body: { zipCodes: activeZips }
          }).catch(e => console.warn('[TerritoryMap] Pulse failed:', e));
        }

        finalZipMarkers = await buildMarkersFromZipEntries(zipEntriesToRender);
        zipSource = 'territory';
      }

      if (finalZipMarkers.length === 0) {
        try {
          const fallbackMarkersRaw = await loadTerritoryZipMarkersFallback({ supabaseClient: supabase });
          const fallbackMarkers = [];
          for (const m of (fallbackMarkersRaw || [])) {
            const normalizedFallback = _toNormalizedZipEntry(m);
            if (!normalizedFallback) continue;
            const zip = normalizedFallback.zip;

            let coords =
              _makeSafeCoordinate(m?.coords)
              || _makeSafeCoordinate(m)
              || _makeSafeCoordinate(m?.centroid)
              || _makeSafeCoordinate(m?.coordinate)
              || null;
            let allRings = m?.allRings || m?.all_rings || m?.polygons || m?.coordinates || m?.geometry?.coordinates || [];

            if ((!coords || !Array.isArray(allRings) || allRings.length === 0) && zip) {
              const bounds = await getZipBounds(zip).catch(() => null);
              if (bounds) {
                coords = coords || bounds.center || null;
                if (!Array.isArray(allRings) || allRings.length === 0) {
                  allRings = bounds.allRings || [];
                }
              }
            }

            if (!coords || !isFinite(coords.latitude) || !isFinite(coords.longitude)) continue;
            fallbackMarkers.push({
              ...m,
              ...normalizedFallback,
              zip,
              coords,
              allRings,
              level: m?.level || 'none',
              colors: m?.colors || getHeatColor('none'),
            });
          }

          if (fallbackMarkers.length > 0) {
            finalZipMarkers = fallbackMarkers;
            zipSource = 'territory_loader';
          }
        } catch (fallbackErr) {
          console.warn('[TerritoryMap] Territory loader fallback failed:', fallbackErr);
        }
      }

      console.log('[TerritoryMap] ZIP source selected:', zipSource, 'count:', finalZipMarkers.length, '| totalLoadedZips:', zipEntriesToRender.length, '| mode:', filters.targetLensMode);
      if (finalZipMarkers.length > 0) {
        console.log('[TerritoryMap] First marker sample:', JSON.stringify(finalZipMarkers[0]).slice(0, 300));
      } else if (zipEntriesToRender.length > 0) {
        console.warn('[TerritoryMap] WARNING:', zipEntriesToRender.length, 'ZIPs loaded but 0 rendered - getZipBounds may be failing');
      }
      setZipMarkers(finalZipMarkers);
      if (finalZipMarkers.length > 0 && !silent) {
        fitMapToZipMarkers(finalZipMarkers);
      }
      return true;
    } catch (err) { console.warn('[TerritoryMap] loadMap failed:', err); }
    finally {
      if (!silent) setLoading(false);
      loadingRef.current = false;
      const safeFetchRegion = regionRef.current || region || DEFAULT_TERRITORY_REGION;
      if (isAppActive && lastFetchedCoordsRef.current.lat === 0 && safeFetchRegion?.latitude && Math.abs(safeFetchRegion.latitude) > 0.1) {
        console.log('[TerritoryMap] loadMap complete; performing initial lens signal fetch', { region: safeFetchRegion });
        lastFetchedCoordsRef.current = { lat: safeFetchRegion.latitude, lng: safeFetchRegion.longitude };
        fetchLensSignals(safeFetchRegion.latitude, safeFetchRegion.longitude);
      }
    }
    return false;
  }

  // Refetch ZIP boundaries when the territory mode changes so the polygon layer is rebuilt fresh
  const loadMapRef = useRef(loadMap);
  loadMapRef.current = loadMap;
  useEffect(() => {
    const mode = filters?.targetLensMode;
    if (!mode || !hasLoadedMapRef.current) return;
    console.log('[TerritoryMap] targetLensMode changed to', mode, '- refreshing ZIP boundaries');
    const refresh = async () => {
      loadingRef.current = false;
      await loadMapRef.current({ silent: true });
    };
    refresh();
  }, [filters?.targetLensMode]);

  const fetchLensSignals = async (lat, lng) => {
    if (!isAppActive) {
      console.log('[TerritoryMap] fetchLensSignals skipped because app is not active');
      return;
    }
    setLoadingLensSignal(true);
    try {
      console.log('[TerritoryMap] Fetching signals near', { lat, lng, radius: '25mi' });
      const rpcName = 'get_lenssignal_nearby';
      console.log('[TerritoryMap] Calling RPC:', rpcName);
      const { data, error } = await supabase.rpc(rpcName, { p_latitude: lat, p_longitude: lng, p_radius_miles: 25 });
      const records = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      console.log('[TerritoryMap] RPC response type:', typeof data, 'records length:', records.length);
      if (error) {
        console.warn('[TerritoryMap] Signal RPC error:', error);
      } else if (Array.isArray(records)) {
        if (!Array.isArray(data) && Array.isArray(data?.data)) {
          console.log('[TerritoryMap] RPC returned nested payload array in data.data');
        }
        console.log('[TerritoryMap] Got', records.length, 'signals:', records.slice(0, 3).map(s => ({ name: s.establishment_name, lat: s.latitude, lng: s.longitude })));
        setLensSignalRecords(records);
          // Debug: print a larger sample of returned signals (coords + id)
          try {
            console.log('[TerritoryMap] LensSignal sample:', records.slice(0, 6).map(s => ({ id: s.id, name: s.establishment_name || s.business_name, lat: s.latitude, lng: s.longitude })));
          } catch (e) {}
      } else {
        console.warn('[TerritoryMap] RPC returned non-array:', typeof data, data);
      }
    } catch (e) {
      console.error('[TerritoryMap] Fetch exception:', e?.message || String(e));
    } finally { setLoadingLensSignal(false); }
  };

  const lastScanTimeRef = useRef(null);
  useEffect(() => {
    AsyncStorage.getItem('leadlens_last_scan_time').then(v => {
      if (v) lastScanTimeRef.current = new Date(v).getTime();
    }).catch(() => {});
  }, []);

  const distanceInMiles = (lat1, lon1, lat2, lon2) => {
    if (!isFinite(lat1) || !isFinite(lon1) || !isFinite(lat2) || !isFinite(lon2)) return Infinity;
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const matchesActivityWindow = (lead, window) => {
    if (!window || window === 'all') return true;
    const raw = lead.lastActivity || lead.updated_at || lead.created_at || lead.scanned_at || lead.last_scanned_at;
    if (!raw) return window === 'never';
    const t = new Date(raw).getTime();
    if (!isFinite(t)) return window === 'never';
    const now = Date.now();
    const days = (now - t) / (1000 * 60 * 60 * 24);
    if (window === 'never') return false;
    if (window === 'stale') return days >= 90;
    const matchDays = { '7d': 7, '30d': 30, '90d': 90 }[window];
    return days <= matchDays;
  };

  const matchesContactCompleteness = (lead, mode) => {
    if (!mode || mode === 'all') return true;
    const phone = (lead.phone || lead.phoneNumber || lead.formatted_phone_number || lead.e164 || lead.bestPhone || '').toString().trim();
    const hasPhone = phone.length >= 7;
    const website = (lead.website || lead.url || lead.business_url || '').trim();
    const hasWebsite = website.length > 0;
    if (mode === 'has_phone') return hasPhone;
    if (mode === 'enriched') return hasPhone || hasWebsite || !!lead.enriched || !!lead.business_data_id;
    return true;
  };

  const matchesSignals = (leadSignals, filterSignals) => {
    const selectedKeys = Object.entries(filterSignals || {}).filter(([k, v]) => v).map(([k]) => k);
    if (selectedKeys.length === 0) return true;
    return selectedKeys.some(k => leadSignals[k]);
  };

  const matchesMatchStrength = (score, strength) => {
    if (!strength || strength === 'Show All') return true;
    if (!isFinite(score)) return strength === 'Needs Review';
    if (strength === 'Strong Matches') return score >= 0.8;
    if (strength === 'High Opportunity') return score >= 0.6;
    if (strength === 'Needs Review') return score < 0.6;
    return true;
  };

  const isLeadVisible = useCallback((lead) => {
    if (!lead?.coords || !filters) return false;
    const mode = filters.targetLensMode || 'business';
    const isResidential = lead.type === 'homeowner' || lead.type === 'residential' || lead.prospect_type === 'homeowner';
    if (mode === 'homeowner' && !isResidential) return false;
    if (mode === 'business' && isResidential) return false;
    const isBusinessMode = mode === 'business';

    const statuses = Array.isArray(filters.statuses) ? filters.statuses : ['All'];
    if (!statuses.includes('All')) {
      const leadStatus = (lead.status || 'Suspect').toString();
      if (!statuses.includes(leadStatus)) return false;
    }

    if (filters.radiusMiles && filters.radiusMiles > 0 && region?.latitude && region?.longitude) {
      const d = distanceInMiles(region.latitude, region.longitude, lead.coords.latitude, lead.coords.longitude);
      if (d > filters.radiusMiles) return false;
    }

    if (isBusinessMode) {
      const type = classifyGooglePlace(lead);
      if (filters.businessType !== 'All Businesses' && type !== filters.businessType) return false;
      const rating = parseFloat(lead.rating || lead.google_rating || lead.user_rating_total);
      if (filters.minRating && rating < filters.minRating) return false;
    }

    if (!matchesContactCompleteness(lead, filters.contactCompleteness)) return false;
    if (!matchesActivityWindow(lead, filters.activityWindow)) return false;

    if (filters.newSinceLastScan && lastScanTimeRef.current) {
      const t = new Date(lead.created_at || lead.updated_at || lead.scanned_at || lead.last_scanned_at).getTime();
      if (!isFinite(t) || t <= lastScanTimeRef.current) return false;
    }

    const leadSignals = {
      lensSignal: !!(lead.lensSignal || lead.lens_signal_id || lead.signal_id),
      contactSignal: !!lead.contactSignal,
      pest: !!(lead.lensSignal?.pest_indicator || lead.pest_indicator || lead.pest_signal),
      opening: (lead.lensSignal?.signal_layer || lead.lensSignal?.signal_type || lead.signal_type || lead.signal_layer) === 'Opening Signal',
      priority: (lead.lensSignal?.alert_level || lead.alert_level || lead.priority) === 'Priority Review',
    };
    const signalFilterActive = filters.signalsOnly || Object.values(filters.signals || {}).some(v => !v);
    if (signalFilterActive && !matchesSignals(leadSignals, filters.signals)) return false;

    const score = lead.score ?? lead.match_score ?? lead.confidence ?? (lead.lensSignal ? 0.75 : 0);
    if (!matchesMatchStrength(score, filters.matchStrength)) return false;

    if (!isBusinessMode) {
      const hv = parseFloat(lead.home_value || lead.estimated_value || lead.market_value || 0);
      if (filters.minHomeValue && hv < filters.minHomeValue) return false;
      if (filters.maxHomeValue && hv > filters.maxHomeValue) return false;
      const sqft = parseFloat(lead.sqft || lead.square_feet || lead.living_area || 0);
      if (filters.minSqFt && sqft < filters.minSqFt) return false;
      if (filters.maxSqFt && sqft > filters.maxSqFt) return false;
      const occ = (lead.occupancy_type || lead.occupancy || 'all').toString().toLowerCase();
      const occTypes = Array.isArray(filters.occupancyTypes) ? filters.occupancyTypes : ['all'];
      if (!occTypes.includes('all')) {
        if (!occTypes.includes(occ)) return false;
      }
      const propType = (lead.property_type || lead.property_class || lead.residential_type || 'all').toString().toLowerCase();
      const resTypes = Array.isArray(filters.residentialPropertyTypes) ? filters.residentialPropertyTypes : ['all'];
      if (!resTypes.includes('all')) {
        if (!resTypes.includes(propType)) return false;
      }
      if (filters.homeownerFilter && filters.homeownerFilter !== 'all') {
        const owner = (lead.owner_occupied || lead.owner_occupied_flag || lead.ownership || '').toString().toLowerCase();
        const isOwner = owner === 'true' || owner === 'yes' || owner === 'owner_occupied' || owner === 'owner';
        if (filters.homeownerFilter === 'owner' && !isOwner) return false;
        if (filters.homeownerFilter === 'non-owner' && isOwner) return false;
      }
      if (filters.lookbackWindow && filters.lookbackWindow !== 'all') {
        if (!matchesActivityWindow(lead, filters.lookbackWindow)) return false;
      }
    }

    if (!activeProfile) return true;
    const rawV = String(lead.vertical || '').trim();
    const leadV = (rawV || classifyVertical(lead).vertical || 'Other').toLowerCase().trim();
    const profC = String(activeProfile.category || '').toLowerCase().trim();
    if (profC && profC !== 'pest control' && leadV && leadV !== profC && !leadV.includes(profC) && !profC.includes(leadV)) return false;
    return true;
  }, [activeProfile, filters, region]);

  const filteredLeadMarkers = useMemo(() => leadMarkers.filter(isLeadVisible), [leadMarkers, isLeadVisible]);

  const safeNearbyPlaces = useMemo(() => {
    const raw = Array.isArray(nearbyPlaces) ? nearbyPlaces : [];
    if ((filters.targetLensMode || 'business') === 'homeowner') return [];
    return raw.map(p => {
      if (!p || !filters) return null;
      const type = classifyGooglePlace(p);
      let sig = null;
      let matchScore = 0;
      if (Array.isArray(lensSignalRecords)) {
        const matches = lensSignalRecords.map(r => ({ r, ...calculateMatchConfidence(r, { name: p.name, address: p.address, latitude: p.coords?.latitude, longitude: p.coords?.longitude }) })).filter(m => m.score >= 0.4).sort((a, b) => b.score - a.score);
        const best = matches[0];
        sig = best?.r || null;
        matchScore = best?.score || 0;
      }
      return {
        ...p, businessType: type, coordinate: p.coordinate || p.coords, lensSignal: sig,
        signals: { lensSignal: !!sig, contactSignal: !!p.contactSignal, pest: !!sig?.pest_indicator, opening: (sig?.signal_layer || sig?.signal_type) === 'Opening Signal', priority: sig?.alert_level === 'Priority Review' },
        matchScore,
      };
    }).filter(p => {
      if (!p || !p.coordinate || !filters) return false;
      const statuses = Array.isArray(filters.statuses) ? filters.statuses : ['All'];
      if (!statuses.includes('All')) {
        const pStatus = (p.status || 'Suspect').toString();
        if (!statuses.includes(pStatus)) return false;
      }
      if (filters.businessType !== 'All Businesses' && p.businessType !== filters.businessType) return false;
      if (filters.radiusMiles && filters.radiusMiles > 0 && region?.latitude && region?.longitude) {
        const d = distanceInMiles(region.latitude, region.longitude, p.coordinate.latitude, p.coordinate.longitude);
        if (d > filters.radiusMiles) return false;
      }
      const rating = parseFloat(p.rating || p.google_rating || p.user_rating_total);
      if (filters.minRating && rating < filters.minRating) return false;
      if (!matchesContactCompleteness(p, filters.contactCompleteness)) return false;
      if (!matchesActivityWindow(p, filters.activityWindow)) return false;
      if (filters.newSinceLastScan && lastScanTimeRef.current) {
        const t = new Date(p.created_at || p.updated_at || p.scanned_at).getTime();
        if (!isFinite(t) || t <= lastScanTimeRef.current) return false;
      }
      if (filters.signalsOnly || Object.values(filters.signals || {}).some(v => !v)) {
        if (!matchesSignals(p.signals, filters.signals)) return false;
      }
      if (!matchesMatchStrength(p.matchScore, filters.matchStrength)) return false;
      return true;
    });
  }, [nearbyPlaces, lensSignalRecords, filters, activeProfile, region]);

  useEffect(() => {
    try {
      const raw = Array.isArray(nearbyPlaces) ? nearbyPlaces.length : 'not array';
      const safe = Array.isArray(safeNearbyPlaces) ? safeNearbyPlaces.length : 'not array';
      console.log('[TerritoryMap] nearbyPlaces update:', { rawNearby: raw, safeNearby: safe });
      if (raw !== 0 && safe === 0) console.log('[TerritoryMap] WARNING: nearbyPlaces present but safeNearbyPlaces filtered to 0');
    } catch (e) {}
  }, [nearbyPlaces, safeNearbyPlaces]);

  useEffect(() => {
    if (!isAppActive || !filters) return;
    if (filters?.targetLensMode === 'homeowner') {
      setClusters([]);
      return;
    }
    if (clusterBuildTimerRef.current) clearTimeout(clusterBuildTimerRef.current);
    clusterBuildTimerRef.current = setTimeout(() => {
      const points = [];
      filteredLeadMarkers.forEach(l => { if (l?.coords && isFinite(l.coords.longitude) && isFinite(l.coords.latitude)) points.push({ type: 'Feature', properties: { cluster: false, lead: l, isLead: true }, geometry: { type: 'Point', coordinates: [l.coords.longitude, l.coords.latitude] } }); });
      if (showNearby) safeNearbyPlaces.forEach(p => { if (p?.coordinate && isFinite(p.coordinate.longitude) && isFinite(p.coordinate.latitude)) points.push({ type: 'Feature', properties: { cluster: false, place: p, isNearby: true }, geometry: { type: 'Point', coordinates: [p.coordinate.longitude, p.coordinate.latitude] } }); });
      if (filters.signals?.lensSignal && Array.isArray(lensSignalRecords)) {
        const beforeFilter = lensSignalRecords.length;
        const filteredAll = lensSignalRecords.filter(s => !['apartment', 'condo', 'residential'].some(k => (s.establishment_name || '').toLowerCase().includes(k)));
        const filtered = (MAP_SAFE_MODE && (region?.latitudeDelta || 0) > 0.12)
          ? filteredAll.slice(0, 120)
          : filteredAll;
        const afterFilter = filtered.length;
        if (lastLensCountRef.current !== beforeFilter) {
          console.log('[TerritoryMap] LensSignals: before filter:', beforeFilter, 'after filter:', afterFilter);
          lastLensCountRef.current = beforeFilter;
        }
        filtered.forEach(s => {
          if (isFinite(s.longitude) && isFinite(s.latitude)) {
            points.push({ type: 'Feature', properties: { cluster: false, signal: s, isLensSignal: true }, geometry: { type: 'Point', coordinates: [Number(s.longitude), Number(s.latitude)] } });
          }
        });
      }

      if (points.length === 0) {
        setClusters([]);
        return;
      }
      try {
        superclusterRef.current.load(points);
        const safeDeltaX = Math.max(region?.longitudeDelta || 0.01, 0.0001);
        const safeDeltaY = Math.max(region?.latitudeDelta || 0.01, 0.0001);
        const bBox = [
          (region?.longitude || 0) - safeDeltaX * 2,
          (region?.latitude || 0) - safeDeltaY * 2,
          (region?.longitude || 0) + safeDeltaX * 2,
          (region?.latitude || 0) + safeDeltaY * 2
        ];
        const rawZoom = Math.round(Math.log2(360 / safeDeltaX));
        const zoom = Math.min(20, Math.max(0, isFinite(rawZoom) ? rawZoom : 10));
        setClusters(superclusterRef.current.getClusters(bBox, zoom) || []);
      } catch (err) {
        console.warn("[Supercluster Error]:", err);
        setClusters([]);
      }
    }, 220);

    return () => {
      if (clusterBuildTimerRef.current) clearTimeout(clusterBuildTimerRef.current);
    };
  }, [filteredLeadMarkers, safeNearbyPlaces, lensSignalRecords, filters.signals?.lensSignal, isAppActive, showNearby, region]);

  const selectLeadSafe = (l) => { if (l) requestAnimationFrame(() => setSelectedLead(l)); };
  const getLeadAddress = (l) => l ? [[l.streetNumber, l.streetName].filter(Boolean).join(' '), l.city, l.state, l.zip].filter(Boolean).join(', ') : '';
  const getLeadSourceType = (l) => l?.sourceType || l?.captureMethod || 'Unknown';
  const getLeadConfidence = (l) => String(l?.locationConfidence || l?.confidence || 'medium').toLowerCase();
  const getDistanceBetweenMeters = (a, b) => { const R = 6371000, toRad = (d) => d * Math.PI / 180; if (!a?.latitude || !b?.latitude) return null; const dLat = toRad(b.latitude - a.latitude), dLon = toRad(b.longitude - a.longitude), lat1 = toRad(a.latitude), lat2 = toRad(b.latitude), c = 2 * Math.atan2(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2), Math.sqrt(1 - (Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2))); return Math.round(R * c); };
  const getLeadCoords = (l) => { const lat = Number(l.latitude ?? l.lat ?? l.captureLat ?? l.capture_lat ?? l.locationLat ?? l.latLng?.latitude); const lng = Number(l.longitude ?? l.lng ?? l.captureLng ?? l.capture_lng ?? l.locationLng ?? l.latLng?.longitude); return (isFinite(lat) && isFinite(lng)) ? { latitude: lat, longitude: lng } : null; };

  const handlePlaceTap = async (p) => {
    if (!p) return;
    setSelectedPlace({ ...p, loading: true });
    try {
      const enriched = await enrichBusinessWithPublicSources(p);
      setSelectedPlace({ ...enriched, loading: false });
    } catch (e) {
      console.warn("[TerritoryMap] Enrichment failed:", e.message);
      setSelectedPlace({ ...p, loading: false });
    }
  };

  const captureAsLead = () => {
    if (!selectedPlace) return;

    const addressSource = {
      ...selectedPlace,
      formattedAddress:
        selectedPlace.formattedAddress ||
        selectedPlace.formatted_address ||
        selectedPlace.fullAddress ||
        selectedPlace.address ||
        selectedPlace.vicinity ||
        "",
      address_components:
        selectedPlace.address_components ||
        selectedPlace.addressComponents ||
        selectedPlace.placeDetails?.address_components ||
        selectedPlace.googlePlace?.address_components ||
        [],
    };

    const parsedAddress = parseBusinessAddress(addressSource);
    const bestPhone = extractBestPhone(selectedPlace);

    const prospectToQueue = {
      businessName:
        selectedPlace.businessName ||
        selectedPlace.name ||
        selectedPlace.displayName ||
        "",
      streetNumber: parsedAddress.streetNumber || "",
      streetName: parsedAddress.streetName || "",
      addressLine2: parsedAddress.addressLine2 || "",
      city: parsedAddress.city || "",
      state: parsedAddress.state || "",
      zip: parsedAddress.zip || "",
      formattedAddress: parsedAddress.formattedAddress || "",
      phone: bestPhone || selectedPlace.phone || selectedPlace.phoneNumber || "",
      source: selectedPlace.source || "map",
      placeId: selectedPlace.place_id || selectedPlace.placeId || "",
      website: selectedPlace.website || "",
      captureMethod: 'Nearby Search',
      propertyType: 'Commercial',
      status: 'New'
    };


    setSelectedPlace(null);
    navigation.navigate('Review', { user, lead: prospectToQueue, editIdx: null });
  };

  const handleAddressChange = (text) => {
    setAddressQuery(text);
    setAutocompleteSuggestions([]);
    if (autocompleteTimerRef.current) clearTimeout(autocompleteTimerRef.current);
    if (text.length < 3) return;
    autocompleteTimerRef.current = setTimeout(async () => {
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${GOOGLE_MAPS_API_KEY}&types=geocode|establishment&components=country:us`;
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.predictions?.length) {
          setAutocompleteSuggestions(data.predictions.slice(0, 5));
        }
      } catch {}
    }, 350);
  };

  const selectSuggestion = async (suggestion) => {
    setAddressQuery(suggestion.description);
    setAutocompleteSuggestions([]);
    setAddressSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?place_id=${suggestion.place_id}&key=${GOOGLE_MAPS_API_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const loc = data.results?.[0]?.geometry?.location;
      if (loc) {
        moveMapTo({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
        const radiusMeters = Math.min((filters.radiusMiles || 5) * 1609.34, 50000);
        const results = await searchNearbyBusinesses({ center: { latitude: loc.lat, longitude: loc.lng }, radiusMeters, apiKey: GOOGLE_MAPS_API_KEY });
        if (results?.length) { setNearbyPlaces(results.map(r => ({ ...r, coordinate: r.coords }))); setShowNearby(true); }
      }
    } catch (err) {
      console.warn('[TerritoryMap] Suggestion select error:', err);
    } finally {
      setAddressSearching(false);
    }
  };

  const searchByAddress = async () => {
    if (!addressQuery.trim()) { searchNearby(); return; }
    setAddressSearching(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addressQuery)}&key=${GOOGLE_MAPS_API_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const loc = data.results?.[0]?.geometry?.location;
      if (loc) {
        moveMapTo({ latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600);
        const radiusMeters = Math.min((filters.radiusMiles || 5) * 1609.34, 50000);
        const results = await searchNearbyBusinesses({ center: { latitude: loc.lat, longitude: loc.lng }, radiusMeters, apiKey: GOOGLE_MAPS_API_KEY });
        if (results?.length) { setNearbyPlaces(results.map(r => ({ ...r, coordinate: r.coords }))); setShowNearby(true); }
        else showThemedAlert('No results', 'No businesses found at that location.');
      } else {
        showThemedAlert('Not found', 'Could not find that address.');
      }
    } catch (err) {
      showThemedAlert('Search failed', err.message || 'Could not search address.');
    } finally {
      setAddressSearching(false);
    }
  };

  const searchNearby = async () => {
    setSearchingNearby(true);
    try {
      // Use stored location first — set by App.js on startup, instant read
      let current = null;
      try {
        const stored = AsyncStorage.getSync('currentLocation');
        if (stored) {
          const loc = JSON.parse(stored);
          if (loc?.latitude && loc?.longitude) {
            current = { latitude: loc.latitude, longitude: loc.longitude };
          }
        }
      } catch {}

      // Fall back to live GPS if stored location not available
      if (!current) {
        current = await Promise.race([
          getCurrentCoords(),
          new Promise(resolve => setTimeout(() => resolve(null), 5000)),
        ]);
      }

      if (!current) {
        showThemedAlert('Location Required', 'Could not get your location. Try searching by address instead.');
        return;
      }

      const radiusMeters = Math.min((filters.radiusMiles || 5) * 1609.34, 50000);
      const results = await searchNearbyBusinesses({ center: current, radiusMeters, apiKey: GOOGLE_MAPS_API_KEY });
      if (results && Array.isArray(results) && results.length > 0) {
        setNearbyPlaces(results.map(r => ({ ...r, coordinate: r.coords })));
        setShowNearby(true);
        moveMapTo({ ...current, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 400);
      } else showThemedAlert('No results', 'No businesses found nearby.');

    } catch (e) {
      showThemedAlert('Search Error', String(e?.message || e));
    } finally {
      setSearchingNearby(false);
    }
  };

  const showPins = region.latitudeDelta <= 0.55;
  const isZoomedOut = (region?.latitudeDelta || 0) > 0.14;

  const handleLensSignalAction = useCallback(() => {
    setFilters((prev) => {
      const safe = prev || DEFAULT_FILTERS;
      return {
        ...safe,
        signals: {
          ...safe.signals,
          lensSignal: true,
        },
      };
    });

    if (isAppActive && isFinite(region?.latitude) && isFinite(region?.longitude)) {
      fetchLensSignals(region.latitude, region.longitude);
    }
  }, [isAppActive, region?.latitude, region?.longitude]);

  const mode = filters?.targetLensMode || 'business';

  const zipBoundaryOverlays = useMemo(() => {
    if (!Array.isArray(zipMarkers) || zipMarkers.length === 0) return [];
    console.log('[TerritoryMap] Rebuilding zipBoundaryOverlays for mode:', mode, 'markers:', zipMarkers.length);

    return zipMarkers.flatMap((m) => {
      try {
        const items = [];
        const zip = m.zip || m.zipCode || m.ZIP;
        const lat = parseFloat(m.coords?.latitude ?? m.coords?.lat ?? m.lat ?? m.centroid?.lat);
        const lng = parseFloat(m.coords?.longitude ?? m.coords?.lng ?? m.lng ?? m.centroid?.lng);

        const rawCoords =
          m.allRings ||
          m.polygons ||
          m.coordinates ||
          m.geometry?.coordinates ||
          [];

        let hasPolygon = false;
        if (Array.isArray(rawCoords)) {
          for (let rIdx = 0; rIdx < rawCoords.length; rIdx++) {
            const ring = rawCoords[rIdx];
            if (!Array.isArray(ring) || ring.length < 3) continue;
            const safeRing = ring
              .map((pt) => makeSafeCoordinate(pt))
              .filter(Boolean);
            if (safeRing.length >= 3) {
              hasPolygon = true;
              items.push(
                <Polygon
                  key={`zip-poly-${mode}-${zip}-${rIdx}`}
                  coordinates={safeRing}
                  strokeColor="#00C9FFCC"
                  fillColor="#00C9FF2A"
                  strokeWidth={selectedZip === zip ? 3.5 : 2.2}
                  onPress={() => setSelectedZip(zip)}
                />
              );
            }
          }
        }
        if (!hasPolygon && isFinite(lat) && isFinite(lng)) {
          items.push(
            <Circle
              key={`zip-circle-${mode}-${zip}`}
              center={{ latitude: lat, longitude: lng }}
              radius={3500}
              strokeColor="#00C9FFB0"
              fillColor="#00C9FF24"
              strokeWidth={1.8}
            />
          );
        }

        if (isFinite(lat) && isFinite(lng)) {
          items.push(
            <Marker
              key={`label-${mode}-${zip}`}
              coordinate={{ latitude: lat, longitude: lng }}
              onPress={() => setSelectedZip(zip)}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
            >
              <View style={[s.zipLabel, { borderColor: m.colors?.text || COLORS.purple }]}>
                <Text style={[s.zipLabelText, { color: m.colors?.text || COLORS.purple }]}>{zip}</Text>
              </View>
            </Marker>
          );
        }

        return items;
      } catch (err) {
        console.warn('[TerritoryMap] Polygon render error for marker:', m?.zip, err);
        return [];
      }
    }).filter(Boolean);
  }, [zipMarkers, selectedZip, isZoomedOut, mode]);

  const lensSignalDirectFallback = useMemo(() => {
    if (!MAP_SAFE_MODE) return [];
    if (!filters?.signals?.lensSignal) return [];
    if (!Array.isArray(lensSignalRecords) || lensSignalRecords.length === 0) return [];
    if (Array.isArray(clusters) && clusters.length > 0) return [];

    const safeDeltaX = Math.max(region?.longitudeDelta || 0.05, 0.01);
    const safeDeltaY = Math.max(region?.latitudeDelta || 0.05, 0.01);
    const minLng = (region?.longitude || 0) - safeDeltaX * 2;
    const maxLng = (region?.longitude || 0) + safeDeltaX * 2;
    const minLat = (region?.latitude || 0) - safeDeltaY * 2;
    const maxLat = (region?.latitude || 0) + safeDeltaY * 2;

    return lensSignalRecords
      .filter((s) => !['apartment', 'condo', 'residential'].some((k) => (s.establishment_name || '').toLowerCase().includes(k)))
      .filter((s) => {
        const lat = Number(s.latitude);
        const lng = Number(s.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return false;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      })
      .slice(0, 80);
  }, [clusters, filters?.signals?.lensSignal, lensSignalRecords, region]);

  const showMapActionButtons = !selectedLead && !selectedPlace && !selectedLensSignalRecord;

  return (
    <View style={s.root}>
      <ScreenHeader title="Territory Map" onBack={() => navigation.goBack()} badge={(totalLoadedZips || 0) + " ZIPS"} />

      {/* Address search bar with autocomplete */}
      <View style={{ marginHorizontal: 12, marginVertical: 8, zIndex: 100 }}>
        <View style={s.searchBar}>
          <TextInput
            style={s.searchInput}
            placeholder="Search address or business..."
            placeholderTextColor={COLORS.textDim || '#666'}
            value={addressQuery}
            onChangeText={handleAddressChange}
            onSubmitEditing={searchByAddress}
            returnKeyType="search"
          />
          <TouchableOpacity style={s.searchBtn} onPress={searchByAddress} disabled={addressSearching}>
            {addressSearching
              ? <ActivityIndicator size="small" color="#080A0F" />
              : <Text style={s.searchBtnText}>{ICON_SEARCH}</Text>
            }
          </TouchableOpacity>
        </View>
        {autocompleteSuggestions.length > 0 && (
          <View style={s.suggestionsBox}>
            {autocompleteSuggestions.map((suggestion, i) => (
              <TouchableOpacity
                key={suggestion.place_id}
                style={[s.suggestionItem, i > 0 && { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}
                onPress={() => selectSuggestion(suggestion)}
              >
                <Text style={s.suggestionText} numberOfLines={1}>{suggestion.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={s.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={region || DEFAULT_TERRITORY_REGION}
          onRegionChangeComplete={setSafeRegion}
          showsUserLocation={locationPermissionGranted && isAppActive}
          showsMyLocationButton={locationPermissionGranted && isAppActive}
          showsCompass={true}
          toolbarEnabled={true}
          loadingEnabled={true}
          loadingIndicatorColor="#00C9FF"
          moveOnMarkerPress={false}
          onMapReady={() => { isMapReadyRef.current = true; console.log('[TerritoryMap] Map ready'); }}
        >
          {/* ZIP Boundary Polygons — rendered in both business and homeowner modes */}
          {console.log('[TerritoryMap] Boundary layer render check. mode:', filters?.targetLensMode, 'show:', !lowMemoryMode, 'overlays:', zipBoundaryOverlays.length)}
          {!lowMemoryMode && zipBoundaryOverlays}
          {filters?.targetLensMode === 'business' && (clusters && Array.isArray(clusters)) ? clusters.map((c, i) => {
            if (!c?.geometry?.coordinates) return null;
            const [lng, lat] = c.geometry.coordinates;
            if (!isFinite(lat) || !isFinite(lng)) return null;
            const props = c.properties || {};
            if (props.cluster) return <MapClusterMarker key={`cluster-${c.id || ''}-${lat}-${lng}-${i}`} coordinate={{ latitude: lat, longitude: lng }} count={props.point_count} onPress={() => { try { const z = Math.min(superclusterRef.current.getClusterExpansionZoom(c.id), 20); mapRef.current?.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: z }); } catch(e) {} }} color={activeProfile?.themeColor || COLORS.accent} />;
            if (props.isLead) return <Marker key={`lead-${props.lead?.id || ''}-${lat}-${lng}-${i}`} coordinate={{ latitude: lat, longitude: lng }} onPress={() => selectLeadSafe(props.lead)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}><View style={[s.poiPin, props.lead?.has_signals && s.poiPinSignal, activeProfile && { backgroundColor: activeProfile.themeColor }]}><Text style={s.poiPinText}>{props.lead?.has_signals ? ICON_SIGNAL : "\u2022"}</Text></View></Marker>;
            if (!lowMemoryMode && props.isNearby && showNearby) return <Marker key={`near-${props.place?.placeId || ''}-${lat}-${lng}-${i}`} coordinate={{ latitude: lat, longitude: lng }} onPress={() => handlePlaceTap(props.place)} tracksViewChanges={false}><View style={s.placePin}><Text style={{ fontSize: 12 }}>{ICON_BUILDING}</Text>{props.place?.signals?.contactSignal ? <View style={s.smallBadge}><LensSignalBadge type="contact" /></View> : null}</View></Marker>;
            if (!lowMemoryMode && props.isLensSignal && filters?.signals?.lensSignal) return <LensSignalMapMarker key={`sig-${props.signal?.id || ''}-${lat}-${lng}-${i}`} signal={props.signal} onPress={async (s) => {
              if (s) {
                setSelectedLensSignalRecord({ ...s, loading: true });
                try {
                  const enriched = await enrichBusinessWithPublicSources(s);
                  setSelectedLensSignalRecord({ ...enriched, loading: false });
                } catch (e) {
                  setSelectedLensSignalRecord({ ...s, loading: false });
                }
              }
            }} activeProfile={activeProfile} />;
            return null;
          }).filter(Boolean) : []}
          {filters?.targetLensMode === 'business' && !lowMemoryMode && (lensSignalDirectFallback || []).map((signal, idx) => (
            <LensSignalMapMarker
              key={`sig-fallback-${signal?.id || idx}`}
              signal={signal}
              onPress={async (s) => {
                if (!s) return;
                setSelectedLensSignalRecord({ ...s, loading: true });
                try {
                  const enriched = await enrichBusinessWithPublicSources(s);
                  setSelectedLensSignalRecord({ ...enriched, loading: false });
                } catch {
                  setSelectedLensSignalRecord({ ...s, loading: false });
                }
              }}
              activeProfile={activeProfile}
            />
          ))}
          {filters?.targetLensMode === 'business' && (!lowMemoryMode && !MAP_SAFE_MODE && filters?.signals?.lensSignal && Array.isArray(lensSignalRecords)) ? lensSignalRecords.filter(s => s.polygon_json && (s.signal_layer || s.signal_type) === 'Compliance Signal').map((s, idx) => <Polygon key={`compliance-poly-${s.id || idx}`} coordinates={makeSafePolygonCoordinates(s.polygon_json)} fillColor="rgba(204,16,64,0.12)" strokeColor="rgba(204,16,64,0.5)" strokeWidth={2} />).filter(Boolean) : []}

          {/* Homeowner mode pins */}
          {filters?.targetLensMode === 'homeowner' && homeownerProspects
            .filter(p => {
              if (!p.lat || !p.lng) return false;
              const ownerFilter = filters?.homeownerFilter || 'all';
              if (ownerFilter === 'all') return true;
              if (ownerFilter === 'new_owner') return p.prospect_type === 'new_homeowner';
              if (ownerFilter === 'current_owner') return p.prospect_type === 'current_homeowner';
              if (ownerFilter === 'rental') return p.prospect_type === 'rental';
              return true;
            })
            .map((prospect, i) => {
              const isNewProp = prospect.prospect_type === 'new_homeowner';
              const isRental = prospect.prospect_type === 'rental';
              const pinColor = isNewProp ? '#00C9FF' : isRental ? '#CC1040' : '#7B3FBE';
              const pinEmoji = isNewProp ? '\uD83D\uDD11' : isRental ? '\uD83D\uDCCB' : '\uD83C\uDFE0';
              return (
                <Marker
                  key={`homeowner-${prospect.id || i}`}
                  coordinate={{ latitude: prospect.lat, longitude: prospect.lng }}
                  onPress={() => setSelectedHomeowner(prospect)}
                  tracksViewChanges={false}
                >
                  <View style={[s.homeownerPin, { borderColor: pinColor }]}>
                    <Text style={s.homeownerPinEmoji}>{pinEmoji}</Text>
                  </View>
                </Marker>
              );
            })
          }
        </MapView>
        {activeProfile && activeProfile.category !== 'Pest Control' && (
          <View style={s.activeProfileBadge}>
            <Text style={s.activeProfileLabel}>ACTIVE PROFILE</Text>
            <Text style={s.activeProfileValue}>{activeProfile.label}</Text>
          </View>
        )}
        {showMapActionButtons && (
          <View style={[s.bottomActions, { bottom: insets.bottom + 16 }]}>
            <TouchableOpacity style={s.actionBtn} onPress={searchNearby}><Text style={s.actionBtnIcon}>{ICON_SEARCH}</Text></TouchableOpacity>
            <TouchableOpacity
              style={s.actionBtn}
              onPress={() => setTargetLensVisible(true)}
              onLongPress={handleLensSignalAction}
            >
              <Text style={s.actionBtnIcon}>{ICON_TARGET}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={() => setFiltersVisible(true)}><Text style={s.actionBtnIcon}>{ICON_GEAR}</Text></TouchableOpacity>
            <TouchableOpacity style={s.actionBtn} onPress={loadMap}><Text style={s.actionBtnIcon}>{ICON_RELOAD}</Text></TouchableOpacity>
          </View>
        )}
        {!!selectedLead && (() => {
          const enrichment = buildEnrichmentBundle(selectedLead);
          const phone = selectedLead.phone || enrichment.primaryPhone;
          const phoneSource = enrichment.phoneCandidates?.find(p => p.phone === phone)?.source || "";
          const contacts = enrichment.contacts || [];

          return (
            <View style={[s.leadCard, { bottom: insets.bottom + 12 }]}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle} numberOfLines={1}>{selectedLead.businessName}</Text>
                <TouchableOpacity onPress={() => setSelectedLead(null)}>
                  <Text style={s.closeX}>{ICON_CROSS}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.cardDetail}>{getLeadAddress(selectedLead)}</Text>

              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Phone:</Text>
                {phone ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={{ color: COLORS.accent, fontSize: 14, fontWeight: '700' }}>📞 {phone}</Text>
                    {!!phoneSource && <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 1 }}>Source: {phoneSource}</Text>}
                  </View>
                ) : (
                  <Text style={{ color: COLORS.muted, fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>No phone found yet</Text>
                )}

                <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Possible POCs:</Text>
                {contacts.length > 0 ? (
                  <>
                    {contacts.slice(0, 3).map((c, i) => (
                      <View key={i} style={{ marginBottom: 6 }}>
                        <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '600' }}>
                          👤 {c.name} {c.title ? `— ${c.title}` : ''}
                        </Text>
                        {!!c.source && (
                          <Text style={{ color: COLORS.muted, fontSize: 10 }}>Source: {c.source}</Text>
                        )}
                      </View>
                    ))}
                    {contacts.length > 3 && (
                      <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '600' }}>+{contacts.length - 3} more possible contacts</Text>
                    )}
                  </>
                ) : (
                  <Text style={{ color: COLORS.muted, fontSize: 12, fontStyle: 'italic' }}>No possible POC found yet</Text>
                )}
              </View>

              <View style={[s.chipRow, { marginTop: 12 }]}>
                <View style={s.chip}><Text style={s.chipText}>{selectedLead.status || 'Suspect'}</Text></View>
                <View style={s.chip}><Text style={s.chipText}>{getLeadConfidence(selectedLead)}</Text></View>
              </View>
              <View style={s.actionRow}>
                <TouchableOpacity style={s.cardBtn} onPress={() => navigation.navigate('Review', { user, lead: selectedLead, editIdx: leads.findIndex(l => l.id === selectedLead.id) })}>
                  <Text style={s.cardBtnText}>View</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cardBtn} onPress={() => phone && Linking.openURL(`tel:${phone}`)}>
                  <Text style={s.cardBtnText}>Call</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.cardBtn} onPress={() => {
                  const coords = getLeadCoords(selectedLead);
                  if (coords) Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${coords.latitude},${coords.longitude}`);
                }}>
                  <Text style={s.cardBtnText}>Nav</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })()}

        {!!selectedPlace && (() => {
          const enrichment = buildEnrichmentBundle(
            selectedPlace,
            selectedPlace.placeDetails,
            selectedPlace.googlePlace,
            selectedPlace.publicRecord,
            selectedPlace.comptrollerRecord,
            selectedPlace.texasComptroller,
            selectedPlace.lensSignal,
            selectedPlace.enrichment
          );
          const phone = selectedPlace.phone || enrichment.primaryPhone;
          const phoneSource = enrichment.phoneCandidates?.find(p => p.phone === phone)?.source || "";
          const contacts = enrichment.contacts || [];
          const placeDisplayName =
            selectedPlace.name
            || selectedPlace.businessName
            || selectedPlace.displayName
            || selectedPlace.establishment_name
            || selectedPlace.business_name
            || 'Business';
          const placeDisplayAddress =
            selectedPlace.fullAddress
            || selectedPlace.formattedAddress
            || selectedPlace.formatted_address
            || selectedPlace.address
            || selectedPlace.vicinity
            || [selectedPlace.streetNumber, selectedPlace.streetName, selectedPlace.city, selectedPlace.state, selectedPlace.zip].filter(Boolean).join(' ')
            || 'Address unavailable';
          const placeRating =
            selectedPlace.rating
            ?? selectedPlace.placeDetails?.rating
            ?? selectedPlace.googlePlace?.rating
            ?? null;
          const placeScore =
            selectedPlace.total_score
            ?? selectedPlace.score
            ?? selectedPlace.match_score
            ?? selectedPlace.confidence_score
            ?? selectedPlace.lensSignal?.total_score
            ?? null;

          return (
            <View style={[s.leadCard, { bottom: insets.bottom + 12 }]}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle} numberOfLines={1}>{placeDisplayName}</Text>
                <TouchableOpacity onPress={() => setSelectedPlace(null)}>
                  <Text style={s.closeX}>{ICON_CROSS}</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.cardDetail}>{placeDisplayAddress}</Text>
              {(placeRating != null || placeScore != null) && (
                <Text style={s.cardDetail}>
                  {placeRating != null ? `Rating: ${placeRating}` : 'Rating: n/a'}
                  {placeScore != null ? `  •  Score: ${placeScore}` : ''}
                </Text>
              )}

              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                {selectedPlace.loading ? (
                  <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={COLORS.accent} />
                    <Text style={{ color: COLORS.accent, fontSize: 12, marginTop: 6 }}>Checking public/open records...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Phone:</Text>
                    {phone ? (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ color: COLORS.accent, fontSize: 14, fontWeight: '700' }}>📞 {phone}</Text>
                        {!!phoneSource && <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 1 }}>Source: {phoneSource}</Text>}
                      </View>
                    ) : (
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontStyle: 'italic', marginBottom: 8 }}>No phone found yet</Text>
                    )}

                    <Text style={{ color: COLORS.textDim, fontSize: 10, fontWeight: '800', marginBottom: 4, textTransform: 'uppercase' }}>Possible POCs:</Text>
                    {contacts.length > 0 ? (
                      <>
                        {contacts.slice(0, 3).map((c, i) => (
                          <View key={i} style={{ marginBottom: 6 }}>
                            <Text style={{ color: COLORS.text, fontSize: 13, fontWeight: '600' }}>
                              👤 {c.name} {c.title ? `— ${c.title}` : ''}
                            </Text>
                            {!!c.source && (
                              <Text style={{ color: COLORS.muted, fontSize: 10 }}>Source: {c.source}</Text>
                            )}
                          </View>
                        ))}
                        {contacts.length > 3 && (
                          <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '600' }}>+{contacts.length - 3} more possible contacts</Text>
                        )}
                      </>
                    ) : (
                      <Text style={{ color: COLORS.muted, fontSize: 12, fontStyle: 'italic' }}>No possible POC found yet</Text>
                    )}
                  </>
                )}
              </View>

              <TouchableOpacity style={[s.cardBtn, { marginTop: 10, backgroundColor: COLORS.accent }]} onPress={captureAsLead}>
                <Text style={[s.cardBtnText, { color: '#000' }]}>Capture Lead</Text>
              </TouchableOpacity>
            </View>
          );
        })()}
        {showNearby && !!nearbyPlaces.length && !selectedPlace && (
          <View style={[s.nearbyBatchCard, { bottom: insets.bottom + 12 }]}><Text style={s.cardDetail}>{nearbyPlaces.length} discovered businesses</Text><View style={s.actionRow}><TouchableOpacity style={s.cardBtn} onPress={() => setSelectedNearbyIds(nearbyPlaces.map(p => getNearbyPlaceId(p)))}><Text style={s.cardBtnText}>Select All</Text></TouchableOpacity><TouchableOpacity style={s.cardBtn} onPress={() => { setShowNearby(false); setNearbyPlaces([]); }}><Text style={s.cardBtnText}>Clear</Text></TouchableOpacity><TouchableOpacity style={[s.cardBtn, { backgroundColor: COLORS.accent }]} onPress={() => addSelectedNearbyToQueue()} disabled={!selectedNearbyIds.length}><Text style={[s.cardBtnText, { color: '#000' }]}>Add to Queue</Text></TouchableOpacity></View></View>
        )}
        <Modal visible={targetLensVisible} transparent animationType="slide" onRequestClose={() => setTargetLensVisible(false)}><View style={s.modal}><View style={s.modalContent}><TargetLensProfileSelector onProfileChange={(p, m) => { setActiveProfile(p); setSearchMode(m); setTargetLensVisible(false); }} /><TouchableOpacity style={s.closeBtn} onPress={() => setTargetLensVisible(false)}><Text style={s.closeBtnText}>Close</Text></TouchableOpacity></View></View></Modal>
        <LeadFiltersBottomSheet visible={filtersVisible} onClose={() => setFiltersVisible(false)} filters={filters || DEFAULT_FILTERS} onApply={f => setFilters(f)} onReset={() => setFilters(DEFAULT_FILTERS)} />
        {!!selectedLensSignalRecord && (
          <View style={{ position: 'absolute', zIndex: 180, top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'box-none' }}>
            <LensSignalDetailsCard
              signal={selectedLensSignalRecord}
              onClose={() => setSelectedLensSignalRecord(null)}
              onAddToQueue={(sig) => {
                try {
                  const enrichment = buildEnrichmentBundle(sig);
                  const poc = enrichment.primaryPOC;
                  const parsedAddress = parseBusinessAddress(sig.address || sig);

                  const lead = {
                    businessName: String(sig.establishment_name || sig.business_name || 'Signal'),
                    phone: enrichment.primaryPhone || '',
                    pocFirst: poc?.firstName || '',
                    pocLast: poc?.lastName || '',
                    pocName: poc?.fullName || '',
                    title: poc?.title || '',
                    streetNumber: parsedAddress.streetNumber || '',
                    streetName: parsedAddress.streetName || '',
                    addressLine2: parsedAddress.addressLine2 || '',
                    city: parsedAddress.city || String(sig.city || ''),
                    state: parsedAddress.state || String(sig.state || ''),
                    zip: parsedAddress.zip || String(sig.zip || ''),
                    status: 'New',
                    vertical: 'Other',
                    captureMethod: 'LensSignal',
                    source: String(sig.source_name || 'LensSignal'),
                    propertyType: 'Commercial',
                    lens_signal_id: sig.id,
                    lensSignal: sig,
                    contactCandidates: enrichment.contacts,
                  };
                  navigation.navigate('Review', { user, lead, editIdx: null });
                  setSelectedLensSignalRecord(null);
                } catch (e) {
                  console.warn('[TerritoryMapScreen] onAddToQueue failed:', e);
                }
              }}
            />
          </View>
        )}

        {/* Homeowner signal card */}
        {filters?.targetLensMode === 'homeowner' && selectedHomeowner && (
          <HomeownerSignalCard
            prospect={selectedHomeowner}
            onClose={() => setSelectedHomeowner(null)}
            onAddToQueue={(p) => {
              try {
                const lead = {
                  id: `homeowner_${Date.now()}`,
                  businessName: p.grantee_name || p.owner_name || 'Homeowner',
                  address: p.address,
                  city: p.city,
                  state: p.state,
                  zip: p.zip,
                  phone: p.owner_phone || '',
                  email: p.owner_email || '',
                  latitude: p.lat,
                  longitude: p.lng,
                  captureMethod: 'TargetLens_Homeowner',
                  status: 'New',
                  propertyType: 'Residential',
                };
                navigation.navigate('Review', { user, lead, editIdx: null });
                setSelectedHomeowner(null);
              } catch (e) {
                console.warn('[TerritoryMapScreen] homeowner addToQueue failed:', e);
              }
            }}
          />
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  map: { ...StyleSheet.absoluteFillObject },
  zipLabel: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: COLORS.surface },
  zipLabelText: { fontSize: 10, fontWeight: '700' },
  poiPin: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fff' },
  poiPinSignal: { backgroundColor: COLORS.purple, width: 28, height: 28, borderRadius: 14 },
  poiPinText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  placePin: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF6B2B', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fff' },
  bottomActions: { position: 'absolute', right: 16, gap: 10, zIndex: 120, elevation: 30 },
  actionBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center', elevation: 12, borderWidth: 1, borderColor: COLORS.borderLit },
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.surface || '#111318', borderRadius: 12, borderWidth: 1, borderColor: COLORS.borderLit || '#2a3038', overflow: 'hidden' },
  searchInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, color: COLORS.text || '#fff', fontSize: 13 },
  searchBtn: { width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00C9FF' },
  searchBtnText: { fontSize: 16 },
  suggestionsBox: { backgroundColor: COLORS.surface || '#111318', borderRadius: 8, borderWidth: 1, borderColor: COLORS.borderLit || '#2a3038', marginTop: 2, overflow: 'hidden' },
  suggestionItem: { paddingHorizontal: 14, paddingVertical: 11 },
  suggestionText: { color: COLORS.text || '#fff', fontSize: 13 },
  actionBtnIcon: { fontSize: 20 },
  activeProfileBadge: { position: 'absolute', top: 80, left: 16, backgroundColor: 'rgba(0,0,0,0.6)', padding: 6, borderRadius: 8 },
  activeProfileLabel: { color: COLORS.label, fontSize: 8 },
  activeProfileValue: { color: COLORS.accent, fontSize: 10, fontWeight: '800' },
  mapHintBar: { position: 'absolute', top: 120, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.5)', padding: 4, borderRadius: 4 },
  mapHintText: { color: '#fff', fontSize: 10, textAlign: 'center' },
  leadCard: { position: 'absolute', left: 16, right: 16, backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, elevation: 10, borderWidth: 1, borderColor: COLORS.borderLit, zIndex: 50 },
  nearbyBatchCard: { position: 'absolute', left: 16, right: 16, backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, elevation: 10, borderWidth: 1, borderColor: COLORS.borderLit, zIndex: 40 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1 },
  closeX: { color: COLORS.muted, fontSize: 18, padding: 4 },
  cardDetail: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  chip: { backgroundColor: COLORS.surface2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  chipText: { color: COLORS.text, fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  cardBtn: { flex: 1, backgroundColor: COLORS.surface2, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardBtnText: { color: COLORS.accent, fontSize: 12, fontWeight: '700' },
  modal: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: COLORS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  closeBtn: { marginTop: 20, padding: 12, alignItems: 'center', backgroundColor: COLORS.surface2, borderRadius: 10 },
  closeBtnText: { color: COLORS.text, fontWeight: '700' },
  smallBadge: { position: 'absolute', top: -4, right: -4 },
  profileSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#0D1117',
    borderRadius: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1E2530',
  },
  profileTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  profileTabActive: {
    backgroundColor: '#00C9FF22',
    borderWidth: 1,
    borderColor: '#00C9FF',
  },
  profileTabText: { color: '#B8BDD0', fontSize: 13, fontWeight: '600' },
  homeownerPin: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#080A0F', borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 3,
  },
  homeownerPinEmoji: { fontSize: 16 },
});
