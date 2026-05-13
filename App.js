import 'react-native-url-polyfill/auto';
import { configurePushNotifications } from './src/utils/pushNotifications';
configurePushNotifications();

import { useEffect, useRef, useCallback } from 'react';
import { View, Animated, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AppRegistry } from 'react-native';

import { storageBridge as AsyncStorage } from './src/utils/storage';
import { USER_STORAGE_KEY } from './src/constants';
import { bindAutoExportOnAppResume, registerBackgroundAutoExport } from './src/utils/autoExport';
import { processQueue } from './src/utils/taskRunner';
import BetaTracker from './utils/betaTracker';

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
import IntelliVisionReviewScreen  from './src/screens/IntelliVisionReviewScreen';
import IntelliVisionCameraScreen  from './src/screens/IntelliVisionCameraScreen';
import CardGalleryScreen          from './src/screens/CardGalleryScreen';
import TargetMapAdjusterScreen    from './src/screens/TargetMapAdjusterScreen';

WebBrowser.maybeCompleteAuthSession();

const Stack = createNativeStackNavigator();

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

      const rawUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (rawUser) {
        try {
          const user = JSON.parse(rawUser);
          if (user && typeof user === 'object') {
            bindAutoExportOnAppResume(user);
            registerBackgroundAutoExport().catch(() => {});

            // ── Beta tracking: start session with saved user email ──
            if (user.email) {
              await BetaTracker.init();
            }
          }
        } catch (err) {
          console.warn('[App] Could not read saved user profile:', err?.message || String(err));
        }
      } else {
        // No user yet — init anyway (tracker will stay off until register() is called)
        await BetaTracker.init();
      }
    })();

    // ── AppState listener: task queue + beta session tracking ──
    const sub = AppState.addEventListener('change', async (nextState) => {
      const prev = appState.current;
      appState.current = nextState;

      if (nextState === 'active') {
        // App came to foreground
        processQueue().catch(() => {});
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
          <Stack.Screen name="IntelliVisionReview" component={IntelliVisionReviewScreen} />
          <Stack.Screen name="IntelliVisionCamera" component={IntelliVisionCameraScreen} />
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
