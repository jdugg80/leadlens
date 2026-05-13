import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

const PHASE = {
  IDLE: 'idle',
  LOADING: 'loading',
  FLASH: 'flash',
  ACTIVE: 'active',
};

export default function SplashLoadTile({ label, delay = 0, style }) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const flash = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    const timers = [];

    timers.push(
      setTimeout(() => {
        setPhase(PHASE.LOADING);
      }, delay)
    );

    timers.push(
      setTimeout(() => {
        setPhase(PHASE.FLASH);
        flash.setValue(0);
        scale.setValue(0.98);

        Animated.parallel([
          Animated.sequence([
            Animated.timing(flash, {
              toValue: 1,
              duration: 95,
              useNativeDriver: true,
            }),
            Animated.timing(flash, {
              toValue: 0,
              duration: 145,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.045,
              duration: 95,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1,
              duration: 145,
              useNativeDriver: true,
            }),
          ]),
        ]).start(() => {
          setPhase(PHASE.ACTIVE);
        });
      }, delay + 260)
    );

    return () => timers.forEach(clearTimeout);
  }, [delay, flash, scale]);

  const isLoading = phase === PHASE.LOADING;
  const isFlash = phase === PHASE.FLASH;
  const isActive = phase === PHASE.ACTIVE;

  return (
    <Animated.View
      style={[
        styles.tile,
        isLoading && styles.loadingTile,
        isFlash && styles.flashTile,
        isActive && styles.activeTile,
        { transform: [{ scale }] },
        style,
      ]}
    >
      <Text style={[styles.label, isActive && styles.activeLabel]}>{label}</Text>
      <View style={[styles.statusBar, isLoading && styles.statusBarLoading, isActive && styles.statusBarActive]} />
      <Animated.View pointerEvents="none" style={[styles.flashOverlay, { opacity: flash }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 92,
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(220, 228, 236, 0.15)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    overflow: 'hidden',
  },
  loadingTile: {
    borderColor: 'rgba(0, 140, 255, 0.32)',
    backgroundColor: 'rgba(0, 140, 255, 0.07)',
  },
  flashTile: {
    borderColor: 'rgba(255,255,255,0.95)',
    backgroundColor: 'rgba(255,255,255,0.24)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  activeTile: {
    borderColor: 'rgba(0, 191, 255, 0.78)',
    backgroundColor: 'rgba(0, 191, 255, 0.14)',
    shadowColor: '#00BFFF',
    shadowOpacity: 0.72,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 9,
  },
  label: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  activeLabel: {
    color: '#FFFFFF',
  },
  statusBar: {
    width: 34,
    height: 3,
    borderRadius: 999,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  statusBarLoading: {
    backgroundColor: 'rgba(0, 140, 255, 0.55)',
  },
  statusBarActive: {
    width: 46,
    backgroundColor: '#39FF14',
    shadowColor: '#39FF14',
    shadowOpacity: 0.75,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
});
