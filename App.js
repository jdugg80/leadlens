import { useRef, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Animated, StyleSheet } from 'react-native';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CaptureScreen from './src/screens/CaptureScreen';
import ManualEntryScreen from './src/screens/ManualEntryScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import ExportScreen from './src/screens/ExportScreen';
import AdminScreen from './src/screens/AdminScreen';

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

  const triggerFlash = useCallback(() => {
    flashAnim.setValue(1);
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

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
          <Stack.Screen name="Splash" component={SplashScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Capture" component={CaptureScreen} />
          <Stack.Screen name="ManualEntry" component={ManualEntryScreen} />
          <Stack.Screen name="Review" component={ReviewScreen} />
          <Stack.Screen name="Export" component={ExportScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
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
