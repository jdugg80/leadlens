import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView, Linking,
} from 'react-native';
import MapView, { Polygon, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

import {
  makeSafeRegion,
  makeSafeMarkers,
  makeSafePolygons,
  makeSafeCoordinate,
  makeSafePolygonCoordinates,
  isValidCoordinate,
  DEFAULT_TERRITORY_REGION,
} from '../utils/mapSafety';

// Crash-guard: inline fallbacks in case mapSafety doesn't export these yet
const _makeSafeCoordinate = typeof makeSafeCoordinate === 'function'
  ? makeSafeCoordinate
  : (coord) => {
      if (!coord) return null;
      const lat = Number(coord.latitude ?? coord.lat);
      const lng = Number(coord.longitude ?? coord.lng);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      return { latitude: lat, longitude: lng };
    };

const _isValidCoordinate = typeof isValidCoordinate === 'function'
  ? isValidCoordinate
  : (lat, lng) => {
      const la = Number(lat);
      const lo = Number(lng);
      return isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
    };

import { loadTerritoryZipMarkersFallback } from '../utils/territoryZipLoader';
import { useFocusEffect } from '@react-navigation/native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader } from '../components/UI';
import {
  loadMyZips, loadSharedTerritories, buildZipActivity,
  getHeatLevel, getHeatColor, getHeatLabel, GOALS_STORAGE_KEY,
} from '../utils/territoryUtils';
import { sortLeadsNewestFirst } from '../utils/leadHelpers';
import { getZipBounds } from '../utils/zipBoundaryCache';
import { getCurrentCoords } from '../utils/geoEnrich';
import { recordUserActivityEvent, loadUserLearningProfile } from '../utils/userLearning';
import { extractSocialLinksFromWebsite, socialLinksToLeadFields } from '../utils/socialEnrichment';
import { showThemedAlert } from '../components/ThemedAlert';
import { getStyledMessage } from '../utils/aiPersonality';
import { enqueueTask, TASK_TYPES } from '../utils/taskQueue';
import { processQueue } from '../utils/taskRunner';

import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  searchNearbyBusinesses,
  fetchPlaceDetails,
  parseAddressComponents,
  BUSINESS_TYPE_BUCKETS,
  classifyGooglePlace,
} from '../utils/nearbySearch';

import { fetchLensSignalNearby } from '../features/lenssignal/lenssignalApi';
import { LensSignalMapMarker } from '../features/lenssignal/LensSignalMapMarker';
import { LensSignalBadge } from '../features/lenssignal/LensSignalBadge';
import { LensSignalDetailsCard } from '../features/lenssignal/LensSignalDetailsCard';
import { saveUserLocationStatus } from '../features/lenssignal/saveUserLocationStatus';
import LeadFiltersBottomSheet from '../components/LeadFiltersBottomSheet';
import TargetLensProfileSelector from '../components/TargetLensProfileSelector';
import { Modal } from 'react-native';

import {
  runLensSignalSearchForViewport,
  LensSignalSearchStatus
} from '../services/lensSignal/lensSignalService';
import { calculateMatchConfidence } from '../services/lensSignal/lensSignalMatcher';
import { enrichWithContactSignal } from '../services/contactSignal/contactSignalService';
import { processTargetLensMatch } from '../services/targetLens/targetLensMatcher';
import { TARGET_LENS_SEARCH_MODE_KEY } from '../constants';
import Supercluster from 'supercluster';
import { MapClusterMarker } from '../features/map/MapClusterMarker';
import BetaTracker from '../../utils/betaTracker';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI';
const NEARBY_SEARCH_CACHE_KEY = '@leadlens_nearby_search_cache';
const MAX_NEARBY_REQUESTS = 20;
const NEARBY_CACHE_TTL = 30 * 60 * 1000;
const DEFAULT_NEARBY_TYPES = [
  {
    label: 'Warehousing',
    type: 'warehousing',
    googleType: 'storage',
    keyword: 'warehouse warehousing cold storage distribution center',
    vertical: 'Warehousing',
  },
  {
    label: 'Food & Beverage Processing',
    type: 'food_beverage_processing',
    googleType: 'establishment',
    keyword: 'food beverage processing plant packaging manufacturing commissary',
    vertical: 'Food & Beverage Processing',
  },
  {
    label: 'Schools / Daycares',
    type: 'schools_daycares',
    googleType: 'school',
    keyword: 'school daycare childcare preschool academy',
    vertical: 'Schools / Daycares',
  },
  {
    label: 'Medical',
    type: 'medical',
    googleType: 'doctor',
    keyword: 'medical clinic hospital dental urgent care physician health',
    vertical: 'Medical',
  },
  {
    label: 'Retail',
    type: 'retail',
    googleType: 'store',
    keyword: 'retail store shop market shopping',
    vertical: 'Retail',
  },
  {
    label: 'Office Buildings',
    type: 'office_buildings',
    googleType: 'establishment',
    keyword: 'office building business office corporate office professional services business park',
    vertical: 'Office Buildings',
  },
  {
    label: 'Hotels / Motels / Apartments',
    type: 'hospitality_multifamily',
    googleType: 'lodging',
    keyword: 'hotel motel inn suites apartments multifamily leasing residential',
    vertical: 'Hotels / Motels / Apartments',
  },
  {
    label: 'Government',
    type: 'government',
    googleType: 'local_government_office',
    keyword: 'government municipal city county federal office courthouse public agency',
    vertical: 'Government',
  },
  {
    label: 'Logistics / Distribution',
    type: 'logistics_distribution',
    googleType: 'moving_company',
    keyword: 'logistics distribution freight shipping fulfillment supply chain 3pl',
    vertical: 'Logistics / Distribution',
  },
  {
    label: 'Restaurants',
    type: 'restaurants',
    googleType: 'restaurant',
    keyword: 'restaurant dining cafe eatery grill',
    vertical: 'Restaurants',
  },
  {
    label: 'Other',
    type: 'other',
    googleType: 'establishment',
    keyword: 'commercial business industrial services',
    vertical: 'Other',
  },
];
const NEARBY_RADIUS_OPTIONS = [250, 500, 1000, 2500, 5000];
const NEARBY_MAX_RESULTS_OPTIONS = [25, 50, 100];

export default function TerritoryMapScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('TerritoryMapScreen');
  }, []);

  const { user, initialZip, initialNearbySearch } = route?.params || {};
  const mapRef = useRef(null);
  const loadingRef = useRef(false);
  const locationLoadedRef = useRef(false);
  const signalFetchTimerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [initialNearbyTriggered, setInitialNearbyTriggered] = useState(false);
  const [statusText, setStatusText] = useState('Loading map...');
  const [dailyGoal, setDailyGoal] = useState(10);
  const [zipMarkers, _setZipMarkers] = useState([]);

  // HARD DATA DEBUG PATCH ACTIVE - zipMarkers
  const setZipMarkers = (nextZipMarkers) => {
    _setZipMarkers(nextZipMarkers);
  };
// LeadLens territory map data debug patch.
  // This tells us whether ZIP marker data is ever being built and saved into state.
  const setZipMarkersWithLog = (nextZipMarkers) => {
    const count = Array.isArray(nextZipMarkers) ? nextZipMarkers.length : 'not array';

    console.log('[TerritoryMapScreen] setZipMarkers called:', {
      count,
      sample: Array.isArray(nextZipMarkers) ? nextZipMarkers[0] : nextZipMarkers,
    });

    setZipMarkers(nextZipMarkers);
  };

  useEffect(() => {
    console.log('[TerritoryMapScreen] zipMarkers state changed:', {
      count: Array.isArray(zipMarkers) ? zipMarkers.length : 'not array',
      sample: Array.isArray(zipMarkers) ? zipMarkers[0] : zipMarkers,
    });
  }, [zipMarkers]);

  const [sharedMarkers, setSharedMarkers] = useState([]);
  const [zipActivity, setZipActivity] = useState([]);
  const [selectedZip, setSelectedZip] = useState(null);
  const [nearbyPlaces, _setNearbyPlaces] = useState([]);

  // HARD DATA DEBUG PATCH ACTIVE - nearbyPlaces
  const setNearbyPlaces = (nextNearbyPlaces) => {
    _setNearbyPlaces(nextNearbyPlaces);
  };
