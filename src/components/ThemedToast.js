import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const C = {
  bg: '#080A0F',
  surface: '#111318',
  border: '#252A3A',
  cyan: '#00C9FF',
  purple: '#7B3FBE',
  red: '#CC1040',
  chrome: '#B8BDD0',
  white: '#FFFFFF',
};

const AUTO_HIDE_MS = 5000;

export default function ThemedToast({
  visible,
  message,
  type = 'success',
  onDismiss,
  duration = AUTO_HIDE_MS,
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runHideAnimation = useCallback((cb) => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (cb) cb();
    });
  }, [clearTimer, opacity, translateY]);

  const dismiss = useCallback(() => {
    runHideAnimation(() => {
      setRendered(false);
      if (onDismiss) onDismiss();
    });
  }, [runHideAnimation, onDismiss]);

  useEffect(() => {
    if (!visible) return;
    setRendered(true);
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
    timerRef.current = setTimeout(() => {
      dismiss();
    }, duration);
    return () => clearTimer();
  }, [visible, duration, dismiss, clearTimer, opacity, translateY]);

  useEffect(() => {
    if (visible || !rendered) return;
    runHideAnimation(() => {
      setRendered(false);
      if (onDismiss) onDismiss();
    });
  }, [visible, rendered, runHideAnimation, onDismiss]);

  if (!rendered) return null;

  const isError = type === 'error';
  const accentColor = isError ? C.red : C.cyan;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.toast,
          {
            borderColor: accentColor,
            transform: [{ translateY }],
            opacity,
          },
        ]}
      >
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        <View style={styles.content}>
          <Text style={styles.message} numberOfLines={3}>
            {message}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={dismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.dismissText, { color: accentColor }]}>✕</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    elevation: 999,
    pointerEvents: 'box-none',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: Platform.OS === 'ios' ? 6 : 16,
    minHeight: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  message: {
    color: C.chrome,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  dismissBtn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
