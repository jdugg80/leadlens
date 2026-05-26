import 'react-native-url-polyfill/auto';
import { configurePushNotifications } from './src/utils/pushNotifications';
configurePushNotifications();

import { useEffect, useRef, useCallback } from 'react';
import { View, Animated, StyleSheet, AppState, Alert, Linking } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { AppRegistry } from 'react-native';

import { storage as AsyncStorage } from './src/utils/storage';
import { USER_STORAGE_KEY } from './src/constants';
import { bindAutoExportOnAppResume, registerBackgroundAutoExport } from './src/utils/autoExport';
import { processQueue } from './src/utils/taskRunner';
import BetaTracker from './utils/betaTracker';
import { getCurrentCoords, reverseGeocodeCoords } from './src/utils/geoEnrich';

import SplashScreen               from './src/screens/SplashScreen';
import LoginScreen                from './src/screens/LoginScreen';
import DashboardScreen            from './src/screens/DashboardScreen';
import CaptureScreen              from './src/screens/CaptureScreen';
import ManualEntryScreen          from './src/screens/ManualEntryScreen';
import ReviewScreen               from './src/screens/ReviewScreen';
import ExportScreen               from './src/screens/ExportScreen';
import AdminScreen                from './src/screens/AdminScreen';
import BatchReviewScreen          from './src/screens/BatchReviewScreen';
import SettingsScreen             from './src/screens/SettingsScreen';
import ConsentScreen              from './src/screens/ConsentScreen';
import FAQScreen                  from './src/screens/FAQScreen';
import SupportScreen              from './src/screens/SupportScreen';
import LegalDocumentScreen        from './src/screens/LegalDocumentScreen';
import TerritoryManagerScreen     from './src/screens/TerritoryManagerScreen';
import TerritoryMapScreen         from './src/screens/TerritoryMapScreen';
import LeadLockReviewScreen       from './src/screens/LeadLockReviewScreen';
import LeadLockCameraScreen       from './src/screens/LeadLockCameraScreen';
import CardGalleryScreen          from './src/screens/CardGalleryScreen';
import TargetMapAdjusterScreen    from './src/screens/TargetMapAdjusterScreen';

WebBrowser.maybeCompleteAuthSession();

const Stack = createNativeStackNavigator();

// ── UPDATE CHECK ──────────────────────────────────────────────────────────────
// Reads latest_build from Supabase app_config table.
// To push an update: increment latest_build row and update apk_url row.
async function checkForUpdate() {
  console.log('[UPDATE] Starting check...');
  try {
    const supabaseUrl = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbnRneWhmeHhiY3d3Y3hhb3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyODE5NjQsImV4cCI6MjA5Mzg1Nzk2NH0.sN8lupQFAGGsPr_UuEQGqm9JYMASP8D0wyPfCxIMaAw';
    if (!supabaseKey) {
      console.log('[UPDATE] No key');
      return;
    }

    console.log('[UPDATE] Fetching from Scarlett...');
    const res = await fetch(
      `${supabaseUrl}/rest/v1/app_config?select=current_build,apk_url,update_message&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    console.log('[UPDATE] Response status:', res.status);
    if (!res.ok) {
      console.log('[UPDATE] Fetch failed');
      return;
    }

    const rows = await res.json();
    console.log('[UPDATE] Got rows:', rows);
    if (!Array.isArray(rows) || !rows.length) {
      console.log('[UPDATE] No rows');
      return;
    }

    const cfg = rows[0];
    const latestBuild = parseInt(cfg.current_build || '0', 10);
    const currentBuild = parseInt(
      String(Constants.expoConfig?.extra?.betaBuild || Constants.nativeBuildVersion || '0'),
      10
    );

    console.log('[UPDATE] Latest:', latestBuild, 'Current:', currentBuild);

    if (latestBuild > currentBuild) {
      console.log('[UPDATE] SHOWING ALERT');
      const notes = cfg.update_message ? `\n\nWhat's new:\n${cfg.update_message}` : '';
      Alert.alert(
        'Update Available — BETA-' + latestBuild,
        `A new build is ready to install.${notes}\n\nDownload and install it now to stay current.`,
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Download Now', onPress: () => cfg.apk_url && Linking.openURL(cfg.apk_url) },
        ],
        { cancelable: false }
      );
    } else {
      console.log('[UPDATE] Already up to date');
    }
  } catch (err) {
    console.warn('[UPDATE] Error:', err?.message || String(err));
  }
}