// LeadLens nearby places data debug patch.
  const setNearbyPlacesWithLog = (nextNearbyPlaces) => {
    const count = Array.isArray(nextNearbyPlaces) ? nextNearbyPlaces.length : 'not array';

    console.log('[TerritoryMapScreen] setNearbyPlaces called:', {
      count,
      sample: Array.isArray(nextNearbyPlaces) ? nextNearbyPlaces[0] : nextNearbyPlaces,
    });

    setNearbyPlaces(nextNearbyPlaces);
  };

  useEffect(() => {
    console.log('[TerritoryMapScreen] nearbyPlaces state changed:', {
      count: Array.isArray(nearbyPlaces) ? nearbyPlaces.length : 'not array',
      sample: Array.isArray(nearbyPlaces) ? nearbyPlaces[0] : nearbyPlaces,
    });
  }, [nearbyPlaces]);

  const [selectedPlace, setSelectedPlace] = useState(null);
  const [searchingNearby, setSearchingNearby] = useState(false);
  const [showNearby, setShowNearby] = useState(false);
  const [nearbySearchStatus, setNearbySearchStatus] = useState('');
  const [nearbySearchProgress, setNearbySearchProgress] = useState(0);
  const [selectedNearbyIds, setSelectedNearbyIds] = useState([]);

  // Unified Filter State
  const DEFAULT_FILTERS = {
    businessType: 'All Businesses',
    leadStatus: 'All',
    signalsOnly: true, // Default to true to prioritize signals over discovery
    signals: {
      lensSignal: true,
      contactSignal: true,
      pest: true,
      opening: true,
      priority: true,
    },
    matchStrength: 'Show All',
  };
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filtersVisible, setFiltersVisible] = useState(false);

  // TargetLens Profile state
  const [targetLensVisible, setTargetLensVisible] = useState(false);
  const [activeProfile, setActiveProfile] = useState(null);

  // LensSignal state
  const [lensSignalRecords, setLensSignalRecords] = useState([]);
  const [loadingLensSignal, setLoadingLensSignal] = useState(false);
  const [selectedLensSignalRecord, setSelectedLensSignalRecord] = useState(null);
  const [lensSignalSearchStatus, setLensSignalSearchStatus] = useState(null);

  const [leads, setLeads] = useState([]);
  const [leadMarkers, setLeadMarkers] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);

  // Search Mode for TargetLens
  const [searchMode, setSearchMode] = useState('Strict');

  // Clustering state
  const [clusters, setClusters] = useState([]);
  const superclusterRef = useRef(null);

  // P0 stability: keep territory polygons static.
  // The old pulsing fill forced MapView to redraw every 300ms, which caused visible map jitter
  // and increased crash risk on lower-memory Android devices.
  const [region, setRegion] = useState(DEFAULT_TERRITORY_REGION);
  const regionRef = useRef(null);
  const lastFetchedCoordsRef = useRef({ lat: 0, lng: 0 });

  // Helper to move the map programmatically without triggering loops
  const moveMapTo = useCallback((target, duration = 800) => {
    if (!target?.latitude || !target?.longitude) return;

    const safe = makeSafeRegion(target, regionRef.current || DEFAULT_TERRITORY_REGION);
    regionRef.current = safe;
    setRegion(safe);

    if (mapRef.current) {
      mapRef.current.animateToRegion(safe, duration);
    }
  }, []);

  const setSafeRegion = useCallback((nextRegion, source = 'unknown') => {
    const safe = makeSafeRegion(nextRegion, regionRef.current);
    const prev = regionRef.current || DEFAULT_TERRITORY_REGION;

    const changed =
      Math.abs(Number(prev.latitude) - Number(safe.latitude)) > 0.00008 ||
      Math.abs(Number(prev.longitude) - Number(safe.longitude)) > 0.00008 ||
      Math.abs(Number(prev.latitudeDelta) - Number(safe.latitudeDelta)) > 0.0005 ||
      Math.abs(Number(prev.longitudeDelta) - Number(safe.longitudeDelta)) > 0.0005;

    if (!changed) return;

    regionRef.current = safe;
    if (__DEV__) {
      console.log('[TerritoryMapScreen] region updated:', { source, safe });
    }
    setRegion(safe);
  }, []);

  useFocusEffect(useCallback(() => {
    if (!loadingRef.current) {
      loadMap();
    }
  }, []));

  useEffect(() => {
    // Debounced Signal Fetch: Only fetch when NOT loading the map and we have a "real" region
    // Robustness fix: remove locationLoadedRef check if we have a valid region center
    if (!loading && region?.latitude && region?.longitude && (Math.abs(region.latitude) > 0.1)) {
      const dist = getDistanceBetweenMeters(
        { latitude: region.latitude, longitude: region.longitude },
        { latitude: lastFetchedCoordsRef.current.lat, longitude: lastFetchedCoordsRef.current.lng }
      );

      // Only fetch if we've moved more than 600 meters or haven't fetched yet
      if (lastFetchedCoordsRef.current.lat === 0 || (dist && dist > 600)) {
        if (signalFetchTimerRef.current) clearTimeout(signalFetchTimerRef.current);

        signalFetchTimerRef.current = setTimeout(() => {
          if (!loadingRef.current) {
            console.log('[LensSignal] Triggering fetch for view:', region.latitude, region.longitude);
            lastFetchedCoordsRef.current = { lat: region.latitude, lng: region.longitude };
            // Use dynamic radius instead of hardcoded 5mi
            fetchLensSignals(region.latitude, region.longitude);
          }
        }, 1000);
      }
    }
    return () => { if (signalFetchTimerRef.current) clearTimeout(signalFetchTimerRef.current); };
  }, [loading, region?.latitude, region?.longitude]);

  async function loadMap() {
    if (loadingRef.current) return;
    loadingRef.current = true;

    saveUserLocationStatus('active_app').catch(() => {});
    setLoading(true);
    setStatusText('Initializing territory...');
    setZipMarkersWithLog([]);
    setSharedMarkers([]);
    setSelectedZip(null);

    try {
      // ── Step 1: Get GPS immediately so the map opens on the right location ──
      // This runs BEFORE zip geocoding regardless of whether the user has ZIPs.
      setStatusText('Getting your location...');
      const current = await getCurrentCoords().catch(() => null);
      if (current?.latitude && current?.longitude) {
        locationLoadedRef.current = true;
        moveMapTo({
          latitude: current.latitude,
          longitude: current.longitude,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }, 400);
      }

      const [myZips, shared, rawLeads, rawGoals, learningProfile] = await Promise.all([
        loadMyZips(),
        loadSharedTerritories(),
        AsyncStorage.getItem(LEADS_STORAGE_KEY).then(r => r ? JSON.parse(r) : []),
        AsyncStorage.getItem(GOALS_STORAGE_KEY).then(r => r ? JSON.parse(r) : {}),
        loadUserLearningProfile(),
      ]);

      const goal = Math.max(1, Number(rawGoals?.dailyProspects) || 10);
      setDailyGoal(goal);

      const activity = buildZipActivity(myZips, rawLeads || []);
      setZipActivity(activity);
      setLeads(rawLeads || []);
      setLeadMarkers((rawLeads || []).map(l => {
        const coords = getLeadCoords(l);
        return coords ? { ...l, coords } : null;
      }).filter(Boolean));

      let targetRegion = null;

      if (!myZips.length) {
        // No ZIPs — stay on GPS location already set above, just widen the view
        if (current?.latitude && current?.longitude) {
          targetRegion = {
            latitude: current.latitude,
            longitude: current.longitude,
            latitudeDelta: 0.15,
            longitudeDelta: 0.15,
          };
        }
      } else {
        const markers = [];
        const allCoords = [];
        for (const entry of myZips) {
          const bounds = await getZipBounds(entry.zip);
          if (!bounds) continue;
          const act = activity.find(a => a.zip === entry.zip);
          const level = getHeatLevel(act?.dailyAvg || 0, goal);
          markers.push({
            zip: entry.zip, coords: bounds.center, allRings: bounds.allRings,
            level, colors: getHeatColor(level), activity: act
          });
          if (bounds.polygon) allCoords.push(...bounds.polygon);
        }
        setZipMarkersWithLog(markers);

        if (allCoords.length) {
          const lats = allCoords.map(c => Number(c.latitude));
          const lngs = allCoords.map(c => Number(c.longitude));
          targetRegion = {
            latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
            longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
            latitudeDelta: Math.max((Math.max(...lats) - Math.min(...lats)) * 1.4, 0.08),
            longitudeDelta: Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.4, 0.08),
          };
        }
      }

      if (initialZip) {
        const bounds = await getZipBounds(initialZip);
        if (bounds) {
          setSelectedZip(initialZip);
          targetRegion = { latitude: bounds.center.latitude, longitude: bounds.center.longitude, latitudeDelta: 0.12, longitudeDelta: 0.12 };
        }
      }

      if (targetRegion) {
        moveMapTo(targetRegion, 1000);
      }

      if (shared.length) {
        const sharedResults = [];
        for (const rep of shared) {
          for (const zip of rep.zips || []) {
             const b = await getZipBounds(zip);
             if (b) sharedResults.push({ zip, coords: b.center, allRings: b.allRings, repName: rep.repName });
          }
        }
        setSharedMarkers(sharedResults);
      }

      setStatusText('');
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.warn('[TerritoryMap] loadMap failed:', err);
      setStatusText('Error: ' + err.message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    if (!loading && initialZip && initialNearbySearch && !initialNearbyTriggered && Array.isArray(zipMarkers) && zipMarkers.length > 0) {
      const timer = setTimeout(() => {
        setInitialNearbyTriggered(true);
        searchNearby().catch((error) => {
          console.log('[TerritoryMapScreen] Initial nearby search failed:', error?.message || String(error));
        });
      }, 650);

      return () => clearTimeout(timer);
    }
  }, [loading, initialZip, initialNearbySearch, initialNearbyTriggered, zipMarkers.length, region.latitude, region.longitude]);

  const searchNearby = async () => {
    console.log('[TerritoryMapScreen] Search Nearby triggered');
    await runNearbySearch();
    if (selectedZip || initialZip) {
      recordUserActivityEvent('nearby_search_ran', {
        zip_code: selectedZip || initialZip,
        source_type: 'quick',
      }).catch(() => {});
    }
  };

  const hydrateNearbyPlace = async (place) => {
    const details = place?.placeId ? await fetchPlaceDetails(place.placeId) : null;
    const website = details?.website || place.website || '';
    let socialResult = { socialLinks: {}, socialConfidence: 'none', socialSource: '' };
    if (website) {
      socialResult = await extractSocialLinksFromWebsite(website, { deep: true });
    }
    const addressParts = parseAddressComponents(details?.address_components || place.addressComponents || []);
    return {
      ...place,
      phone: details?.formatted_phone_number || place.phone || '',
      fullAddress: details?.formatted_address || place.fullAddress || place.address,
      website,
      addressComponents: details?.address_components || place.addressComponents || [],
      ...addressParts,
      ...socialLinksToLeadFields(socialResult.socialLinks || {}, socialResult.socialConfidence, socialResult.socialSource),
      socialLinks: socialResult.socialLinks || {},
      socialConfidence: socialResult.socialConfidence,
      socialSource: socialResult.socialSource,
    };
  };

  const handlePlaceTap = async (place) => {
    try {
      console.log('[TerritoryMapScreen] Tapped place:', place.name);

      // Update selection immediately for UI responsiveness
      setSelectedPlace({ ...place, loading: true });

      // Hydrate in background
      const hydrated = await hydrateNearbyPlace(place);

      if (hydrated) {
        setSelectedPlace({ ...hydrated, loading: false });

        // Update the item in the full list so subsequent interactions have hydrated data
        // but ensure we don't accidentally filter the list
        setNearbyPlaces((prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((item) =>
            (getNearbyPlaceId(item) === getNearbyPlaceId(hydrated)) ? { ...item, ...hydrated } : item
          );
        });
      } else {
        setSelectedPlace({ ...place, loading: false });
      }
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.warn('[TerritoryMapScreen] handlePlaceTap failed:', err);
      setSelectedPlace((prev) => prev ? { ...prev, loading: false } : null);
    }
  };

  const captureAsLead = () => {
    if (!selectedPlace) return;

    const parsedAddress = parseAddressComponents(selectedPlace.addressComponents || []);
    const streetNumber = selectedPlace.streetNumber || parsedAddress.streetNumber;
    const streetName = selectedPlace.streetName || parsedAddress.streetName;
    const city = selectedPlace.city || parsedAddress.city;
    const state = selectedPlace.state || parsedAddress.state;
    const zip = selectedPlace.zip || parsedAddress.zip;

    const lead = {
      businessName: selectedPlace.name || '',
      placeId: selectedPlace.placeId,
      pocFirst: '',
      pocLast: '',
      phone: selectedPlace.phone || '',
      email: '',
      streetNumber,
      streetName,
      addressLine2: '',
      city,
      state,
      zip,
      website: selectedPlace.website || '',
      facebookUrl: selectedPlace.facebookUrl || '',
      instagramUrl: selectedPlace.instagramUrl || '',
      linkedinUrl: selectedPlace.linkedinUrl || '',
      tiktokUrl: selectedPlace.tiktokUrl || '',
      youtubeUrl: selectedPlace.youtubeUrl || '',
      xUrl: selectedPlace.xUrl || '',
      socialConfidence: selectedPlace.socialConfidence || 'none',
      socialSource: selectedPlace.socialSource || '',
      notes: "Captured from Nearby Search. Types: " + (selectedPlace.types || []).slice(0, 3).join(', '),
      captureMethod: 'Nearby Search',
      source: selectedPlace.source || 'Nearby Search',
      propertyType: 'Commercial',
    };

    setSelectedPlace(null);
    navigation.navigate('Review', { user, lead, editIdx: null });
  };

  const hexToRgb = (hex = '') => {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return '0,201,255';
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return r + ',' + g + ',' + b;
  };

  const getStaticFill = (colors = {}, level) => {
    const opacity = level === 'on-target' ? 0.42
      : level === 'warm'   ? 0.32
      : level === 'light'  ? 0.22
      : level === 'cold'   ? 0.14
      : 0.06;
    const color = colors.text || '#00C9FF';
    const rgb = color.startsWith('#') ? hexToRgb(color) : (color.match(/\d+/g)?.slice(0, 3).join(',') || '0,201,255');
    return 'rgba(' + rgb + ',' + opacity + ')';
  };

  const getLeadCoords = (lead) => {
    const lat = Number(lead.latitude ?? lead.lat ?? lead.captureLat ?? lead.capture_lat ?? lead.locationLat ?? lead.latLng?.latitude);
    const lng = Number(lead.longitude ?? lead.lng ?? lead.captureLng ?? lead.capture_lng ?? lead.locationLng ?? lead.latLng?.longitude);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { latitude: lat, longitude: lng };
  };

  const isCommercialSignal = (signal) => {
    const layer = (signal.signal_layer || signal.signal_type || '').toLowerCase();
    const name = (signal.establishment_name || signal.business_name || '').toLowerCase();
    const address = (signal.address || '').toLowerCase();

    // 1. Force-exclude residential/rental keywords
    const RESIDENTIAL_BLOCK = [
      'apartment', 'apartment complex', 'condo', 'condominium', 'rental home',
      'residential', 'townhome', 'townhouse', 'residential rental', 'unit #', 'apt #'
    ];
    if (RESIDENTIAL_BLOCK.some(k => name.includes(k) || address.includes(k))) return false;

    // 2. Prioritize key commercial indicators
    const COMMERCIAL_PRIORITY = [
      'warehouse', 'industrial', 'logistics', 'distribution', 'manufacturing',
      'shop', 'office', 'inc', 'corp', 'llc', 'ltd', 'company', 'services', 'supply'
    ];
    if (COMMERCIAL_PRIORITY.some(k => name.includes(k))) return true;

    // 3. Signal Type weight: Openings and Compliance are almost always commercial
    if (layer.includes('opening') || layer.includes('compliance')) return true;

    // 4. Default: If it's tagged as "Existing" but has no commercial indicators, it might be residential
    if (layer === 'existing' && !COMMERCIAL_PRIORITY.some(k => name.includes(k))) return false;

    return true;
  };

  const getDistanceBetweenMeters = (a = {}, b = {}) => {
    const R = 6371000;
    const toRad = (deg) => deg * Math.PI / 180;
    if (![a.latitude, a.longitude, b.latitude, b.longitude].every((value) => Number.isFinite(Number(value)))) return null;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const sinLat = Math.sin(dLat / 2);
    const sinLon = Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon), Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)));
    return Math.round(R * c);
  };

  const formatDistanceLabel = (meters = 0) => {
    if (meters === null || meters === undefined) return '';
    const value = Number(meters);
    if (!Number.isFinite(value)) return '';
    if (value < 1609.34) {
      const feet = Math.round(value * 3.28084 / 50) * 50;
      return feet.toLocaleString() + " ft";
    }
    return (value / 1609.34).toFixed(1) + " mi";
  };

  const getNearbyPlaceId = (place = {}) => (
    place.placeId ||
    place.id ||
    'nearby_' + place.coords?.latitude + '_' + place.coords?.longitude
  );

  const fetchLensSignals = async (lat, lng, radiusOverride = null) => {
    const now = Date.now();
    if (!global.lastLocUpdate || now - global.lastLocUpdate > 120000) {
       global.lastLocUpdate = now;
       saveUserLocationStatus('active_app').catch(() => {});
    }

    setLoadingLensSignal(true);
    try {
      // Calculate radius from viewport or use override
      let computedRadius = 25;

      if (radiusOverride) {
        computedRadius = radiusOverride;
      } else {
        const latDiff = Math.abs(region?.latitudeDelta ?? 0.45);
        const lngDiff = Math.abs(region?.longitudeDelta ?? 0.45);
        const latMiles = latDiff * 69;
        const lngMiles = lngDiff * Math.cos((lat * Math.PI) / 180) * 69;
        const viewportRadius = Math.max(latMiles, lngMiles) / 2 + 10; // Slightly tighter buffer
        computedRadius = Math.min(Math.max(viewportRadius, 5), 75); // Min 5mi, Max 75mi
      }

      console.log("[LensSignal] Fetching with radius " + computedRadius.toFixed(1) + "mi from " + lat.toFixed(4) + ", " + lng.toFixed(4));

      const queryParams = {
        p_latitude: lat,
        p_longitude: lng,
        p_radius_miles: computedRadius
      };

      // Call RPC directly — bypasses jurisdiction overhead and uses correct radius
      const { data: records, error } = await supabase.rpc('get_lenssignal_nearby', queryParams);

      if (error) {
        console.error("[LensSignal] Native fetch failed:", error.message);
        setLensSignalRecords([]);
        return;
      }

      console.log("[LensSignal] API RAW RESPONSE:", records ? ("Array of " + records.length) : 'null/undefined');

      if (Array.isArray(records)) {
        // FILTER: Only include real signals, not 'Standard Discovery' results from the cache
        const realSignals = records.filter(r => (r.signal_layer || r.signal_type) !== 'Standard Discovery');

        console.log("[LensSignal] SUCCESS: Got " + realSignals.length + " real signals.");

        if (realSignals.length === 0) {
          console.log('[LensSignal] ZERO real signals returned for this area.');
        }
        setLensSignalRecords(realSignals);
      } else {
        setLensSignalRecords([]);
      }
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.error('[TerritoryMapScreen] Error fetching LensSignals:', err);
    } finally {
      setLoadingLensSignal(false);
    }
  };

  const runNearbySearch = async () => {
    setSearchingNearby(true);
    setNearbySearchStatus('Getting search location...');
    setNearbySearchProgress(5);
    setSelectedNearbyIds([]);

    // Always prioritize map center for manual searches, fallback to GPS only if map not ready
    const mapCenter = { latitude: safeRegion.latitude, longitude: safeRegion.longitude };
    const userLocation = await getCurrentCoords().catch(() => null);
    const searchCenter = (Math.abs(mapCenter.latitude) > 0.1) ? mapCenter : (userLocation || mapCenter);

    if (!searchCenter || (Math.abs(searchCenter.latitude) < 0.01 && Math.abs(searchCenter.longitude) < 0.01)) {
      showThemedAlert('Location unavailable', 'The map is not centered yet and GPS is unavailable. Please move the map or wait for a GPS lock.');
      setSearchingNearby(false);
      return;
    }

    setNearbySearchStatus('Searching LeadLens database...');
    setNearbySearchProgress(15);

    recordUserActivityEvent('nearby_search_ran', {
      source: 'Manual Search',
      lat: searchCenter.latitude,
      lng: searchCenter.longitude
    }).catch(() => {});

    try {
      console.log('[NearbySearch] Step 1: Checking Supabase for known businesses/signals...');

      let initialPlaces = [];
      try {
        const { data, error: cacheError } = await supabase.rpc('get_nearby_businesses', {
          p_latitude: searchCenter.latitude,
          p_longitude: searchCenter.longitude,
          p_radius_meters: 2500
        });

        if (!cacheError && data) {
          initialPlaces = data.map(p => ({
            ...p,
            coords: { latitude: Number(p.latitude), longitude: Number(p.longitude) },
            source: 'LeadLens Database',
            distanceLabel: formatDistanceLabel(p.distance_meters)
          })).filter(p => isFinite(p.coords.latitude) && isFinite(p.coords.longitude));

          if (initialPlaces.length > 0) {
             setNearbyPlacesWithLog(initialPlaces);
             setShowNearby(true);
             setNearbySearchStatus('Found ' + initialPlaces.length + ' in database...');
          }
        }
      } catch (dbErr) {
        console.warn('[NearbySearch] Database check failed:', dbErr.message);
      }

      setNearbySearchProgress(35);
      setNearbySearchStatus('Discovering new businesses...');

      console.log('[NearbySearch] Step 2: Calling Google discovery for new businesses...');

    // PHASE 3: Apply TargetLens Profile Discovery Hints
    let searchTypes = null;
    let searchKeyword = null;

    if (activeProfile && activeProfile.category !== 'Pest Control') {
      searchTypes = activeProfile.discoveryHints.googleTypes;
      searchKeyword = activeProfile.discoveryHints.keywords.join(' ');
      console.log(`[NearbySearch] Using TargetLens Discovery: ${activeProfile.label} (${searchKeyword})`);
    } else {
      // Restore standard behavior for Pest Control / Default
      searchTypes = null; // searchNearbyBusinesses will use its internal defaults
      searchKeyword = null;
      console.log('[NearbySearch] Using Standard/Pest Control Discovery');
    }

    const uniquePlaces = await searchNearbyBusinesses({
      userLocation: null, // FORCE search at map center, not GPS
      center: searchCenter,
      radiusMeters: 2500, // Increased radius for more results
      apiKey: GOOGLE_MAPS_API_KEY,
      types: searchTypes,
      keyword: searchKeyword,
    });

      console.log(' [NearbySearch] Utility returned ' + uniquePlaces.length + ' results.');

      if (uniquePlaces.length > 0) {
        setNearbySearchStatus('Enriching ' + uniquePlaces.length + ' new businesses...');
        setNearbySearchProgress(70);

        const enrichedPlaces = await Promise.all(uniquePlaces.map(async (place) => {
          const distanceMeters = getDistanceBetweenMeters(searchCenter, place.coords);

          // Run ContactSignal enrichment
          const contactEnrichment = await enrichWithContactSignal({
            name: place.name,
            address: place.address,
            placeId: place.placeId
          }).catch(err => {
            console.warn('[ContactSignal] Enrichment error for', place.name, err);
            return { contactSignal: false, contacts: [] };
          });

          return {
            ...place,
            coordinate: place.coords,
            source: place.source || 'Nearby Search',
            distanceMeters,
            distanceLabel: formatDistanceLabel(distanceMeters),
            ...contactEnrichment,
          };
        }));

        // Merge results: Cached + New (Deduplicated)
        setNearbyPlacesWithLog((prev) => {
          const combined = [...prev, ...enrichedPlaces];
          const seen = new Set();
          return combined.filter(p => {
            const id = p.placeId || p.id || (p.name + '_' + p.coords.latitude);
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          });
        });

        setShowNearby(true);
        setNearbySearchStatus('Search complete. ' + uniquePlaces.length + ' discovered.');

        // Step 3: Persistence (Saves to lens_signals table)
        // NOTE: lens_signals table uses signal_type (renamed from opening_type in SQL fix)
        const persistenceData = enrichedPlaces.map(p => ({
          establishment_name: p.name,
          address: p.address,
          latitude: Number(p.coords.latitude),
          longitude: Number(p.coords.longitude),
          compliance_source: p.source || 'Discovery',
          signal_type: 'Standard Discovery',
          city: p.city || null,
          zip: p.zip || null,
          state: p.state || 'TX'
        })).filter(p => isFinite(p.latitude) && isFinite(p.longitude));

        if (persistenceData.length > 0) {
          supabase.from('lens_signals').upsert(persistenceData, {
            onConflict: 'establishment_name,latitude,longitude',
            ignoreDuplicates: true
          }).then(({ error }) => {
            if (error) console.warn('[NearbySearch] Persistence sync error:', error.message);
          }).catch(() => {});
        }

        // Final step: Fetch High-Value Signals (Health/Permits)
        fetchLensSignals(searchCenter.latitude, searchCenter.longitude);
      } else {
        // Even if Google/OSM found nothing, we might still have database results
        if (initialPlaces.length === 0) {
           setShowNearby(false);
           showThemedAlert('No results', 'No businesses found at this location.');
        }
      }

      setNearbySearchProgress(100);
    } catch (error) {
      BetaTracker.crash('TerritoryMapScreen', error);
      console.error('[NearbySearch] FATAL ERROR:', error);
      setNearbySearchStatus("Search failed: " + (error?.message || 'Unknown'));
    } finally {
      setSearchingNearby(false);
    }
  };

  const toggleNearbyCategory = (type) => {
    setNearbyCategoryFilters((prev) => (
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    ));
  };

  const toggleNearbySelection = (placeId) => {
    setSelectedNearbyIds((prev) => (
      prev.includes(placeId) ? prev.filter((id) => id !== placeId) : [...prev, placeId]
    ));
  };

  const selectAllNearby = () => {
    setSelectedNearbyIds(nearbyPlaces.map(getNearbyPlaceId).filter(Boolean));
  };

  const clearNearbySelection = () => {
    setSelectedNearbyIds([]);
  };

  const addSelectedNearbyToQueue = async (selectedIds = selectedNearbyIds) => {
    const chosenPlaces = nearbyPlaces.filter((place) => selectedIds.includes(getNearbyPlaceId(place)));
    if (!chosenPlaces.length) {
      showThemedAlert('No selection', 'Select one or more discovered businesses first.');
      return;
    }

    const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
    const existingQueue = raw ? JSON.parse(raw) : [];
    const existingPlaceIds = new Set(existingQueue.map((lead) => lead.placeId || lead.sourceId).filter(Boolean));

    const newLeads = [];
    for (const place of chosenPlaces) {
      const placeKey = getNearbyPlaceId(place);
      if (existingPlaceIds.has(placeKey)) continue;

      const leadId = "nearby_" + Date.now() + "_" + Math.random().toString(36).slice(2);

      // Use classifyGooglePlace for vertical since inferNearbyVertical is missing
      const businessVertical = place.vertical || classifyGooglePlace(place) || 'Other';

      const lead = {
        id: leadId,
        placeId: placeKey,
        businessName: place.name || '',
        phone: place.phone || '',
        email: place.email || '',
        website: place.website || '',
        streetNumber: place.streetNumber || '',
        streetName: place.streetName || '',
        addressLine2: place.addressLine2 || '',
        city: place.city || '',
        state: place.state || '',
        zip: place.zip || '',
        status: 'Suspect',
        propertyType: 'Commercial',
        vertical: businessVertical,
        captureMethod: 'Nearby Search',
        source: 'Nearby Search',
        confidence: place.confidence || 'medium',
        confidenceScore: place.confidenceScore || 50,
        notes: "Discovered by Nearby Search. Types: " + (place.types || []).slice(0, 4).join(', '),
        locationLat: place.coords?.latitude,
        locationLng: place.coords?.longitude,
        createdAt: new Date().toISOString(),
        // Save signal data if matched
        lensSignal: place.lensSignal,
        contactSignal: place.contactSignal,
        has_signals: !!(place.lensSignal || place.contactSignal),
      };
      newLeads.push(lead);

      // Enqueue background hydration for better performance
      if (placeKey) {
        enqueueTask(TASK_TYPES.NEARBY_HYDRATE, { leadId, placeId: placeKey }).catch(() => {});
      }
    }

    if (!newLeads.length) {
      showThemedAlert('Already queued', 'Selected businesses are already in your queue.');
      return;
    }

    // Trigger task runner
    processQueue().catch(() => {});

    const nextQueue = sortLeadsNewestFirst([...existingQueue, ...newLeads]);
    await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(nextQueue));
    setLeads(nextQueue);

    // Update markers state to include new leads
    setLeadMarkers((prev) => [
      ...prev,
      ...newLeads.map((lead) => ({
        ...lead,
        coords: { latitude: lead.locationLat, longitude: lead.locationLng },
        markerId: lead.id,
      })),
    ]);

    setSelectedNearbyIds([]);
    setSelectedPlace(null); // Clear selected place card after adding

    const msg = await getStyledMessage('prospectAdded');
    showThemedAlert('Added to queue', msg || (newLeads.length + " business(es) added to your queue."));
  };

  const isNearbySelected = (placeId) => selectedNearbyIds.includes(placeId);

  const getLeadAddress = (lead) => {
    return [
      [lead.streetNumber, lead.streetName].filter(Boolean).join(' '),
      lead.city,
      lead.state,
      lead.zip,
    ].filter(Boolean).join(', ');
  };

  const getLeadSourceType = (lead) => (lead.sourceType || lead.captureMethod || 'Unknown');
  const getLeadConfidence = (lead) => String(lead.locationConfidence || lead.confidence || 'medium').toLowerCase();
  const isLeadExported = (lead) => !!(lead.exportedAt || lead.exportStatus === 'exported' || lead.sentAt);
  const isLeadVisible = (lead) => {
    if (!lead.coords) return false;

    // A. Business Type Filter
    const businessType = classifyGooglePlace(lead);
    if (filters.businessType !== 'All Businesses' && businessType !== filters.businessType) return false;

    // B. Lead Status Filter
    if (filters.leadStatus !== 'All' && (lead.status || 'Suspect') !== filters.leadStatus) return false;

    // C. Signals Only Filter
    if (filters.signalsOnly) {
      const hasLensSignal = !!(lead.lensSignal || lead.lens_signal_id);
      const hasContactSignal = !!lead.contactSignal;

      // Ensure we are filtering based on the active sub-filters
      const passesLensFilter = filters.signals.lensSignal && hasLensSignal;
      const passesContactFilter = filters.signals.contactSignal && hasContactSignal;

      // Sub-signal filters for high-value leads
      if (hasLensSignal) {
        const sig = lead.lensSignal;
        if (!filters.signals.pest && sig?.pest_indicator) return false;
        if (!filters.signals.opening && sig?.signal_layer === 'Opening Signal') return false;
        if (!filters.signals.priority && sig?.alert_level === 'Priority Review') return false;
      }

      if (!passesLensFilter && !passesContactFilter) return false;
    }

    return true;
  };

  const handleViewLead = () => {
    if (!selectedLead) return;
    recordUserActivityEvent('prospect_viewed', {
      prospect_id: selectedLead.id,
      zip_code: selectedLead.zip,
      business_type: selectedLead.vertical || selectedLead.industry || selectedLead.businessType || null,
    }).catch(() => {});
    const idx = leads.findIndex((lead) => lead.id === selectedLead.id);
    navigation.navigate('Review', {
      user,
      lead: selectedLead,
      editIdx: idx >= 0 ? idx : null,
    });
  };

  const handleAddToQueue = () => {
    if (!selectedLead) return;
    const idx = leads.findIndex((lead) => lead.id === selectedLead.id);
    navigation.navigate('Review', {
      user,
      lead: selectedLead,
      editIdx: idx >= 0 ? idx : null,
    });
  };

  const handleMarkVisited = async () => {
    if (!selectedLead?.id) return;
    try {
      const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : [];
      const updated = saved.map((lead) => lead.id === selectedLead.id
        ? { ...lead, visited: true, visitedAt: new Date().toISOString() }
        : lead
      );
      await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
      setLeads(updated);
      setLeadMarkers((prev) => prev.map((lead) => lead.id === selectedLead.id ? { ...lead, visited: true } : lead));
      setSelectedLead((prev) => prev ? { ...prev, visited: true } : prev);
      recordUserActivityEvent('prospect_marked_visited', {
        prospect_id: selectedLead.id,
        zip_code: selectedLead.zip,
        business_type: selectedLead.vertical || selectedLead.industry || selectedLead.businessType || null,
      }).catch(() => {});
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.warn('Mark visited failed', err.message);
    }
  };

  const handleOpenLink = async (url) => {
    if (!url) {
      showThemedAlert('No source available', 'A direct link to this record is not available in the public domain yet.');
      return;
    }
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
      } else {
        showThemedAlert('Unsupported Link', 'This link type cannot be opened on your device.');
      }
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.warn('Link open failed', err.message);
    }
  };

  const callLead = () => {
    if (!selectedLead?.phone) return;
    handleOpenLink("tel:" + selectedLead.phone);
  };

  const textLead = () => {
    if (!selectedLead?.phone) return;
    handleOpenLink("sms:" + selectedLead.phone);
  };

  const emailLead = () => {
    if (!selectedLead?.email) return;
    handleOpenLink("mailto:" + selectedLead.email);
  };

  const navigateLead = () => {
    if (!selectedLead?.coords) return;
    const { latitude, longitude } = selectedLead.coords;
    handleOpenLink("https://www.google.com/maps/dir/?api=1&destination=" + latitude + "," + longitude);
  };

  const getConfidenceColor = (conf) => {
    switch (conf) {
      case 'verified': return COLORS.success;
      case 'strong': return COLORS.accent;
      case 'possible': return COLORS.warning;
      case 'weak': return COLORS.muted;
      default: return COLORS.muted;
    }
  };

  // ── Safe derived values — must be declared BEFORE any code that references them ──
  const safeRegion = useMemo(() => makeSafeRegion(region, regionRef.current || DEFAULT_TERRITORY_REGION), [region]);

  const filteredLeadMarkers = leadMarkers.filter(isLeadVisible);
  const filteredLeadCount = filteredLeadMarkers.length;
  const showLeadPins = safeRegion.latitudeDelta <= 0.55 && filteredLeadCount > 0;
  const hideLeadMessage = safeRegion.latitudeDelta > 0.55
    ? 'Zoom in to reveal POI markers.'
    : filteredLeadCount > 200
      ? 'Too many points to render at this zoom. Narrow filters or zoom further.'
      : '';
  const sourceTypeOptions = ['All', ...Array.from(new Set(leadMarkers.map(getLeadSourceType)))].sort();

  const selectedMarker = zipMarkers.find(m => m.zip === selectedZip);
  const selectedShared = selectedZip?.startsWith('shared_')
    ? sharedMarkers.find(m => m.zip === selectedZip.replace('shared_', ''))
    : null;
  const selectedLeadInQueue = selectedLead && leads.some((lead) => lead.id === selectedLead.id);

  const selectZip = (zip, shared = false) => {
    try {
      const next = shared ? ("shared_" + zip) : (zip === selectedZip ? null : zip);
      setSelectedZip(next);
      if (!shared && next === zip) {
        recordUserActivityEvent('zip_opened', { zip_code: zip }).catch(() => {});
      }
    } catch (err) {
    BetaTracker.crash('TerritoryMapScreen', err);
      console.warn('[TerritoryMapScreen] selectZip failed:', err);
    }
  };

  // ── Clustering Logic ──
  useEffect(() => {
    if (leadMarkers.length === 0) {
      setClusters([]);
      return;
    }

    const index = new Supercluster({
      radius: 40,
      maxZoom: 16,
    });

    const points = [
      ...leadMarkers.map(lead => ({
        type: 'Feature',
        properties: {
          cluster: false,
          leadId: lead.id,
          lead: lead,
          isLead: true,
          isNearby: false
        },
        geometry: {
          type: 'Point',
          coordinates: [lead.coords.longitude, lead.coords.latitude],
        },
      })),
      ...(safeNearbyPlaces || []).map(place => ({
        type: 'Feature',
        properties: {
          cluster: false,
          placeId: place.placeId || place.id,
          place: place,
          isLead: false,
          isNearby: true
        },
        geometry: {
          type: 'Point',
          coordinates: [place.coordinate.longitude, place.coordinate.latitude],
        },
      }))
    ];

    index.load(points);
    superclusterRef.current = index;
    updateClusters();
    console.log(`[TerritoryMapScreen] Supercluster loaded with ${points.length} points`);
  }, [leadMarkers, safeNearbyPlaces]);

  const updateClusters = useCallback(() => {
    if (!superclusterRef.current || !region) return;

    try {
      const bBox = [
        region.longitude - region.longitudeDelta * 2,
        region.latitude - region.latitudeDelta * 2,
        region.longitude + region.longitudeDelta * 2,
        region.latitude + region.latitudeDelta * 2,
      ];

      const zoom = Math.round(Math.log2(360 / region.longitudeDelta));
      const newClusters = superclusterRef.current.getClusters(bBox, zoom);
      setClusters(newClusters);
    } catch (e) {
      console.warn('[TerritoryMapScreen] Clustering update failed:', e);
    }
  }, [region]);

  useEffect(() => {
    updateClusters();
  }, [region, leadMarkers, safeNearbyPlaces, updateClusters]);

  const handleClusterPress = (clusterId, coordinate) => {
    const expansionZoom = Math.min(
      superclusterRef.current.getClusterExpansionZoom(clusterId),
      20
    );

    if (mapRef.current) {
      mapRef.current.animateCamera({
        center: coordinate,
        zoom: expansionZoom,
      }, { duration: 500 });
    }
  };
  const batchCardBottom = 20;

  const safeZipMarkers = useMemo(() => {
    return (Array.isArray(zipMarkers) ? zipMarkers : [])
      .map((marker, markerIndex) => {
        const ringsSource =
          Array.isArray(marker.allRings) && marker.allRings.length > 0
            ? marker.allRings
            : marker.polygon
              ? [marker.polygon]
              : [];

        const safeRings = ringsSource
          .map((ring, ringIndex) =>
            makeSafePolygonCoordinates(
              ring,
              ("zip-" + (marker.zip || markerIndex) + "-ring-" + ringIndex)
            )
          )
          .filter((ring) => Array.isArray(ring) && ring.length >= 3);

        if (safeRings.length === 0) return null;

        const safeLabelCoords = _makeSafeCoordinate(marker.coords);

        return {
          ...marker,
          allRings: safeRings,
          coords: safeLabelCoords,
        };
      })
      .filter(Boolean);
  }, [zipMarkers]);

  const safeSharedMarkers = useMemo(() => {
    return (Array.isArray(sharedMarkers) ? sharedMarkers : [])
      .map((marker, markerIndex) => {
        const ringsSource =
          Array.isArray(marker.allRings) && marker.allRings.length > 0
            ? marker.allRings
            : marker.polygon
              ? [marker.polygon]
              : [];

        const safeRings = ringsSource
          .map((ring, ringIndex) =>
            makeSafePolygonCoordinates(
              ring,
              ("shared-" + (marker.zip || markerIndex) + "-ring-" + ringIndex)
            )
          )
          .filter((ring) => Array.isArray(ring) && ring.length >= 3);

        if (safeRings.length === 0) return null;

        const safeLabelCoords = _makeSafeCoordinate(marker.coords);

        return {
          ...marker,
          allRings: safeRings,
          coords: safeLabelCoords,
        };
      })
      .filter(Boolean);
  }, [sharedMarkers]);

  const safeNearbyPlaces = useMemo(() => {
    const raw = nearbyPlaces || [];
    console.log("[TerritoryMapScreen] Filtering Discovery Results: " + raw.length + " businesses discovered");
    console.log("[TerritoryMapScreen] Active Filters:", {
      businessType: filters.businessType,
      leadStatus: filters.leadStatus,
      matchStrength: filters.matchStrength,
      signals: filters.signals
    });

    const processed = raw.map(place => {
      // 1. Classify business type locally
      const businessType = classifyGooglePlace(place);

      // 2. Find matching LensSignal
      const matches = lensSignalRecords.map(record => ({
        record,
        ...calculateMatchConfidence(record, {
          name: place.name,
          address: place.address,
          latitude: place.coords?.latitude,
          longitude: place.coords?.longitude,
          zip: place.zip,
          phone: place.phone
        })
      })).filter(m => m.score >= 0.4) // Slightly more lenient threshold (0.4 instead of 0.5)
         .sort((a, b) => b.score - a.score);

      const bestMatch = matches[0];
      const sig = bestMatch?.record || null;

      // 3. Apply TargetLens Scoring (Phase 4)
      let targetLensMatch = null;
      if (activeProfile && activeProfile.category !== 'Pest Control') {
        targetLensMatch = processTargetLensMatch(place, activeProfile, searchMode);
      }

      return {
        ...place,
        businessType,
        coordinate: place.coordinate || place.coords,
        lensSignal: sig,
        matchConfidence: bestMatch?.score || 0,
        targetLensMatch, // Store Phase 4 result
        signals: {
          lensSignal: !!sig,
          contactSignal: !!place.contactSignal,
          pest: !!sig?.pest_indicator,
          opening: (sig?.signal_layer || sig?.signal_type) === 'Opening Signal',
          priority: sig?.alert_level === 'Priority Review',
        },
        leadStatus: 'New', // Default for discovered places
        contacts: place.contacts || [],
        primaryContactId: place.primaryContactId,
        contactSignal: place.contactSignal,
        contactSignalConfidence: place.contactSignalConfidence,
      };
    });

    console.log("[TerritoryMapScreen] Enriched " + processed.filter(p => p.lensSignal).length + " LensSignals, " + processed.filter(p => p.contactSignal).length + " ContactSignals");

    const filtered = processed.filter(p => {
      // A. TargetLens Filter (Phase 4)
      if (activeProfile && activeProfile.category !== 'Pest Control' && p.targetLensMatch) {
        if (!p.targetLensMatch.isIncluded) return false;
      }

      // If Pest Control or Default, and "Signals Only" is OFF, show everything processed
      if ((!activeProfile || activeProfile.category === 'Pest Control') && !filters.signalsOnly) {
        return true;
      }

      // B. Business Type Filter
      if (filters.businessType !== 'All Businesses' && p.businessType !== filters.businessType) return false;

      // B. Lead Status Filter (for discovered items, they are all 'New')
      if (filters.leadStatus !== 'All' && p.leadStatus !== filters.leadStatus) return false;

      // C. Signals Only — show only businesses with at least one active signal
      if (filters.signalsOnly) {
        const hasSignal = (filters.signals.lensSignal && p.signals?.lensSignal) ||
                          (filters.signals.contactSignal && p.signals?.contactSignal) ||
                          (filters.signals.pest && p.signals?.pest) ||
                          (filters.signals.opening && p.signals?.opening) ||
                          (filters.signals.priority && p.signals?.priority);
        if (!hasSignal) return false;
      }

      // D. Match Strength Filter
      if (filters.matchStrength === 'Strong Matches' && p.matchConfidence < 0.9) return false;
      if (filters.matchStrength === 'High Opportunity' && p.lensSignal?.alert_level !== 'Opportunity') return false;
      if (filters.matchStrength === 'Needs Review' && (p.matchConfidence > 0.0 && p.matchConfidence < 0.7)) return false;

      return true;
    });

    console.log("[TerritoryMapScreen] Displaying " + filtered.length + " after filters. Filters hiding results: " + (filtered.length < processed.length));
    return filtered;
  }, [nearbyPlaces, lensSignalRecords, filters]);
  // Real territory ZIP loader.
  // Loads assigned ZIPs through Supabase, then builds/caches polygon markers.
  // This is kept as a secondary safety loader in case loadMap() results are empty.
  const territoryZipLoaderRanRef = useRef(false);

  useEffect(() => {
    if (territoryZipLoaderRanRef.current) return;
    if (Array.isArray(zipMarkers) && zipMarkers.length > 0) return;

    territoryZipLoaderRanRef.current = true;
    let isMounted = true;

    const runRealTerritoryZipLoader = async () => {
      try {
        if (__DEV__) console.log('[TerritoryMapScreen] Territory ZIP safety loader starting...');
        const markers = await loadTerritoryZipMarkersFallback({ supabaseClient: supabase });

        if (!isMounted) return;

        if (Array.isArray(markers) && markers.length > 0) {
          setZipMarkers(markers);
        }
      } catch (error) {
    BetaTracker.crash('TerritoryMapScreen', error);
        console.warn('[TerritoryMapScreen] Territory ZIP safety loader failed:', error?.message);
      }
    };

    runRealTerritoryZipLoader();
    return () => { isMounted = false; };
  }, [zipMarkers.length]);

  // LeadLens nearby discovery panel hide helper.
  // This prevents the bottom discovered-businesses tray from sticking open forever.
  const clearNearbyDiscoveryPanel = () => {
    console.log('[TerritoryMapScreen] Clearing nearby discovery panel');

    if (typeof setShowNearby === 'function') {
      setShowNearby(false);
    }

    if (typeof setNearbyPlaces === 'function') {
      setNearbyPlaces([]);
    }

    setSelectedNearbyIds([]);
    setSelectedPlace(null);

    if (typeof setSelectedNearbyPlaces === 'function') {
      setSelectedNearbyPlaces([]);
    }

    if (typeof setSelectedNearby === 'function') {
      setSelectedNearby([]);
    }

    if (typeof setSelectedPlaces === 'function') {
      setSelectedPlaces([]);
    }

    if (typeof setSelectedDiscoveredBusinesses === 'function') {
      setSelectedDiscoveredBusinesses([]);
    }

    if (typeof setNearbySelected === 'function') {
      setNearbySelected([]);
    }
  };

  useEffect(() => {
    const noNearbyResults =
      Array.isArray(nearbyPlaces) &&
      nearbyPlaces.length === 0;

    if (showNearby && noNearbyResults) {
      const timer = setTimeout(() => {
        console.log('[TerritoryMapScreen] Auto-hiding empty nearby panel');
        if (typeof setShowNearby === 'function') {
          setShowNearby(false);
        }
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [showNearby, Array.isArray(nearbyPlaces) ? nearbyPlaces.length : 0]);

  return (
    <View style={s.root}>
      <ScreenHeader
        title="Territory Map"
        onBack={() => navigation.goBack()}
        badge={(zipMarkers.length + " ZIPS")}
      />

      <View style={{ flex: 1 }}>
        {/* Signal loading/count indicator */}
        {loadingLensSignal ? (
          <View style={s.statusBar}>
            <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: 8 }} />
            <Text style={s.statusText}>Searching for signals...</Text>
          </View>
        ) : !isSupabaseConfigured ? (
          <View style={s.statusBar}>
            <Text style={[s.statusText, { color: COLORS.accent2 }]}>{"\u26A0\uFE0F"} Supabase Not Configured</Text>
          </View>
        ) : lensSignalRecords.length > 0 ? (
          <View style={s.statusBar}>
            <View style={{ flex: 1 }}>
              <Text style={s.statusText}>{"\uD83D\uDCE1"} {lensSignalRecords.length} Signals Nearby</Text>
              {filters.signalsOnly && (
                 <Text style={s.signalStatusText}> (Filtering for signals only)</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={s.statusBar}>
             <View style={{ flex: 1 }}>
               <Text style={[s.statusText, { color: COLORS.muted }]}>{"\uD83D\uDCE1"} No Signals Found in View</Text>
               <Text style={s.signalStatusText}>Statewide TX signals active. Local data in Harris/Houston/Fort Bend.</Text>
             </View>
          </View>
        )}

        <MapView
          ref={mapRef}
          style={s.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={DEFAULT_TERRITORY_REGION}
          region={safeRegion}
          onRegionChangeComplete={(nextRegion) => setSafeRegion(nextRegion, 'user-pan')}
          showsUserLocation
          showsMyLocationButton
          showsPointsOfInterest
          showsBuildings
          onMapReady={() => { if (__DEV__) console.log('[TerritoryMapScreen] MapView ready'); }}
          onLayout={() => { if (__DEV__) console.log('[TerritoryMapScreen] MapView layout ready'); }}
        >
          {/* My ZIP polygons — real boundary shapes from OpenStreetMap */}
          {safeZipMarkers.map(({ zip, coords, polygon, allRings, colors, level }, markerIndex) => (
            <React.Fragment key={"my_" + zip + "_" + markerIndex}>
              {allRings.map((ring, idx) => (
                <Polygon
                  key={"my_" + zip + "_" + markerIndex + "_ring_" + idx}
                  coordinates={ring}
                  fillColor={getStaticFill(colors, level)}
                  strokeColor={colors?.text || 'rgba(124, 58, 237, 0.95)'}
                  strokeWidth={selectedZip === zip ? 3.5 : 2}
                  tappable
                  onPress={() => selectZip(zip)}
                />
              ))}
              {!!coords && (
                <Marker
                  key={"my_" + zip + "_" + markerIndex + "_label"}
                  coordinate={coords}
                  onPress={() => selectZip(zip)}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={[s.zipLabel, { borderColor: colors.text }]}>
                    <Text style={[s.zipLabelText, { color: colors.text }]}>{zip}</Text>
                    <Text style={[s.zipLabelLevel, { color: colors.text }]}>{getHeatLabel(level)}</Text>
                  </View>
                </Marker>
              )}
            </React.Fragment>
          ))}

          {/* Team territory polygons — gray */}
          {safeSharedMarkers.map(({ zip, coords, polygon, allRings, repName }, sharedIndex) => (
            <React.Fragment key={"shared_" + zip + "_" + (repName || 'rep') + "_" + sharedIndex}>
              {allRings.map((ring, idx) => (
                <Polygon
                  key={"shared_" + zip + "_" + (repName || 'rep') + "_" + sharedIndex + "_ring_" + idx}
                  coordinates={ring}
                  fillColor="rgba(107,114,128,0.08)"
                  strokeColor="rgba(160,170,185,0.6)"
                  strokeWidth={1.5}
                  tappable
                  onPress={() => selectZip(zip, true)}
                />
              ))}
              {!!coords && (
                <Marker
                  key={"shared_" + zip + "_" + (repName || 'rep') + "_" + sharedIndex + "_label"}
                  coordinate={coords}
                  onPress={() => selectZip(zip, true)}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                >
                  <View style={s.repLabel}>
                    <Text style={s.repLabelZip}>{zip}</Text>
                    <Text style={s.repLabelName}>{repName}</Text>
                  </View>
                </Marker>
              )}
            </React.Fragment>
          ))}
          {/* Clustered Markers (Leads + Nearby) */}
          {showLeadPins && Array.isArray(clusters) && clusters.map((cluster, index) => {
            if (!cluster?.geometry?.coordinates) return null;

            const [longitude, latitude] = cluster.geometry.coordinates;
            const { cluster: isCluster, point_count: count } = cluster.properties || {};

            if (isCluster) {
              return (
                <MapClusterMarker
                  key={`cluster-${cluster.id || index}`}
                  coordinate={{ latitude, longitude }}
                  count={count || 0}
                  onPress={() => {
                    if (cluster?.id !== undefined) {
                      handleClusterPress(cluster.id, { latitude, longitude });
                    }
                  }}
                  color={(activeProfile && activeProfile.category !== 'Pest Control') ? activeProfile.themeColor : COLORS.accent}
                />
              );
            }

            // Individual Lead Pin
            if (cluster.properties?.isLead && cluster.properties?.lead) {
              const lead = cluster.properties.lead;
              if (!lead?.coords || !isLeadVisible(lead)) return null;

              return (
                <Marker
                  key={"lead_" + (lead.markerId || lead.id || index)}
                  coordinate={lead.coords}
                  onPress={() => setSelectedLead(lead)}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={true}
                >
                  <View style={[
                    s.poiPin,
                    lead.has_signals && s.poiPinSignal,
                    (activeProfile && activeProfile.category !== 'Pest Control') && { backgroundColor: activeProfile.themeColor }
                  ]}>
                    {lead.has_signals ? (
                      <Text style={s.poiPinIcon}>{(lead.lensSignal?.pest_indicator || lead.pest_indicator) ? "\uD83D\uDC2D" : "\uD83D\uDCE1"}</Text>
                    ) : (
                      <Text style={s.poiPinText}>•</Text>
                    )}
                  </View>
                </Marker>
              );
            }

            // Individual Nearby Discovery Pin
            if (cluster.properties?.isNearby && cluster.properties?.place && showNearby) {
              const place = cluster.properties.place;
              if (!place?.coordinate && !place?.coords) return null;

              return (
                <Marker
                  key={"nearby_" + (place.placeId || place.id || index)}
                  coordinate={place.coordinate || place.coords}
                  onPress={() => handlePlaceTap(place)}
                  tracksViewChanges={true}
                >
                  <View style={[
                    s.placePin,
                    isNearbySelected(place.placeId) && s.placePinSelected,
                    filters?.signals?.priority && place.signals?.priority && s.placePinPriority
                  ]}>
                    <Text style={s.placePinIcon}>{"\uD83C\uDFE2"}</Text>
                    <View style={s.badgeContainer}>
                      {filters?.signals?.contactSignal && place.signals?.contactSignal && <LensSignalBadge type="contact" />}
                      {filters?.signals?.pest && place.signals?.pest && <LensSignalBadge type="pest" />}
                      {filters?.signals?.opening && place.signals?.opening && !place.signals?.pest && <LensSignalBadge type="opening" />}
                      {filters?.signals?.lensSignal && place.signals?.lensSignal && !place.signals?.pest && !place.signals?.opening && !place.signals?.contactSignal && (
                        <LensSignalBadge type="danger" />
                      )}
                    </View>
                    {filters?.signals?.priority && place.signals?.priority && <View style={s.priorityGlow} />}
                  </View>
                </Marker>
              );
            }

            return null;
          })}

          {/* LensSignal markers (Special Compliance/Opening Signals) */}

          {/* LensSignal markers */}
          {filters.signals.lensSignal &&
            lensSignalRecords
              .filter(isCommercialSignal)
              .slice(0, 100) // Performance: Render max 100 markers
              .map((signal) => {
                if (!_isValidCoordinate(signal.latitude, signal.longitude)) return null;

                // Sub-signal filters
                if (!filters.signals.pest && signal.pest_indicator) return null;
                if (!filters.signals.opening && (signal.signal_layer || signal.signal_type) === 'Opening Signal') return null;
                if (!filters.signals.priority && signal.alert_level === 'Priority Review') return null;

                return (
                  <LensSignalMapMarker
                    key={("signal_" + signal.id)}
                    signal={signal}
                    onPress={(s) => setSelectedLensSignalRecord(s)}
                    activeProfile={activeProfile}
                  />
                );
              })}

        </MapView>

        {/* Bottom Right Actions Stack */}
        <View style={s.bottomActionsContainer}>
          {/* Legend */}
          <View style={s.legend}>
            {[
              ['on-target', '10+/day'],
              ['warm', '7-9/day'],
              ['light', '3-6/day'],
              ['cold', '1-2/day'],
              ['inactive', 'None'],
            ].map(([level, label]) => {
              const colors = getHeatColor(level);
              return (
                <View key={level} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: colors.text }]} />
                  <Text style={s.legendLabel}>{label}</Text>
                </View>
              );
            })}
            <View style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: 'rgba(160,170,185,0.6)' }]} />
              <Text style={s.legendLabel}>Team</Text>
            </View>
          </View>

          <TouchableOpacity style={s.actionBtn} onPress={searchNearby} disabled={searchingNearby}>
            {searchingNearby ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <Text style={s.actionBtnIcon}>{"\uD83D\uDD0D"}</Text>
            )}
            <Text style={s.actionBtnText}>Search Nearby</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={() => setTargetLensVisible(true)}>
            <Text style={s.actionBtnIcon}>{"\uD83C\uDFAF"}</Text>
            <Text style={s.actionBtnText}>TargetLens</Text>
            {activeProfile && (
              <View style={s.filterDot} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={() => setFiltersVisible(true)}>
            <Text style={s.actionBtnIcon}>{"\u2699\uFE0F"}</Text>
            <Text style={s.actionBtnText}>Filters</Text>
            {(filters.businessType !== 'All Businesses' || filters.leadStatus !== 'All' || filters.matchStrength !== 'Show All') && (
              <View style={s.filterDot} />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={s.actionBtn} onPress={loadMap}>
            <Text style={s.actionBtnIcon}>{"\u21BB"}</Text>
            <Text style={s.actionBtnText}>Reload Map</Text>
          </TouchableOpacity>
        </View>

        {/* Active Profile Badge */}
        <View style={s.activeProfileBadge}>
          <Text style={s.activeProfileLabel}>TargetLens™ Focus</Text>
          <Text style={s.activeProfileValue}>{activeProfile?.label || 'Pest Control'}</Text>
        </View>

        {!!hideLeadMessage && (
          <View style={s.mapHintBar}>
            <Text style={s.mapHintText}>{hideLeadMessage}</Text>
          </View>
        )}

        {!!selectedMarker && (
          <View style={[s.infoCard, { bottom: detailCardBottom, borderColor: selectedMarker.colors.border }]}>
            <Text style={[s.infoZip, { color: selectedMarker.colors.text }]}>
              ZIP {selectedMarker.zip}
            </Text>
            <Text style={s.infoStat}>
              {selectedMarker.activity?.weeklyCount || 0} prospects this week
            </Text>
            <Text style={s.infoStat}>
              {selectedMarker.activity?.dailyAvg || 0}/day · 30-day avg (goal: {dailyGoal}/day)
            </Text>
            <Text style={[s.infoLevel, { color: selectedMarker.colors.text }]}>
              {getHeatLabel(selectedMarker.level)}
            </Text>
            <TouchableOpacity onPress={() => setSelectedZip(null)} style={s.infoDismiss}>
              <Text style={s.infoDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!selectedShared && (
          <View style={[s.infoCard, { bottom: detailCardBottom, borderColor: 'rgba(160,170,185,0.5)' }]}>
            <Text style={s.infoZip}>ZIP {selectedShared.zip}</Text>
            <Text style={s.infoStat}>{selectedShared.repName}'s territory</Text>
            {!!selectedShared.branchNum && (
              <Text style={s.infoStat}>Branch {selectedShared.branchNum}</Text>
            )}
            <TouchableOpacity onPress={() => setSelectedZip(null)} style={s.infoDismiss}>
              <Text style={s.infoDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!selectedLead && (
          <View style={[s.leadCard, { bottom: detailCardBottom }]}>
            <View style={s.leadCardHeader}>
              <Text style={s.leadCardTitle}>{selectedLead.businessName || 'Unknown Business'}</Text>
              <TouchableOpacity onPress={() => setSelectedLead(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.placeClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.leadDetail}>{getLeadAddress(selectedLead)}</Text>
            {!!selectedLead.phone && <Text style={s.leadDetail}>{"\uD83D\uDCDE"} {selectedLead.phone}</Text>}
            {!!selectedLead.email && <Text style={s.leadDetail}>{"\u2709\uFE0F"} {selectedLead.email}</Text>}
            <View style={s.leadMetaRow}>
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>{selectedLead.status || 'Suspect'}</Text>
              </View>
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>{getLeadConfidence(selectedLead)} confidence</Text>
              </View>
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>{getLeadSourceType(selectedLead)}</Text>
              </View>
            </View>
            <View style={s.leadMetaRow}>
              <View style={s.metaChip}>
                <Text style={s.metaChipText}>{isLeadExported(selectedLead) ? 'Exported' : 'Not exported'}</Text>
              </View>
              {!!selectedLead.visited && (
                <View style={s.metaChipSuccess}>
                  <Text style={s.metaChipText}>Visited</Text>
                </View>
              )}
            </View>
            <View style={s.leadActionsRow}>
              <TouchableOpacity style={s.leadActionBtn} onPress={handleViewLead}>
                <Text style={s.leadActionText}>View Lead</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.leadActionBtn} onPress={handleAddToQueue}>
                <Text style={s.leadActionText}>{selectedLeadInQueue ? 'Review in Queue' : 'Add to Queue'}</Text>
              </TouchableOpacity>
            </View>
            <View style={s.leadActionsRow}>
              <TouchableOpacity style={[s.leadActionBtn, !selectedLead.phone && s.leadActionBtnDisabled]} onPress={callLead} disabled={!selectedLead.phone}>
                <Text style={[s.leadActionText, !selectedLead.phone && s.leadActionTextDisabled]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.leadActionBtn, !selectedLead.phone && s.leadActionBtnDisabled]} onPress={textLead} disabled={!selectedLead.phone}>
                <Text style={[s.leadActionText, !selectedLead.phone && s.leadActionTextDisabled]}>Text</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.leadActionBtn, !selectedLead.email && s.leadActionBtnDisabled]} onPress={emailLead} disabled={!selectedLead.email}>
                <Text style={[s.leadActionText, !selectedLead.email && s.leadActionTextDisabled]}>Email</Text>
              </TouchableOpacity>
            </View>
            <View style={s.leadActionsRow}>
              <TouchableOpacity style={s.leadActionBtn} onPress={navigateLead}>
                <Text style={s.leadActionText}>Navigate</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.leadActionBtn, selectedLead.visited && s.leadActionBtnDisabled]} onPress={handleMarkVisited} disabled={!!selectedLead.visited}>
                <Text style={[s.leadActionText, selectedLead.visited && s.leadActionTextDisabled]}>{selectedLead.visited ? 'Marked visited' : 'Mark Visited'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Selected place card */}
        {!!selectedPlace && (
          <View style={[s.placeCard, { bottom: detailCardBottom }]}>
            <View style={s.placeCardHeader}>
              <Text style={s.placeName} numberOfLines={1}>{selectedPlace.name}</Text>
              <TouchableOpacity onPress={() => setSelectedPlace(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={s.placeClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.placeAddress} numberOfLines={2}>{selectedPlace.fullAddress || selectedPlace.address}</Text>

            {selectedPlace.loading ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={COLORS.accent} />
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 220, marginTop: 12 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                {!!selectedPlace.distanceLabel && <Text style={s.placeDetail}>{"\uD83D\uDCCD"} {selectedPlace.distanceLabel}</Text>}
                {!!selectedPlace.phone && <Text style={s.placeDetail}>{"\uD83D\uDCDE"} {selectedPlace.phone}</Text>}
                {!!selectedPlace.website && <Text style={s.placeDetail} numberOfLines={1}>{"\uD83C\uDF10"} {selectedPlace.website}</Text>}

                {/* TargetLens Match Reasons (Phase 4) */}
                {selectedPlace.targetLensMatch && activeProfile && (
                  <View style={[s.signalBox, { borderColor: activeProfile.themeColor, backgroundColor: activeProfile.themeColor + '10' }]}>
                    <Text style={[s.signalTitle, { color: activeProfile.themeColor }]}>
                      TargetLens Match: {activeProfile.label}
                    </Text>
                    <View style={{ marginTop: 6 }}>
                      {selectedPlace.targetLensMatch.reasons.map((reason, idx) => (
                        <Text key={idx} style={s.signalDetail}>• {reason}</Text>
                      ))}
                    </View>
                    <View style={[s.confidenceBadge, { alignSelf: 'flex-end', backgroundColor: activeProfile.themeColor }]}>
                      <Text style={[s.confidenceText, { color: '#000' }]}>{selectedPlace.targetLensMatch.confidence} Match ({selectedPlace.targetLensMatch.score}%)</Text>
                    </View>
                  </View>
                )}

                {filters.signals.contactSignal && selectedPlace.contactSignal && (
                  <View style={s.signalBox}>
                    <View style={s.signalHeader}>
                      <Text style={s.signalTitle}>{"\uD83D\uDC64"} ContactSignal</Text>
                      <View style={[s.confidenceBadge, { backgroundColor: getConfidenceColor(selectedPlace.contactSignalConfidence) }]}>
                        <Text style={s.confidenceText}>{selectedPlace.contactSignalConfidence}</Text>
                      </View>
                    </View>

                    {selectedPlace.contacts?.length > 0 && (
                      <View style={s.bestContactBox}>
                        <Text style={s.contactName}>{selectedPlace.contacts[0].fullName || 'Contact Found'}</Text>
                        <Text style={s.contactRole}>{selectedPlace.contacts[0].roleType?.replace('_', ' ')} · {selectedPlace.contacts[0].source?.replace('_', ' ')}</Text>

                        <View style={s.contactActions}>
                          <TouchableOpacity
                            style={s.contactActionBtn}
                            onPress={() => {
                              setSelectedPlace(prev => ({
                                ...prev,
                                pocFirst: selectedPlace.contacts[0].firstName || '',
                                pocLast: selectedPlace.contacts[0].lastName || '',
                                title: selectedPlace.contacts[0].title || '',
                              }));
                              showThemedAlert('Success', 'Contact set as primary POC suggestion.');
                            }}
                          >
                            <Text style={s.contactActionText}>Add as POC</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.contactActionBtn}
                            onPress={() => handleOpenLink(selectedPlace.contacts[0].sourceUrl)}
                          >
                            <Text style={s.contactActionText}>View Source</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {filters.signals.lensSignal && selectedPlace.lensSignal && (
                  <View style={s.signalBox}>
                    <Text style={s.signalTitle}>
                      {selectedPlace.lensSignal.pest_indicator ? "\uD83D\uDC2D " : ((selectedPlace.lensSignal.signal_layer || selectedPlace.lensSignal.signal_type) === 'Opening Signal' ? "\uD83C\uDD95 " : "\uD83D\uDCE1 ")}
                      LensSignal: {selectedPlace.lensSignal.signal_layer || selectedPlace.lensSignal.signal_type}
                    </Text>
                    <Text style={s.signalDetail} numberOfLines={2}>
                      Level: {selectedPlace.lensSignal.alert_level || 'Active'} · {selectedPlace.lensSignal.source_name || 'Public Record'}
                    </Text>
                    <TouchableOpacity
                      style={s.signalBtn}
                      onPress={() => setSelectedLensSignalRecord(selectedPlace.lensSignal)}
                    >
                      <Text style={s.signalBtnText}>View Full Intelligence →</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}

            <View style={s.nearbyPlaceActionsRow}>
              <TouchableOpacity
                style={[s.captureBtn, { flex: 1, marginTop: 0 }, isNearbySelected(getNearbyPlaceId(selectedPlace)) && s.captureBtnSelected]}
                onPress={() => toggleNearbySelection(getNearbyPlaceId(selectedPlace))}
              >
                <Text style={s.captureBtnText}>{isNearbySelected(getNearbyPlaceId(selectedPlace)) ? 'Deselect' : 'Select'}</Text>
              </TouchableOpacity>
              <View style={{ width: 8 }} />
              <TouchableOpacity
                style={[s.captureBtn, { flex: 1, marginTop: 0 }, s.captureBtnSecondary]}
                onPress={() => addSelectedNearbyToQueue([getNearbyPlaceId(selectedPlace)])}
              >
                <Text style={s.captureBtnText}>+ Queue</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.captureBtn, { backgroundColor: COLORS.purple, marginTop: 8 }]}
              onPress={captureAsLead}
            >
              <Text style={[s.captureBtnText, { color: '#fff' }]}>Capture Full Lead ›</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!safeNearbyPlaces.length && !selectedPlace && (
          <View style={[s.nearbyBatchCard, { bottom: batchCardBottom }]}>
            <Text style={s.placeAddress}>{safeNearbyPlaces.length} discovered businesses</Text>
            <View style={s.nearbyBatchActions}>
              <TouchableOpacity style={s.batchBtn} onPress={selectAllNearby}>
                <Text style={s.batchBtnText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.batchBtn} onPress={clearNearbyDiscoveryPanel}>
                <Text style={s.batchBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.batchBtn, !selectedNearbyIds.length && s.batchBtnDisabled]}
                onPress={() => addSelectedNearbyToQueue()}
                disabled={!selectedNearbyIds.length}
              >
                <Text style={[s.batchBtnText, !selectedNearbyIds.length && s.placeClose]}>Add {selectedNearbyIds.length || '0'} to Queue</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}


        {/* TargetLens Profile Modal */}
        <Modal
          visible={targetLensVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setTargetLensVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>TargetLens™ Focus</Text>
                <TouchableOpacity onPress={() => setTargetLensVisible(false)}>
                  <Text style={s.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={s.modalScroll} showsVerticalScrollIndicator={false}>
                <TargetLensProfileSelector
                  onProfileChange={(profile, mode) => {
                    setActiveProfile(profile);
                    setSearchMode(mode);
                  }}
                />
              </ScrollView>
              <TouchableOpacity
                style={s.modalDoneBtn}
                onPress={() => setTargetLensVisible(false)}
              >
                <Text style={s.modalDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Lead Filters Bottom Sheet */}
        <LeadFiltersBottomSheet
          visible={filtersVisible}
          onClose={() => setFiltersVisible(false)}
          filters={filters}
          onApply={(nextFilters) => setFilters(nextFilters)}
          onReset={() => setFilters(DEFAULT_FILTERS)}
        />

        {!!selectedLensSignalRecord && (
          <LensSignalDetailsCard
            signal={selectedLensSignalRecord}
            onClose={() => setSelectedLensSignalRecord(null)}
            onAddToQueue={(signal) => {
              showThemedAlert(
                'Add to Queue',
                "Capture " + signal.establishment_name + " as a new lead?",
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Add',
                    onPress: () => {
                      showThemedAlert('Success', signal.establishment_name + " added to your queue.");
                      setSelectedLensSignalRecord(null);
                    }
                  }
                ]
              );
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
  zipLabel: {
    borderRadius: 6, borderWidth: 1.5, paddingHorizontal: 6, paddingVertical: 3,
    alignItems: 'center', backgroundColor: COLORS.surface, minWidth: 48,
  },
  zipLabelText: { fontSize: 11, fontWeight: '800' },
  zipLabelLevel: { fontSize: 8, fontWeight: '600', marginTop: 1 },
  repLabel: {
    backgroundColor: 'rgba(30,34,44,0.85)', borderRadius: 6, borderWidth: 1,
    borderColor: 'rgba(160,170,185,0.4)', paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center',
  },
  repLabelZip: { fontSize: 10, fontWeight: '700', color: '#a0aabb' },
  repLabelName: { fontSize: 8, color: '#a0aabb', marginTop: 1 },
  statusBar: {
    position: 'absolute', top: 12, left: 12, right: 120,
    backgroundColor: 'rgba(14,16,24,0.95)', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.borderLit,
    paddingHorizontal: 12, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center',
    zIndex: 100,
  },
  statusText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  signalStatusText: { color: COLORS.label, fontSize: 10, marginTop: 2 },
  coverageWarningBar: {
    position: 'absolute', top: 68, left: 12, right: 120,
    backgroundColor: 'rgba(204,16,64,0.1)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(204,16,64,0.3)',
    paddingHorizontal: 10, paddingVertical: 6,
    zIndex: 99,
  },
  coverageWarningText: { color: COLORS.accent2, fontSize: 10, fontWeight: '600' },
  legend: {
    backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.borderLit, padding: 6,
    marginBottom: 6, alignSelf: 'flex-end',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 5 },
  legendLabel: { color: COLORS.text, fontSize: 9, fontWeight: '600' },
  mapHintBar: {
    position: 'absolute', top: 72, left: 16, right: 16,
    backgroundColor: 'rgba(14,16,24,0.95)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.borderLit,
  },
  mapHintText: { color: COLORS.textDim, fontSize: 12, textAlign: 'center' },
  leadCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(19,22,30,0.98)', borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.borderLit, padding: 16,
    zIndex: 40,
  },
  leadCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  leadCardTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1, marginRight: 12 },
  leadDetail: { color: COLORS.textDim, fontSize: 12, marginTop: 8, lineHeight: 18 },
  leadMetaRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  metaChip: {
    backgroundColor: COLORS.surface2, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  metaChipSuccess: {
    backgroundColor: COLORS.success + '20', borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  metaChipText: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  leadActionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  leadActionBtn: {
    flex: 1, minWidth: 100,
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderLit,
  },
  leadActionBtnDisabled: {
    opacity: 0.45,
  },
  leadActionText: { color: COLORS.accent, fontWeight: '700', fontSize: 12 },
  leadActionTextDisabled: { color: COLORS.muted },
  poiPin: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,201,255,0.9)', borderWidth: 1.5,
    borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  poiPinSignal: {
    backgroundColor: 'rgba(123,63,190,0.95)',
    width: 32, height: 32, borderRadius: 16,
    borderColor: COLORS.accent,
  },
  poiPinIcon: { fontSize: 14 },
  poiPinText: {
    color: '#fff', fontSize: 18, lineHeight: 18, fontWeight: '900', marginTop: -2,
  },
  infoCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(19,22,30,0.97)', borderRadius: 14, borderWidth: 1.5, padding: 16,
    zIndex: 40,
  },
  infoZip: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  infoStat: { color: COLORS.textDim, fontSize: 13, marginTop: 4 },
  infoLevel: { fontSize: 12, fontWeight: '700', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoDismiss: { marginTop: 10, alignSelf: 'flex-end' },
  infoDismissText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
  placePin: {
    backgroundColor: 'rgba(255,107,43,0.9)', borderRadius: 16,
    padding: 4, borderWidth: 1.5, borderColor: '#fff',
    position: 'relative',
  },
  placePinPriority: {
    borderColor: '#CC1040',
    borderWidth: 2.5,
  },
  priorityGlow: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#CC1040',
    opacity: 0.6,
  },
  placePinIcon: { fontSize: 16 },
  badgeContainer: {
    position: 'absolute', top: -4, right: -4,
  },
  nearbyBtn: {
    position: 'absolute', right: 16,
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    flexDirection: 'row', alignItems: 'center',
    zIndex: 30,
  },
  nearbyBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  bottomActionsContainer: {
    position: 'absolute', bottom: 24, right: 12,
    gap: 6,
    zIndex: 30,
    alignItems: 'flex-end',
    width: 140,
  },
  actionBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    width: '100%',
  },
  actionBtnIcon: { fontSize: 14, width: 18, textAlign: 'center' },
  actionBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 11, flex: 1 },
  filterDot: {
    position: 'absolute', top: 3, right: 3,
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: COLORS.accent,
    borderWidth: 1.2, borderColor: COLORS.surface,
  },
  placeCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(19,22,30,0.97)', borderRadius: 14,
    borderWidth: 1.5, borderColor: 'rgba(255,107,43,0.5)', padding: 16,
    zIndex: 40,
  },
  placeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  placeName: { color: COLORS.text, fontSize: 16, fontWeight: '800', flex: 1 },
  placeClose: { color: COLORS.muted, fontSize: 18, marginLeft: 8 },
  placeAddress: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  placeDetail: { color: COLORS.textDim, fontSize: 12, marginTop: 6 },
  nearbySocialRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  nearbySocialChip: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 6,
  },
  captureBtn: {
    backgroundColor: COLORS.accent, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', marginTop: 12,
  },
  captureBtnText: { color: '#000', fontWeight: '800', fontSize: 14 },
  signalBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255,107,43,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,107,43,0.3)',
  },
  signalTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
  },
  signalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  bestContactBox: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
  },
  contactName: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
  },
  contactRole: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  contactActionBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  contactActionText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  otherContactsRow: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  otherContactsTitle: {
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '600',
  },
  signalDetail: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  signalBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  signalBtnText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  nearbyPlaceActionsRow: { flexDirection: 'row', marginTop: 12 },
  placePinSelected: {
    borderColor: COLORS.accent2,
    borderWidth: 2,
    backgroundColor: 'rgba(255,107,43,0.95)',
  },
  captureBtnSecondary: {
    backgroundColor: COLORS.surface2,
  },
  nearbyBatchCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: 'rgba(19,22,30,0.98)', borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.borderLit, padding: 14,
    zIndex: 40,
  },
  nearbyBatchActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap' },
  batchBtn: {
    flex: 1, minWidth: 92, margin: 2,
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.borderLit,
  },
  batchBtnText: { color: COLORS.text, fontWeight: '700', fontSize: 12 },
  batchBtnDisabled: {
    opacity: 0.45,
  },
  // TargetLens Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '60%',
    maxHeight: '85%',
    padding: 20,
    borderTopWidth: 1,
    borderColor: COLORS.borderLit,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalClose: {
    color: COLORS.muted,
    fontSize: 20,
    padding: 4,
  },
  modalScroll: {
    flex: 1,
  },
  modalDoneBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  modalDoneText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 16,
  },
  // Active Profile Badge
  activeProfileBadge: {
    position: 'absolute',
    top: 72,
    left: 12,
    backgroundColor: 'rgba(14,16,24,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 90,
  },
  activeProfileLabel: {
    color: COLORS.label,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeProfileValue: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 1,
  },
});
