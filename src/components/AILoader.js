import { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

export default function AILoader({ message = 'AI is working...' }) {
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const scanY = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Staggered pulsing rings
    const pulse = (anim, delay) => Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    );

    const r1 = pulse(ring1, 0);
    const r2 = pulse(ring2, 400);
    const r3 = pulse(ring3, 800);
    r1.start(); r2.start(); r3.start();

    // Scan line
    const scan = Animated.loop(Animated.sequence([
      Animated.timing(scanY, { toValue: 1, duration: 1800, useNativeDriver: true }),
      Animated.timing(scanY, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    scan.start();

    // Text pulse
    const txt = Animated.loop(Animated.sequence([
      Animated.timing(textOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(textOpacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ]));
    txt.start();

    return () => { r1.stop(); r2.stop(); r3.stop(); scan.stop(); txt.stop(); };
  }, []);

  const SIZE = 120;
  const scanTranslate = scanY.interpolate({ inputRange: [0, 1], outputRange: [-SIZE / 2, SIZE / 2] });

  return (
    <View style={s.root}>
      {/* Pulsing rings */}
      <View style={[s.iconWrap, { width: SIZE, height: SIZE }]}>
        {[ring1, ring2, ring3].map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              s.ring,
              {
                width: SIZE + i * 24,
                height: SIZE + i * 24,
                borderRadius: (SIZE + i * 24) / 2,
                opacity: anim,
                transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) }],
              },
            ]}
          />
        ))}

        {/* Center lens icon */}
        <View style={s.center}>
          <Text style={s.centerIcon}>◎</Text>
        </View>

        {/* Scan line */}
        <View style={[s.scanContainer, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}>
          <Animated.View style={[s.scanLine, { transform: [{ translateY: scanTranslate }] }]} />
        </View>
      </View>

      <Animated.Text style={[s.message, { opacity: textOpacity }]}>
        {message}
      </Animated.Text>

      <Text style={s.subMessage}>This may take a few seconds</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, backgroundColor: COLORS.bg },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  center: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(0,201,255,0.1)',
    borderWidth: 2, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 2,
  },
  centerIcon: { fontSize: 28, color: COLORS.accent },
  scanContainer: {
    position: 'absolute',
    overflow: 'hidden',
    zIndex: 3,
  },
  scanLine: {
    height: 2,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  message: {
    fontSize: 16, fontWeight: '700', color: COLORS.text,
    letterSpacing: 0.5, textAlign: 'center',
  },
  subMessage: { fontSize: 12, color: COLORS.muted },
});
