import { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Animated, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, USER_STORAGE_KEY } from '../constants';

const { width: SW, height: SH } = Dimensions.get('window');

export default function SplashScreen({ navigation }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const btnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo fade in
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      // Button fades in after logo
      Animated.timing(btnAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleEnter = async () => {
    const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.repName && saved.employeeNum && saved.branchNum) {
        navigation.replace('Dashboard', { user: saved });
        return;
      }
    }
    navigation.replace('Login');
  };

  return (
    <View style={s.root}>
      {/* Background glow effects */}
      <View style={s.glowTL} />
      <View style={s.glowBR} />

      {/* Logo */}
      <Animated.View style={[s.logoWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <Image source={require('../../assets/logo.jpg')} style={s.logo} resizeMode="contain" />
        <Text style={s.tagline}>Field Prospecting · AI-Powered</Text>
        <View style={s.divider} />
        <Text style={s.subTagline}>Scan. Capture. Export.</Text>
      </Animated.View>

      {/* Enter button */}
      <Animated.View style={[s.btnWrap, { opacity: btnAnim }]}>
        <TouchableOpacity style={s.enterBtn} onPress={handleEnter} activeOpacity={0.85}>
          <Text style={s.enterBtnText}>TAP TO ENTER</Text>
          <Text style={s.enterBtnArrow}>→</Text>
        </TouchableOpacity>
        <Text style={s.version}>v1.0 · LeadLens</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  glowTL: {
    position: 'absolute', top: -100, left: -100,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(0,201,255,0.06)',
  },
  glowBR: {
    position: 'absolute', bottom: -80, right: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(255,107,43,0.05)',
  },
  logoWrap: { alignItems: 'center', gap: 14 },
  logo: { width: SW * 0.75, height: SW * 0.38 },
  tagline: { fontSize: 13, color: COLORS.muted, letterSpacing: 1.5, textTransform: 'uppercase' },
  divider: { width: 40, height: 1, backgroundColor: COLORS.border },
  subTagline: { fontSize: 11, color: COLORS.muted, letterSpacing: 2, textTransform: 'uppercase' },
  btnWrap: {
    position: 'absolute', bottom: 80,
    alignItems: 'center', gap: 16, width: '100%', paddingHorizontal: 32,
  },
  enterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingVertical: 16, width: '100%',
    shadowColor: COLORS.accent, shadowOpacity: 0.4, shadowRadius: 20, elevation: 8,
  },
  enterBtnText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  enterBtnArrow: { color: '#000', fontSize: 18, fontWeight: '900' },
  version: { fontSize: 11, color: COLORS.muted, letterSpacing: 0.5 },
});
