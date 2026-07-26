import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  Dimensions,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PALETTE = {
  background: '#080A0F',
  cyan: '#00C9FF',
  purple: '#7B3FBE',
  text: '#B8BDD0',
  successBorder: '#00C9FF',
  errorBorder: '#7B3FBE',
  successIcon: '#00C9FF',
  errorIcon: '#7B3FBE',
  white: '#FFFFFF',
  overlay: 'rgba(8,10,15,0.85)',
};

const AUTO_DISMISS_MS = 2500;

/**
 * ThemedToast
 *
 * Props:
 *   visible   {boolean}  – controls visibility
 *   message   {string}   – toast body text
 *   variant   {'success'|'error'}  – controls accent colour
 *   onDismiss {function} – called when toast hides (auto or manual)
 */
export default function ThemedToast({ visible, message, variant = 'success', onDismiss }) {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  const accentColor = variant === 'error' ? PALETTE.errorBorder : PALETTE.successBorder;
  const iconLabel = variant === 'error' ? '✕' : '✓';

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -120,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (onDismiss) onDismiss();
    });
  }, [onDismiss, translateY, opacity]);

  const show = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      timerRef.current = setTimeout(() => {
        hide();
      }, AUTO_DISMISS_MS);
    });
  }, [translateY, opacity, hide]);

  useEffect(() => {
    if (visible) {
      show();
    } else {
      // Reset silently when parent sets visible=false externally
      translateY.setValue(-120);
      opacity.setValue(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
          borderLeftColor: accentColor,
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Accent glow strip */}
      <View style={[styles.glowStrip, { backgroundColor: accentColor }]} />

      {/* Icon badge */}
      <View style={[styles.iconBadge, { borderColor: accentColor }]}>
        <Text style={[styles.iconText, { color: accentColor }]}>{iconLabel}</Text>
      </View>

      {/* Message */}
      <Text style={styles.message} numberOfLines={3}>
        {message}
      </Text>

      {/* Dismiss button */}
      <TouchableOpacity
        onPress={hide}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={styles.closeButton}
        accessibilityLabel="Dismiss notification"
        accessibilityRole="button"
      >
        <Text style={[styles.closeText, { color: PALETTE.text }]}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 36,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.background,
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    maxWidth: SCREEN_WIDTH - 32,
    // Subtle inner border
    borderWidth: 1,
    borderColor: 'rgba(184,189,208,0.12)',
  },
  glowStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    opacity: 0.9,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  iconText: {
    fontSize: 13,
    fontWeight: '700',
  },
  message: {
    flex: 1,
    color: PALETTE.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  closeButton: {
    marginLeft: 8,
    flexShrink: 0,
  },
  closeText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
