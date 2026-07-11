import React, { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Animated } from 'react-native';
import { useProcessing } from '../context/ProcessingContext';

export default function ProcessingOverlay() {
  const { isProcessing, processingMessage } = useProcessing();
  const opacity = useRef(new Animated.Value(0)).current;
  const renderedRef = useRef(false);

  useEffect(() => {
    if (isProcessing) {
      renderedRef.current = true;
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else if (renderedRef.current) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        renderedRef.current = false;
      });
    }
  }, [isProcessing, opacity]);

  if (!isProcessing && !renderedRef.current) return null;

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      pointerEvents={isProcessing ? 'auto' : 'none'}
    >
      <View style={styles.card}>
        <ActivityIndicator size="large" color="#00C9FF" />
        {processingMessage ? (
          <Text style={styles.message}>{processingMessage}</Text>
        ) : (
          <Text style={styles.message}>Processing...</Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,15,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
    elevation: 9998,
  },
  card: {
    backgroundColor: '#14161C',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252A3A',
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  message: {
    color: '#B8BDD0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
