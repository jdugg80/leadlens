import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export default function RotatingLensPin({ style }) {
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    rotation.setValue(0);

    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 4200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => loop.stop();
  }, [rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.stage, style]}>
      <Animated.View style={[styles.orbit, { transform: [{ rotate }] }]}>
        <View style={styles.orbitDot} />
      </Animated.View>

      <View style={styles.pin}>
        <View style={styles.pinHead}>
          <View style={styles.lensOuter}>
            <View style={styles.lensInner} />
          </View>
        </View>
        <View style={styles.pinPoint} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: 142,
    height: 132,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  orbit: {
    position: 'absolute',
    top: 10,
    left: 29,
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 1.5,
    borderColor: 'rgba(220, 228, 236, 0.42)',
  },
  orbitDot: {
    position: 'absolute',
    top: -3,
    left: 38,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#DDE6EF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.72,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pin: {
    position: 'absolute',
    top: 16,
    width: 74,
    height: 98,
    alignItems: 'center',
  },
  pinHead: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: 'rgba(10, 14, 20, 0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(220, 228, 236, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#9AC7FF',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
    zIndex: 2,
  },
  pinPoint: {
    width: 30,
    height: 30,
    backgroundColor: 'rgba(10, 14, 20, 0.95)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(220, 228, 236, 0.62)',
    transform: [{ rotate: '45deg' }],
    marginTop: -22,
    zIndex: 1,
  },
  lensOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#00BFFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 140, 255, 0.10)',
  },
  lensInner: {
    width: 15,
    height: 15,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#00BFFF',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
});
