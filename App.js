import 'react-native-url-polyfill/auto';
import { configurePushNotifications } from './src/utils/pushNotifications';
configurePushNotifications();

import React, { Component, useEffect, useRef, useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, AppState, Alert, Linking, Modal, ScrollView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { AppRegistry } from 'react-native';

import { ToastProvider } from './src/context/ToastContext';
import { storage as AsyncStorage } from './src/utils/storage';
import { USER_STORAGE_KEY, getAppVersionString } from './src/constants';
import { bindAutoExportOnAppResume, registerBackgroundAutoExport } from './src/utils/autoExport';
import { processQueue } from './src/utils/taskRunner';
import BetaTracker from './utils/betaTracker';
import { getCurrentCoords, reverseGeocodeCoords } from './src/utils/geoEnrich';
import {
  markBackgroundOptimizationPrompted,
  openBatteryOptimizationSettings,
  recordLastActiveAt,
  recordLastActiveRoute,
  shouldPromptBackgroundOptimization,
} from './src/utils/backgroundStability';

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
import BugReportScreen            from './src/screens/BugReportScreen';
import FeatureRequestScreen       from './src/screens/FeatureRequestScreen';
import LegalDocumentScreen        from './src/screens/LegalDocumentScreen';
import TerritoryManagerScreen     from './src/screens/TerritoryManagerScreen';
import TerritoryMapScreen         from './src/screens/TerritoryMapScreen';
import LeadLockReviewScreen       from './src/screens/LeadLockReviewScreen';
import LeadLockCameraScreen       from './src/screens/LeadLockCameraScreen';
import PhotoIngestScreen          from './src/screens/PhotoIngestScreen';
import CardGalleryScreen          from './src/screens/CardGalleryScreen';
import TargetMapAdjusterScreen    from './src/screens/TargetMapAdjusterScreen';
import ProspectQueueScreen        from './src/screens/ProspectQueueScreen';
import BetaFeedbackScreen         from './src/screens/BetaFeedbackScreen';
import BetaFeedbackFAB            from './src/components/BetaFeedbackFAB';

WebBrowser.maybeCompleteAuthSession();

const Stack = createNativeStackNavigator();

let globalHandlersInstalled = false;

function reportGlobalCrash(source, error, fatal = false) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const stack = error instanceof Error && error.stack ? error.stack.slice(0, 1200) : '';
  console.error(`[CrashGuard][${source}]`, message, stack);
  BetaTracker.trackError(message, {
    screen: source,
    feature: fatal ? 'fatal_crash' : 'runtime_error',
    metadata: { fatal, stack },
  }).catch(() => {});
}

function installGlobalErrorHandlers() {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  const errorUtils = global.ErrorUtils;
  const previousHandler = errorUtils?.getGlobalHandler?.();
  if (errorUtils?.setGlobalHandler) {
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportGlobalCrash('global_js_error', error, !!isFatal);
      if (previousHandler) previousHandler(error, isFatal);
    });
  }

  try {
    require('promise/setimmediate/rejection-tracking').enable({
      allRejections: true,
      onUnhandled: (id, error) => reportGlobalCrash('unhandled_promise_rejection', error, false),
      onHandled: () => {},
    });
  } catch (err) {
    console.warn('[CrashGuard] Promise rejection tracking unavailable:', err?.message || String(err));
  }
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportGlobalCrash('react_error_boundary', error, false);
    BetaTracker.trackError(error?.message || 'React render error', {
      screen: 'AppErrorBoundary',
      feature: 'react_boundary',
      metadata: { componentStack: info?.componentStack?.slice(0, 1200) || '' },
    }).catch(() => {});
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.errorBoundary}>
        <Text style={styles.errorTitle}>LeadLens hit a recoverable error.</Text>
        <Text style={styles.errorText}>The issue was logged. Tap below to reload the app shell.</Text>
        <TouchableOpacity style={styles.errorButton} onPress={() => this.setState({ error: null })}>
          <Text style={styles.errorButtonText}>Reload</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

