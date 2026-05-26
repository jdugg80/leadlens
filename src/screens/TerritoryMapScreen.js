
import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import MapView, { Polygon, Marker, Circle } from 'react-native-maps';
import { ScreenHeader } from '../components/UI';
import { loadTerritoryZipMarkersFallback } from '../utils/territoryZipLoader';


const COLORS = {
  bg: '#080A0F',
  surface: '#0F1318',
  accent: '#00C9FF',
  accent2: '#CC1040',
  purple: '#7B3FBE',
  chrome: '#B8BDD0',
  border: '#1a1f2e',
};

const BUSINESS_TYPES = [
  'All Businesses', 'Food Service', 'Hospitality', 'Healthcare', 'Retail',
  'Office/Corporate', 'Warehouses', 'Manufacturing', 'Education', 'Multi-family', 'Entertainment',
];
const ALERT_LEVELS = [
  'All Alerts', 'Priority Review', 'Monitor', 'Opportunity', 'Good Standing',
];
const BUSINESS_TYPE_ICONS = {
  'school': '🏫',
  'university': '🎓',
  'hospital': '🏥',
  'doctor': '👨‍⚕️',
  'pharmacy': '💊',
  'restaurant': '🍽️',
  'cafe': '☕',
  'bar': '🍷',
  'lodging': '🏨',
  'grocery_or_supermarket': '🛒',
  'shopping_mall': '🏬',
  'store': '🏪',
  'office': '🏢',
  'bank': '🏦',
  'factory': '🏭',
  'storage': '📦',
  'apartment': '🏠',
  'real_estate_agency': '🏡',
  'movie_theater': '🎬',
  'amusement_park': '🎡',
  'default': '📍',
};
const SIGNAL_TYPE_ICONS = {
  'rodent': '🐭',
  'bird': '🐦',
  'roach': '🪳',
  'wildlife': '🦌',
  'new_opening': '🆕',
  'new_permit': '📋',
  'health_code': '🏥',
  'health_score': '📊',
  'default': '⚠️',
};
export default function TerritoryMapScreen() {
  const mapRef = useRef(null);
  const navigation = useNavigation();

  const [loading, setLoading] = useState(false);
  const [zipMarkers, setZipMarkers] = useState([]);
  const [searchAddress, setSearchAddress] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterTab, setFilterTab] = useState('lenssignal');
  const [selectedBusinessType, setSelectedBusinessType] = useState('All Businesses');
  const [selectedAlertLevel, setSelectedAlertLevel] = useState('All Alerts');
  const [showSignalsOnly, setShowSignalsOnly] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedSignalType, setSelectedSignalType] = useState('All Types');
  const [selectedHealthRating, setSelectedHealthRating] = useState('All Ratings');
  const [lensSignalResults, setLensSignalResults] = useState([]);
  const [selectedLensSignal, setSelectedLensSignal] = useState(null);
  const [lensSignalModalVisible, setLensSignalModalVisible] = useState(false);
  const [searchingLensSignal, setSearchingLensSignal] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(0));
  useEffect(() => {
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false,
      }),
      Animated.timing(pulseAnim, {
        toValue: 0,
        duration: 1000,
        useNativeDriver: false,
      }),
    ])
  ).start();
}, [pulseAnim]);
  const BUSINESS_TYPE_MAP = {
  'All Businesses': ['restaurant', 'lodging', 'grocery_or_supermarket', 'school', 'hospital'],
  'Food Service': ['restaurant', 'cafe', 'bakery'],
  'Hospitality': ['lodging', 'restaurant', 'bar'],
  'Healthcare': ['hospital', 'doctor', 'pharmacy'],
  'Retail': ['shopping_mall', 'store', 'supermarket'],
  'Office/Corporate': ['office', 'bank'],
  'Warehouses': ['storage'],
  'Manufacturing': ['factory'],
  'Education': ['school', 'university'],
  'Multi-family': ['apartment', 'real_estate_agency'],
  'Entertainment': ['movie_theater', 'amusement_park', 'bar'],
  
};
const filterByAlertLevel = (results) => {
  if (selectedAlertLevel === 'All Alerts') return results;
  
  return results.filter((result) => {
    const rating = result.rating || 3;
    
    switch (selectedAlertLevel) {
      case 'Priority Review':
        return rating < 3.5;
      case 'Monitor':
        return rating >= 3.5 && rating < 4.2;
      case 'Opportunity':
        return rating >= 4.2;
      case 'Good Standing':
        return rating >= 4.5;
      default:
        return true;
    }
  });
};
  useEffect(() => {
    loadTerritories();
  }, []);

  const loadTerritories = async () => {
    try {
      setLoading(true);
      const markers = await loadTerritoryZipMarkersFallback();
      setZipMarkers(markers);
    } catch (error) {
      console.error('[TerritoryMap] Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationPress = () => {
    mapRef.current?.animateToRegion({
      latitude: 29.2108,
      longitude: -95.4506,
      latitudeDelta: 0.5,
      longitudeDelta: 0.5,
    });
  };
  
  const handleAddressChange = async (text) => {
  setSearchAddress(text);
  
  if (text.length < 3) {
    setAddressSuggestions([]);
    return;
  }
  
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?` +
      `input=${encodeURIComponent(text)}` +
      `&key=AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI`
    );
    const data = await response.json();
    setAddressSuggestions(data.predictions || []);
  } catch (error) {
    console.error('[AddressSearch] Error:', error);
  }
};

const handleSuggestionSelect = async (suggestion) => {
  setSearchAddress(suggestion.description);
  setShowSuggestions(false);
  
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?` +
      `place_id=${suggestion.place_id}` +
      `&key=AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI`
    );
    const data = await response.json();
    
    if (data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
    }
  } catch (error) {
    console.error('[Geocoding] Error:', error);
  }
};

