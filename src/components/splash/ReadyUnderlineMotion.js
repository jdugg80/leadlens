import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export default function ReadyUnderlineMotion({ width = 156, style }) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    motion.setValue(0);

    const loop = Animated.loop(
      Animated.timing(motion, {
        toValue: 1,
        duration: 1900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );

    loop.start();
    return () => loop.stop();
  }, [motion]);

  const translateX = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [-70, width + 40],
  });

  return (
    <View style={[styles.wrap, { width }, style]}>
      <View style={styles.leftLine} />
      <View style={styles.rightLine} />
      <Animated.View style={[styles.glowRunner, { transform: [{ translateX }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 5,
    borderRadius: 999,
    overflow: 'hidden',
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  leftLine: {
    flex: 1,
    backgroundColor: 'rgba(255, 23, 68, 0.65)',
  },
  rightLine: {
    flex: 1,
    backgroundColor: 'rgba(0, 140, 255, 0.70)',
  },
  glowRunner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 72,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(235, 242, 255, 0.92)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