// ── UPDATE CHECK ──────────────────────────────────────────────────────────────
// Reads latest_build from Supabase app_config table.
// To push an update: increment latest_build row and update apk_url row.
async function checkForUpdate(onUpdateAvailable) {
  console.log('[UPDATE] Starting check...');
  try {
    const supabaseUrl = process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
    const supabaseKey = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
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
      console.log('[UPDATE] SHOWING UPDATE MODAL');
      onUpdateAvailable?.({
        build: latestBuild,
        apkUrl: cfg.apk_url,
        notes: cfg.update_message || '',
      });
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
    // 5s timeout prevents indefinite hang if GPS hardware is unresponsive
    const coords = await Promise.race([
      getCurrentCoords(),
      new Promise(resolve => setTimeout(() => resolve(null), 5000)),
    ]).catch(() => null);
    if (coords) {
      let city = 'Houston';
      let county = 'Harris';
      let zip = null;
      try {
        const geoInfo = await reverseGeocodeCoords(coords);
        if (geoInfo) {
          city = geoInfo.city || geoInfo.town || geoInfo.village || 'Houston';
          county = geoInfo.county || 'Harris';
          zip = geoInfo.zip || geoInfo.postcode || geoInfo.postal_code || null;
        }
      } catch (err) {
        console.warn('[GPS] Reverse geocoding failed:', err);
      }

      const locationObj = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        city,
        county,
        zip,
        updatedAt: new Date().toISOString()
      };

      // Use sync API for instant storage, but never let MMKV instability crash startup
      try {
        AsyncStorage.setSync('currentLocation', JSON.stringify(locationObj));
      } catch (storageErr) {
        console.warn('[GPS] currentLocation storage failed:', storageErr?.message || String(storageErr));
      }
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
  const navRef = useRef(null);
  const [updateModal, setUpdateModal] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    installGlobalErrorHandlers();
    (async () => {
      try {
        // ── Existing startup tasks ──────────────────
        processQueue().catch((err) => reportGlobalCrash('task_queue_startup', err, false));

        // Use sync API for instant app startup
        const rawUser = AsyncStorage.getSync(USER_STORAGE_KEY);
        if (rawUser) {
          try {
            const user = JSON.parse(rawUser);
            if (user && typeof user === 'object') {
              setUser(user);
              bindAutoExportOnAppResume(user);
              registerBackgroundAutoExport().catch((err) => reportGlobalCrash('background_auto_export', err, false));

              // ── Beta tracking: start session with saved user email ──
              if (user.email) {
                BetaTracker.setEmail(user.email);
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
        if (!__DEV__) {
          checkForUpdate((data) => setUpdateModal(data)).catch((err) => reportGlobalCrash('update_check', err, false));
        }

        // ── Update actual GPS on app launch ──
        updateGlobalLocation().catch((err) => reportGlobalCrash('global_location_startup', err, false));

      // ── One-time Android battery optimization prompt ──
        if (shouldPromptBackgroundOptimization()) {
          markBackgroundOptimizationPrompted();
          Alert.alert(
            'Keep LeadLens Active',
            'To reduce shutdowns while in background, disable battery optimization for LeadLens. This helps keep scans and queue processing ready during the work day.',
            [
              { text: 'Not Now', style: 'cancel' },
              {
                text: 'Open Battery Settings',
                onPress: () => {
                  openBatteryOptimizationSettings().catch((err) => reportGlobalCrash('battery_settings', err, false));
                },
              },
            ]
          );
        }
      } catch (err) {
        reportGlobalCrash('app_startup', err, false);
      }
    })();

    // ── AppState listener: task queue + beta session tracking ──
    let activeDebounceTimer = null;
    let backgroundDebounceTimer = null;
    const SESSION_DEBOUNCE_MS = 2000;

    const sub = AppState.addEventListener('change', async (nextState) => {
      try {
        const prev = appState.current;
        appState.current = nextState;

        if (nextState === 'active') {
          // Cancel any pending background endSession
          if (backgroundDebounceTimer) {
            clearTimeout(backgroundDebounceTimer);
            backgroundDebounceTimer = null;
          }

          // Fire immediately (fire-and-forget)
          recordLastActiveAt();
          processQueue().catch((err) => reportGlobalCrash('task_queue_resume', err, false));
          updateGlobalLocation().catch((err) => reportGlobalCrash('global_location_resume', err, false));

          // Debounce BetaTracker.init() — only fire if app stays active past the window
          if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
          activeDebounceTimer = setTimeout(() => {
            activeDebounceTimer = null;
            BetaTracker.init().catch((err) => reportGlobalCrash('betatracker_init', err, false));
          }, SESSION_DEBOUNCE_MS);
        }

        if (prev === 'active' && nextState.match(/inactive|background/)) {
          // Cancel any pending active init
          if (activeDebounceTimer) {
            clearTimeout(activeDebounceTimer);
            activeDebounceTimer = null;
          }

          // Fire immediately (fire-and-forget)
          const routeName = navRef.current?.getCurrentRoute?.()?.name;
          recordLastActiveAt();
          if (routeName) recordLastActiveRoute(routeName);

          // Debounce BetaTracker.endSession() — only fire if app stays backgrounded past the window
          if (backgroundDebounceTimer) clearTimeout(backgroundDebounceTimer);
          backgroundDebounceTimer = setTimeout(() => {
            backgroundDebounceTimer = null;
            BetaTracker.endSession().catch((err) => reportGlobalCrash('betatracker_end_session', err, false));
          }, SESSION_DEBOUNCE_MS);
        }
      } catch (err) {
        reportGlobalCrash('app_state_listener', err, false);
      }
    });

    let memSub = null;
    try {
      memSub = AppState.addEventListener('memoryWarning', () => {
        console.warn('[CrashGuard] memoryWarning received');
        BetaTracker.track('memory_warning', { screen: navRef.current?.getCurrentRoute?.()?.name || 'unknown', feature: 'memory', severity: 'warning' }).catch(() => {});
      });
    } catch (_) {}

    return () => {
      sub.remove();
      memSub?.remove?.();
      if (activeDebounceTimer) clearTimeout(activeDebounceTimer);
      if (backgroundDebounceTimer) clearTimeout(backgroundDebounceTimer);
    };
  }, []);

  const triggerFlash = useCallback(() => {
    flashAnim.setValue(1);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [flashAnim]);

  const onStateChange = useCallback(() => {
    triggerFlash();
    const routeName = navRef.current?.getCurrentRoute?.()?.name;
    if (routeName) recordLastActiveRoute(routeName);
  }, [triggerFlash]);

  return (
    <AppErrorBoundary>
    <SafeAreaProvider>
      <ToastProvider>
      <NavigationContainer
        ref={navRef}
        onReady={() => {
          const routeName = navRef.current?.getCurrentRoute?.()?.name;
          if (routeName) recordLastActiveRoute(routeName);
          recordLastActiveAt();
        }}
        onStateChange={onStateChange}
      >
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
          <Stack.Screen name="BugReportScreen" component={BugReportScreen} />
          <Stack.Screen name="FeatureRequestScreen" component={FeatureRequestScreen} />
          <Stack.Screen name="LegalDocument"       component={LegalDocumentScreen} />
          <Stack.Screen name="Export"              component={ExportScreen} />
          <Stack.Screen name="Admin"               component={AdminScreen} />
          <Stack.Screen name="TerritoryManager"    component={TerritoryManagerScreen} />
          <Stack.Screen name="TerritoryMap"        component={TerritoryMapScreen} />
          <Stack.Screen name="LeadLockReview"      component={LeadLockReviewScreen} />
          <Stack.Screen name="LeadLockCamera"      component={LeadLockCameraScreen} />
          <Stack.Screen name="PhotoIngest"         component={PhotoIngestScreen} />
          <Stack.Screen name="ProspectQueue"       component={ProspectQueueScreen} />
          <Stack.Screen name="CardGallery"         component={CardGalleryScreen} />
          <Stack.Screen
            name="TargetMapAdjuster"
            component={TargetMapAdjusterScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="BetaFeedback"
            component={BetaFeedbackScreen}
            options={{ headerShown: false, presentation: 'modal' }}
          />
        </Stack.Navigator>
        <BetaFeedbackFAB
          testerEmail={user?.repEmail || ''}
          testerName={user?.repName || ''}
          appVersion={getAppVersionString()}
        />
        <FlashOverlay flashAnim={flashAnim} />
        <Modal visible={!!updateModal} transparent animationType="fade" onRequestClose={() => setUpdateModal(null)}>
          <View style={ustyles.overlay}>
            <View style={ustyles.card}>
              <Text style={ustyles.title}>Update Available</Text>
              <Text style={ustyles.build}>BETA-{updateModal?.build}</Text>
              {updateModal?.notes ? (
                <ScrollView style={ustyles.notesScroll} nestedScrollEnabled>
                  {updateModal.notes.split('\n').map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <View key={i} style={{ height: 6 }} />;
                    if (/^#{1,3}\s/.test(trimmed)) {
                      return <Text key={i} style={ustyles.heading}>{trimmed.replace(/^#{1,3}\s*/, '')}</Text>;
                    }
                    if (/^[-•*]\s/.test(trimmed)) {
                      return <Text key={i} style={ustyles.bullet}>{trimmed.replace(/^[-•*]\s*/, '\u2022 ')}</Text>;
                    }
                    return <Text key={i} style={ustyles.bodyText}>{trimmed}</Text>;
                  })}
                </ScrollView>
              ) : (
                <Text style={ustyles.bodyText}>Bug fixes and improvements.</Text>
              )}
              <TouchableOpacity style={ustyles.downloadBtn} onPress={() => {
                if (updateModal?.apkUrl) Linking.openURL(updateModal.apkUrl);
                setUpdateModal(null);
              }}>
                <Text style={ustyles.downloadBtnText}>Download Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={ustyles.laterBtn} onPress={() => setUpdateModal(null)}>
                <Text style={ustyles.laterBtnText}>Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 9999,
    pointerEvents: 'none',
  },
  errorBoundary: {
    flex: 1,
    backgroundColor: '#080A0F',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10,
  },
  errorText: {
    color: '#B8BDD0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  errorButton: {
    backgroundColor: '#00C9FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  errorButtonText: {
    color: '#000000',
    fontWeight: '800',
  },
});

AppRegistry.registerComponent('leadlens', () => App);

const ustyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#14161C',
    borderRadius: 14,
    width: '100%',
    maxWidth: 380,
    maxHeight: '85%',
    padding: 20,
    borderWidth: 1,
    borderColor: '#1E2130',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  build: {
    color: '#00C9FF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  notesScroll: {
    flexShrink: 1,
    marginBottom: 16,
  },
  heading: {
    color: '#00C9FF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  bullet: {
    color: '#B8BDD0',
    fontSize: 13,
    lineHeight: 20,
    marginLeft: 8,
  },
  bodyText: {
    color: '#B8BDD0',
    fontSize: 13,
    lineHeight: 20,
  },
  downloadBtn: {
    backgroundColor: '#00C9FF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadBtnText: {
    color: '#000000',
    fontWeight: '800',
    fontSize: 15,
  },
  laterBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  laterBtnText: {
    color: '#6B7280',
    fontSize: 13,
  },
});