const handleAddressSearch = async () => {
  if (!searchAddress) return;
  
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?` +
      `address=${encodeURIComponent(searchAddress)}` +
      `&key=AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI`
    );
    const data = await response.json();
    
    if (data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      mapRef.current?.animateToRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      });
      setShowSuggestions(false);
    }
  } catch (error) {
    console.error('[Geocoding] Error:', error);
  }
};

    const handleSearchPress = async () => {
     try {
        setSearching(true);
        setSearchResults([]);

    const region = await mapRef.current?.getCamera?.();
    const latitude = region?.center?.latitude || 29.2108;
    const longitude = region?.center?.longitude || -95.4506;

    const types = selectedBusinessType === 'All Businesses' 
      ? BUSINESS_TYPE_MAP['All Businesses']
      : BUSINESS_TYPE_MAP[selectedBusinessType] || [];

    if (types.length === 0) {
      setSearching(false);
      return;
    }

    const allResults = [];
    for (const type of types) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
        `location=${latitude},${longitude}` +
        `&radius=5000` +
        `&type=${type}` +
        `&key=AIzaSyBjzIQsLGY1E3paPr8XROVWg83e_JLOJzI`
      );

      const data = await response.json();
      if (data.results) {
        allResults.push(...data.results);
      }
    }

    const uniqueResults = Array.from(
      new Map(allResults.map((item) => [item.place_id, item])).values()
    );

    const filtered = filterByAlertLevel(uniqueResults);

    const final = showSignalsOnly 
      ? filtered.filter((r) => r.rating && r.rating > 4.0)
      : filtered;

    setSearchResults(final);

  } catch (error) {
    console.error('[Search] Error:', error);
  } finally {
    setSearching(false);
  }
};
    
  const handleReloadPress = () => {
    loadTerritories();
  };

  const handleLensSignalSearch = async () => {
  try {
    setSearchingLensSignal(true);
    const region = await mapRef.current?.getCamera?.();
    const latitude = region?.center?.latitude || 29.2108;
    const longitude = region?.center?.longitude || -95.4506;
    
    const results = await queryLensSignals(
      latitude,
      longitude,
      selectedAlertLevel,
      selectedSignalType,
      selectedHealthRating
    );
    
    setLensSignalResults(results);
  } catch (error) {
    console.error('[LensSignal] Error:', error);
  } finally {
    setSearchingLensSignal(false);
  }
};
const queryLensSignals = async (latitude, longitude, alertLevel, signalType, healthRating) => {
  try {
    const { createSupabaseClient } = require('../utils/supabaseClient');
    const supabase = createSupabaseClient();
    
    let query = supabase.from('lens_signals').select('*');
    
    if (alertLevel && alertLevel !== 'All Alerts') {
      query = query.eq('compliance_level', alertLevel);
    }
    
    if (signalType && signalType !== 'All Types') {
      let dbSignalType;
      if (signalType === 'General Compliance') dbSignalType = 'compliance';
      if (signalType === 'Health Code Violations') dbSignalType = 'health_code_violation';
      if (signalType === 'New Business') dbSignalType = 'new_opening';
      if (dbSignalType) query = query.eq('signal_type', dbSignalType);
    }
    
    if (healthRating && healthRating !== 'All Ratings') {
      query = query.eq('compliance_score', healthRating);
    }
    
    const { data, error } = await query;
    if (error) {
      console.error('[LensSignal Query] Error:', error);
      return [];
    }
    
    // Filter by distance client-side (5 miles = 8047 meters)
    if (data && Array.isArray(data)) {
      return data.filter(signal => {
        const distance = getDistance(latitude, longitude, parseFloat(signal.latitude), parseFloat(signal.longitude));
        return distance <= 8047; // 5 miles in meters
      });
    }
    return [];
  } catch (error) {
    console.error('[LensSignal Query] Exception:', error);
    return [];
  }
};

// Add distance calculation helper:
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('[Location] Permission denied');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      });
      
      console.log('[Location] GPS updated:', { lat: location.coords.latitude, lng: location.coords.longitude });
    } catch (error) {
      console.error('[Location] Error:', error);
    }
  };
  
  getLocation();
  const interval = setInterval(getLocation, 10000);
  
  return () => clearInterval(interval);
}, []);

useEffect(() => {
  if (selectedLensSignal) {
    setLensSignalModalVisible(true);
  }
}, [selectedLensSignal]);

  return (
    
    <SafeAreaView style={styles.container}>
      <ScreenHeader title="Territory Map" onBack={() => navigation.goBack()} />

      {/* Map - Full Width */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.loadingText}>Loading territories...</Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: 29.2108,
              longitude: -95.4506,
              latitudeDelta: 0.5,
              longitudeDelta: 0.5,
            }}
          >{/* GPS Location Target */}
{userLocation && (
  <Marker
    coordinate={{
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    }}
  >
    <View style={styles.gpsMarker}>
      <View style={styles.gpsPulse} />
      <View style={styles.gpsCenter} />
    </View>
  </Marker>
)}

          {/* Search Result Markers */}
{searchResults.map((result) => {
  const type = result.types?.[0] || 'default';
  const icon = BUSINESS_TYPE_ICONS[type] || BUSINESS_TYPE_ICONS['default'];
  
  return (
    <Marker
      key={result.place_id}
      coordinate={{
        latitude: result.geometry.location.lat,
        longitude: result.geometry.location.lng,
      }}
      onPress={() => setSelectedLensSignal({ ...result, isSearchResult: true })}
    >
        <Text style={styles.resultMarkerIcon}>{icon}</Text>
    </Marker>
  );
})}
{/* LensSignal Markers */}
{lensSignalResults.map((signal) => {
  const signalIcon = SIGNAL_TYPE_ICONS[signal.signal_type] || SIGNAL_TYPE_ICONS['default'];
  
  return (
    <Marker
      key={signal.id}
      coordinate={{
        latitude: parseFloat(signal.latitude),
        longitude: parseFloat(signal.longitude),
      }}
      onPress={() => setSelectedLensSignal(signal)}
    >
      <Text style={{ fontSize: 28 }}>{signalIcon}</Text>
    </Marker>
  );
})}
   {/* Polygons disabled - debugging needed */}
{/* {zipMarkers.map((marker) => { ... })} */}
  
        </MapView>

          {/* Floating Search Bar */}
          <View style={styles.floatingSearchSection}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color={COLORS.accent} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search address or business..."
                placeholderTextColor={COLORS.chrome}
                value={searchAddress}
                onChangeText={handleAddressChange}
                onFocus={() => setShowSuggestions(true)}
              />
            </View>
            
            {showSuggestions && addressSuggestions.length > 0 && (
              <ScrollView style={styles.suggestionsDropdown}>
                {addressSuggestions.map((suggestion, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestionItem}
                    onPress={() => handleSuggestionSelect(suggestion)}
                  >
                    <Text style={styles.suggestionText}>{suggestion.description}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity 
                style={styles.filterBtn}
                onPress={() => {
                  setFilterTab('prospecting');
                  setFilterModalVisible(true);
                }}
              >
                <Ionicons name="home" size={16} color={COLORS.chrome} />
                <Text style={styles.filterBtnText}>Industry</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.filterBtn}
                onPress={() => {
                  setFilterTab('lenssignal');
                  setFilterModalVisible(true);
                }}
              >
                <Ionicons name="bar-chart" size={16} color={COLORS.chrome} />
                <Text style={styles.filterBtnText}>Signals</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}
{/* Search Results Modal */}

{!loading && zipMarkers.map((marker) => {
  if (!marker.isFallback) return null;
  
  return (
    <View
      key={`fallback-${marker.zip}`}
      style={{
        position: 'absolute',
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: `${COLORS.accent}40`,
        borderColor: COLORS.accent,
        borderWidth: 1,
      }}
    />
  );
})}
{/* FAB Buttons */}
      <View style={styles.fabContainer}>
        <TouchableOpacity style={styles.fab} onPress={handleLocationPress}>
          <Ionicons name="location" size={24} color={COLORS.bg} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleSearchPress}>
  <Ionicons name="search" size={24} color={COLORS.bg} />
</TouchableOpacity>
<TouchableOpacity style={styles.fab} onPress={handleLensSignalSearch}>
  <Text style={{ fontSize: 24 }}>🎯</Text>
</TouchableOpacity>
<TouchableOpacity style={styles.fab} onPress={() => setFilterModalVisible(true)}>
  <Ionicons name="funnel" size={24} color={COLORS.bg} />
</TouchableOpacity>
        <TouchableOpacity style={styles.fab} onPress={handleReloadPress}>
          <Ionicons name="reload" size={24} color={COLORS.bg} />
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.chrome} />
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, filterTab === 'lenssignal' && styles.tabActive]}
                onPress={() => setFilterTab('lenssignal')}
              >
                <Text style={[styles.tabText, filterTab === 'lenssignal' && styles.tabTextActive]}>
                  LensSignal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, filterTab === 'prospecting' && styles.tabActive]}
                onPress={() => setFilterTab('prospecting')}
              >
                <Text style={[styles.tabText, filterTab === 'prospecting' && styles.tabTextActive]}>
                  Prospecting
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {filterTab === 'lenssignal' ? (
                <>
                  <Text style={styles.label}>Alert Level:</Text>
                  <View style={styles.pillRow}>
                    {ALERT_LEVELS.map((level) => (
                      <TouchableOpacity
                        key={level}
                        style={[styles.pill, selectedAlertLevel === level && styles.pillActive]}
                        onPress={() => setSelectedAlertLevel(level)}
                      >
                        <Text style={[styles.pillText, selectedAlertLevel === level && styles.pillTextActive]}>
                          {level}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { marginTop: 20 }]}>Signal Type:</Text>
                  <View style={styles.pillRow}>
                    {['All Types', 'General Compliance', 'Health Code Violations', 'New Business'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.pill, selectedSignalType === type && styles.pillActive]}
                        onPress={() => setSelectedSignalType(type)}
                      >
                        <Text style={[styles.pillText, selectedSignalType === type && styles.pillTextActive]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { marginTop: 20 }]}>Health Rating:</Text>
                  <View style={styles.pillRow}>
                    {['All Ratings', 'A', 'B', 'C', 'D', 'F'].map((rating) => (
                      <TouchableOpacity
                        key={rating}
                        style={[styles.pill, selectedHealthRating === rating && styles.pillActive]}
                        onPress={() => setSelectedHealthRating(rating)}
                      >
                        <Text style={[styles.pillText, selectedHealthRating === rating && styles.pillTextActive]}>
                          {rating}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.label}>Business Type:</Text>
                  <View style={styles.pillRow}>
                    {BUSINESS_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.pill, selectedBusinessType === type && styles.pillActive]}
                        onPress={() => setSelectedBusinessType(type)}
                      >
                        <Text style={[styles.pillText, selectedBusinessType === type && styles.pillTextActive]}>
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={[styles.label, { marginTop: 20 }]}>Show Signals Only:</Text>
                  <TouchableOpacity
                    style={[styles.pill, !showSignalsOnly && styles.pillActive]}
                    onPress={() => setShowSignalsOnly(false)}
                  >
                    <Text style={[styles.pillText, !showSignalsOnly && styles.pillTextActive]}>
                      Disabled
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterModalVisible(false)}>
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* LensSignal Contact Card Modal */}
<Modal visible={lensSignalModalVisible} transparent animationType="slide" onRequestClose={() => setLensSignalModalVisible(false)}>
  <View style={styles.modalOverlay}>
    <View style={[styles.modalContent, { maxHeight: '70%' }]}>
      {selectedLensSignal ? (
        <>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedLensSignal.establishment_name || selectedLensSignal.name}</Text>
            <TouchableOpacity onPress={() => setLensSignalModalVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.chrome} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll}>
            {/* Signal Type Badge - LensSignals Only */}
            {selectedLensSignal.signal_type && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 20, marginRight: 8 }}>
                  {SIGNAL_TYPE_ICONS[selectedLensSignal.signal_type] || SIGNAL_TYPE_ICONS['default']}
                </Text>
                <Text style={[styles.label, { margin: 0 }]}>
                  {selectedLensSignal.signal_type}
                </Text>
              </View>
            )}

            {/* Address */}
            {(selectedLensSignal.address || selectedLensSignal.formatted_address) && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>📍 Address:</Text>
                <Text style={{ color: COLORS.chrome, fontSize: 13 }}>
                  {selectedLensSignal.address || selectedLensSignal.formatted_address}
                </Text>
              </View>
            )}

            {/* Phone */}
            {selectedLensSignal.phone && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>☎️ Phone:</Text>
                <Text style={{ color: COLORS.chrome, fontSize: 13 }}>
                  {selectedLensSignal.phone}
                </Text>
              </View>
            )}

            {/* Email */}
            {selectedLensSignal.email && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>✉️ Email:</Text>
                <Text style={{ color: COLORS.chrome, fontSize: 13 }}>
                  {selectedLensSignal.email}
                </Text>
              </View>
            )}

            {/* Health Rating */}
            {selectedLensSignal.compliance_score && (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.label}>🏥 Health Rating:</Text>
                <Text style={{ color: COLORS.accent, fontSize: 16, fontWeight: '700' }}>
                  {selectedLensSignal.compliance_score}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border }}>
            <TouchableOpacity style={[styles.fab, { flex: 1, width: 'auto' }]}>
              <Ionicons name="add" size={20} color={COLORS.bg} />
              <Text style={{ color: COLORS.bg, fontSize: 12, marginTop: 4 }}>Queue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fab, { flex: 1, width: 'auto' }]}>
              <Ionicons name="document" size={20} color={COLORS.bg} />
              <Text style={{ color: COLORS.bg, fontSize: 12, marginTop: 4 }}>Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fab, { flex: 1, width: 'auto' }]}>
              <Ionicons name="call" size={20} color={COLORS.bg} />
              <Text style={{ color: COLORS.bg, fontSize: 12, marginTop: 4 }}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.fab, { flex: 1, width: 'auto' }]}>
              <Ionicons name="mail" size={20} color={COLORS.bg} />
              <Text style={{ color: COLORS.bg, fontSize: 12, marginTop: 4 }}>Email</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : null}
    </View>
  </View>
</Modal>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    borderBottomWidth: 4,
    borderBottomColor: COLORS.purple,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.chrome,
  },
  searchSection: {
    paddingHorizontal: 12,
    paddingVertical: 15,
    gap: 5,
  },
  floatingSearchSection: {
    position: 'absolute',
    top: 100,
    left: 12,
    right: 12,
    backgroundColor: 'transparent',
    zIndex: 10,
    gap: 8,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: COLORS.chrome,
    fontSize: 13,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  filterBtnText: {
    color: COLORS.chrome,
    fontSize: 11,
    fontWeight: '500',
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: COLORS.chrome,
    fontSize: 14,
    marginTop: 10,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.chrome,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.chrome,
  },
  tabTextActive: {
    color: COLORS.bg,
  },
  modalScroll: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 400,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.chrome,
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  pillActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  pillText: {
    fontSize: 12,
    color: COLORS.chrome,
    fontWeight: '500',
  },
  pillTextActive: {
    color: COLORS.bg,
  },
  applyBtn: {
    backgroundColor: COLORS.accent,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  applyText: {
    color: COLORS.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  searchResultsOverlay: {
  position: 'absolute',
  bottom: 280,
  left: 12,
  right: 12,
  backgroundColor: COLORS.surface,
  borderRadius: 12,
  maxHeight: 300,
  borderWidth: 2,
  borderColor: COLORS.accent,
},
resultHeader: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.border,
},
resultTitle: {
  fontSize: 14,
  fontWeight: '700',
  color: COLORS.accent,
},
resultsList: {
  maxHeight: 250,
},
resultItem: {
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.border,
},
resultName: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.chrome,
},
resultType: {
  fontSize: 11,
  color: COLORS.chrome,
  marginTop: 4,
  opacity: 0.7,
},
suggestionItem: {
  padding: 12,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.border,
  backgroundColor: COLORS.surface,
},
suggestionItem: {
  padding: 12,
  borderBottomWidth: 1,
  borderBottomColor: COLORS.accent,
},
suggestionText: {
  color: COLORS.accent,
  fontSize: 14,
  fontWeight: '600',
},
targetContainer: {
  width: 60,
  height: 60,
  justifyContent: 'center',
  alignItems: 'center',
},
targetRing1: {
  position: 'absolute',
  width: 60,
  height: 60,
  borderRadius: 30,
  borderWidth: 6,
  borderColor: COLORS.accent,
  opacity: 10.5,
},
targetRing2: {
  position: 'absolute',
  width: 40,
  height: 40,
  borderRadius: 20,
  borderWidth: 6,
  borderColor: COLORS.accent,
  opacity: 10.5,
},
targetCrosshair: {
  position: 'absolute',
  width: 30,
  height: 30,
  justifyContent: 'center',
  alignItems: 'center',
},
targetVertical: {
  position: 'absolute',
  width: 2,
  height: 30,
  backgroundColor: COLORS.accent,
},
targetHorizontal: {
  position: 'absolute',
  width: 30,
  height: 2,
  backgroundColor: COLORS.accent,
},
targetDot: {
  width: 8,
  height: 8,
  borderRadius: 5,
  backgroundColor: COLORS.accent,
  zIndex: 10,
},
resultMarker: {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: COLORS.accent2,
  justifyContent: 'center',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: COLORS.bg,
},
resultMarkerIcon: {
  fontSize: 30,
},
gpsMarker: {
  width: 50,
  height: 50,
  borderRadius: 25,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: `${COLORS.accent}20`,
  borderWidth: 2,
  borderColor: COLORS.accent,
},
gpsPulse: {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 2,
  borderColor: COLORS.accent,
  position: 'absolute',
},
gpsCenter: {
  width: 12,
  height: 12,
  borderRadius: 6,
  backgroundColor: COLORS.accent,
},
});
