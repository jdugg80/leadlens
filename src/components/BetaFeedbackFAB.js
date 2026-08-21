/**
 * BetaFeedbackFAB.js
 * Floating action button with smart positioning that:
 * 1. Moves above the keyboard when active
 * 2. Avoids overlapping protected UI zones
 * 3. Is draggable by the user
 * 4. Auto-resets to smart default after 3 seconds of inactivity
 *
 * Usage in App.js (inside NavigationContainer):
 *   <BetaFeedbackFAB
 *     testerEmail={user?.repEmail || ''}
 *     testerName={user?.repName || ''}
 *     appVersion={getAppVersionString()}
 *   />
 */

import React, { useRef } from 'react';
import {
  TouchableOpacity, StyleSheet, Animated, Text,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import useFeedbackButtonPosition from '../hooks/useFeedbackButtonPosition';

export default function BetaFeedbackFAB({ testerEmail = '', testerName = '', inviteCode = '', appVersion = '' }) {
  const navigation = useNavigation();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const { position, panHandlers, isDragging } = useFeedbackButtonPosition();

  function handlePress() {
    if (isDragging) return;
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: false }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 80, useNativeDriver: false }),
    ]).start();

    navigation.navigate('BetaFeedback', {
      testerEmail,
      testerName,
      inviteCode,
      appVersion,
    });
  }

  return (
    <Animated.View
      style={[
        styles.fab,
        {
          transform: [
            { translateX: position.x },
            { translateY: position.y },
            { scale: scaleAnim },
          ],
        },
      ]}
      {...panHandlers}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.fabInner}
      >
        <Text style={styles.fabIcon}>💬</Text>
        <Text style={styles.fabLabel}>BETA</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    width: 58,
    height: 58,
    zIndex: 9999,
    elevation: 10,
    shadowColor: COLORS.accent2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
  fabInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.accent2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  fabIcon: {
    fontSize: 20,
    lineHeight: 24,
  },
  fabLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#fff',
    marginTop: 1,
  },
});