// ── UPDATE GLOBAL LOCATION ──────────────────────────────────────────────────
async function updateGlobalLocation() {
  console.log('[GPS] Updating global location...');
  try {
    const coords = await getCurrentCoords();
    if (coords) {
      let city = 'Houston';
      let county = 'Harris';
      try {
        const geoInfo = await reverseGeocodeCoords(coords);
        if (geoInfo) {
          city = geoInfo.city || geoInfo.town || geoInfo.village || 'Houston';
          county = geoInfo.county || 'Harris';
        }
      } catch (err) {
        console.warn('[GPS] Reverse geocoding failed:', err);
      }

      const locationObj = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        city,
        county,
        updatedAt: new Date().toISOString()
      };

      // Use sync API for instant storage
      AsyncStorage.setSync('currentLocation', JSON.stringify(locationObj));
      console.log('[GPS] Global location updated successfully:', locationObj);
    }
  } catch (err) {
    console.warn('[GPS] Failed to update global location:', err);
  }
}

// ── FLASH OVERLAY ─────────────────────────────────────────────────────────────
function FlashOverlay({ flashAnim }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.flash, { opacity: flashAnim }]}
    />
  );
}

export default function App() {
  const flashAnim = useRef(new Animated.Value(0)).current;
  const appState  = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      // ── Existing startup tasks ──────────────────
      processQueue().catch(() => {});

      // Use sync API for instant app startup
      const rawUser = AsyncStorage.getSync(USER_STORAGE_KEY);
      if (rawUser) {
        try {
          const user = JSON.parse(rawUser);
          if (user && typeof user === 'object') {
            bindAutoExportOnAppResume(user);
            registerBackgroundAutoExport().catch(() => {});

            // ── Beta tracking: start session with saved user email ──
            if (user.email) {
              await BetaTracker.init(user.email);
            }
          }
        } catch (err) {
          console.warn('[App] Could not read saved user profile:', err?.message || String(err));
        }
      } else {
        // No user yet — init anyway (tracker will stay off until login)
        await BetaTracker.init();
      }

      // ── Check for forced updates ──
      checkForUpdate().catch(() => {});

      // ── Update actual GPS on app launch ──
      updateGlobalLocation().catch(() => {});
    })();

    // ── AppState listener: task queue + beta session tracking ──
    const sub = AppState.addEventListener('change', async (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      if (nextState === 'active') {
        // App came to foreground
        processQueue().catch(() => {});
        updateGlobalLocation().catch(() => {});
        await BetaTracker.init();  // resumes/starts a new session
      }

      if (prev === 'active' && nextState.match(/inactive|background/)) {
        // App went to background
        await BetaTracker.endSession();
      }
    });

    return () => sub.remove();
  }, []);

  const triggerFlash = useCallback(() => {
    flashAnim.setValue(1);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [flashAnim]);

  const onStateChange = useCallback(() => {
    triggerFlash();
  }, [triggerFlash]);

  return (
    <SafeAreaProvider>
      <NavigationContainer onStateChange={onStateChange}>
        <StatusBar style="light" backgroundColor="#0D0F14" />
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: '#0D0F14' },
          }}
        >
          <Stack.Screen name="Splash"              component={SplashScreen} />
          <Stack.Screen name="Login"               component={LoginScreen} />
          <Stack.Screen name="Dashboard"           component={DashboardScreen} />
          <Stack.Screen name="Capture"             component={CaptureScreen} />
          <Stack.Screen name="ManualEntry"         component={ManualEntryScreen} />
          <Stack.Screen name="Review"              component={ReviewScreen} />
          <Stack.Screen name="BatchReview"         component={BatchReviewScreen} />
          <Stack.Screen name="Settings"            component={SettingsScreen} />
          <Stack.Screen name="AutomationSettings"  component={SettingsScreen} />
          <Stack.Screen name="Consent"             component={ConsentScreen} />
          <Stack.Screen name="FAQ"                 component={FAQScreen} />
          <Stack.Screen name="Support"             component={SupportScreen} />
          <Stack.Screen name="LegalDocument"       component={LegalDocumentScreen} />
          <Stack.Screen name="Export"              component={ExportScreen} />
          <Stack.Screen name="Admin"               component={AdminScreen} />
          <Stack.Screen name="TerritoryManager"    component={TerritoryManagerScreen} />
          <Stack.Screen name="TerritoryMap"        component={TerritoryMapScreen} />
          <Stack.Screen name="LeadLockReview"      component={LeadLockReviewScreen} />
          <Stack.Screen name="LeadLockCamera"      component={LeadLockCameraScreen} />
          <Stack.Screen name="CardGallery"         component={CardGalleryScreen} />
          <Stack.Screen
            name="TargetMapAdjuster"
            component={TargetMapAdjusterScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
        <FlashOverlay flashAnim={flashAnim} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    pointerEvents: 'none',
  },
});

AppRegistry.registerComponent('leadlens', () => App);
