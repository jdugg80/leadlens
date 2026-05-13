import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import {
  APP_VERSION,
  COLORS,
  LEGAL_ACCEPTANCE_KEY,
  PRIVACY_POLICY_VERSION,
  SUPABASE_SETTINGS_KEY,
  TERMS_VERSION,
  USER_STORAGE_KEY,
} from '../constants';
import { createSupabaseClient } from '../utils/supabaseClient';

const { width: SW } = Dimensions.get('window');
const ICON_SIZE = Math.min(SW * 0.76, 330);
const PANEL_WIDTH = Math.min(SW * 0.9, 390);
const PANEL_PADDING = 14;
const TILE_GAP = 10;
const TILE_WIDTH = (PANEL_WIDTH - PANEL_PADDING * 2 - TILE_GAP * 2) / 3;

const iconSource = require('../../assets/leadlens/LeadLens_app_icon.png');
const TILE_CONFIG = [
  { key: 'scan', title: 'SCAN', label: 'Capture', color: COLORS.purple },
  { key: 'map', title: 'MAP', label: 'Territory', color: COLORS.accent },
  { key: 'export', title: 'EXPORT', label: 'Queue', color: COLORS.accent2 },
];
const CONSOLE_READY_TEXT = 'LeadLens Console Initialized';

function makeTarget(name, params) {
  return { name, params };
}

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[SplashScreen] Ignoring invalid stored JSON:', err?.message || String(err));
    return fallback;
  }
}

function hasAcceptedLegal(rawLegal) {
  const parsed = safeParseJson(rawLegal, null);
  return parsed?.privacyVersion === PRIVACY_POLICY_VERSION && parsed?.termsVersion === TERMS_VERSION;
}

function hasCompleteProfile(savedUser) {
  return !!(
    savedUser?.role &&
    savedUser?.firstName &&
    savedUser?.lastName
  );
}

function chooseStartupTarget(savedUser, legalAccepted) {
  if (hasCompleteProfile(savedUser)) {
    return makeTarget(legalAccepted ? 'Dashboard' : 'Consent', { user: savedUser });
  }

  // Fresh installs / cleared app data should go to Login first.
  // Consent is shown after a usable profile exists, which avoids userless legal routing crashes.
  return makeTarget('Login');
}

export default function SplashScreen({ navigation }) {
  const [startupTarget, setStartupTarget] = useState(null);
  const [statusText, setStatusText] = useState('Focusing lens');
  const [consoleText, setConsoleText] = useState('');
  const [tileStates, setTileStates] = useState(['STANDBY', 'STANDBY', 'STANDBY']);
  const [continueReady, setContinueReady] = useState(false);

  const mountedRef = useRef(true);
  const timersRef = useRef([]);

  const rootOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0.72)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const lensSpin = useRef(new Animated.Value(0)).current;
  const lensFocus = useRef(new Animated.Value(0)).current;
  const circuitOpacity = useRef(new Animated.Value(0)).current;
  const tipPulse = useRef(new Animated.Value(0)).current;
  const dashboardOpacity = useRef(new Animated.Value(0)).current;
  const dashboardY = useRef(new Animated.Value(26)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerDotPulse = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineLift = useRef(new Animated.Value(10)).current;
  const continueOpacity = useRef(new Animated.Value(0)).current;
  const continuePulse = useRef(new Animated.Value(0)).current;
  const tileCharge = useRef(TILE_CONFIG.map(() => new Animated.Value(0))).current;
  const tileFlash = useRef(TILE_CONFIG.map(() => new Animated.Value(0))).current;

  const spin = lensSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const focusScale = lensFocus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const tipScale = tipPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 1.35, 0.65] });
  const tipOpacity = tipPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0.45] });
  const orbitOpacity = circuitOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] });
  const dotScale = headerDotPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const dotOpacity = headerDotPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const continueScale = continuePulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });
  const continueGlowOpacity = continuePulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.78] });
  const continuePurpleOpacity = continuePulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.58] });
  const continueRedOpacity = continuePulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.66] });

  const registerTimer = (id) => {
    timersRef.current.push(id);
    return id;
  };

  const sleep = (ms) =>
    new Promise((resolve) => {
      const id = setTimeout(resolve, ms);
      registerTimer(id);
    });

  const animate = (animation) =>
    new Promise((resolve) => {
      animation.start(() => resolve(true));
    });

  const setTileState = (index, value) => {
    setTileStates((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const typeConsoleText = async (text, speed = 34) => {
    setConsoleText('');
    for (let i = 1; i <= text.length; i += 1) {
      if (!mountedRef.current) return;
      setConsoleText(text.slice(0, i));
      // eslint-disable-next-line no-await-in-loop
      await sleep(speed);
    }
  };

  useEffect(() => {
    let subscription;

    async function resolveStartupTarget() {
      console.log('AUTH_BOOT_START');
      try {
        const [rawUser, rawLegal, rawSupa] = await Promise.all([
          AsyncStorage.getItem(USER_STORAGE_KEY),
          AsyncStorage.getItem(LEGAL_ACCEPTANCE_KEY),
          AsyncStorage.getItem(SUPABASE_SETTINGS_KEY),
        ]);

        const savedUser = safeParseJson(rawUser, null);
        const legalAccepted = hasAcceptedLegal(rawLegal);
        const supabaseSettings = safeParseJson(rawSupa, {});
        const fallbackTarget = chooseStartupTarget(savedUser, legalAccepted);
        const supabase = createSupabaseClient(supabaseSettings || {});

        if (supabase) {
          const sessionResult = await Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 4500)),
          ]).catch((err) => {
            console.warn('[SplashScreen] Supabase getSession failed or timed out:', err?.message || String(err));
            return { data: { session: null }, error: err };
          });

          const { data, error } = sessionResult || {};

          if (data?.session) {
            console.log('AUTH_BOOT_SESSION_FOUND');
            if (!mountedRef.current) return;
            setStartupTarget(fallbackTarget);
            return;
          } else {
             console.log('AUTH_BOOT_NO_SESSION', error?.message || 'none');
          }

          const { data: authStateData } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Splash auth state change', { event, sessionExists: !!session });
            if (!session || !mountedRef.current) return;
            setStartupTarget(fallbackTarget);
          });
          subscription = authStateData?.subscription;
        } else {
           console.log('AUTH_BOOT_NO_SUPABASE_CLIENT');
        }

        if (!mountedRef.current) return;
        setStartupTarget(fallbackTarget);
      } catch (err) {
        console.error('AUTH_BOOT_ERROR', err?.message || String(err));
        if (mountedRef.current) setStartupTarget(makeTarget('Login'));
      }
    }

    resolveStartupTarget();

    return () => {
      if (subscription?.unsubscribe) subscription.unsubscribe();
      else if (typeof subscription === 'function') subscription();
    };
  }, []);

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(lensSpin, {
        toValue: 1,
        duration: 1800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { resetBeforeIteration: true },
    );

    spinLoop.start();

    return () => {
      spinLoop.stop();
    };
  }, []);

  useEffect(() => {
    let dotLoop;
    let continueLoop;

    async function runSequence() {
      await animate(
        Animated.parallel([
          Animated.timing(rootOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
          Animated.spring(iconScale, { toValue: 1, tension: 42, friction: 8, useNativeDriver: true }),
          Animated.timing(iconOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
        ]),
      );

      await sleep(140);
      if (!mountedRef.current) return;

      setStatusText('Focusing lens');
      await animate(
        Animated.timing(lensFocus, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      );

      if (!mountedRef.current) return;
      setStatusText('Energizing circuits');
      await animate(
        Animated.timing(circuitOpacity, {
          toValue: 1,
          duration: 680,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      );

      if (!mountedRef.current) return;
      setStatusText('Powering pin');
      await animate(
        Animated.sequence([
          Animated.timing(tipPulse, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(tipPulse, {
            toValue: 0.35,
            duration: 380,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );

      if (!mountedRef.current) return;
      setStatusText('Bringing systems online');
      await animate(
        Animated.parallel([
          Animated.timing(dashboardOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
          Animated.spring(dashboardY, { toValue: 0, tension: 42, friction: 8, useNativeDriver: true }),
        ]),
      );

      for (let i = 0; i < tileCharge.length; i += 1) {
        if (!mountedRef.current) return;
        setTileState(i, 'BOOTING');
        // eslint-disable-next-line no-await-in-loop
        await animate(
          Animated.timing(tileCharge[i], {
            toValue: 1,
            duration: 550,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
        );
        if (!mountedRef.current) return;
        setTileState(i, 'ONLINE');
        // eslint-disable-next-line no-await-in-loop
        await animate(
          Animated.sequence([
            Animated.timing(tileFlash[i], {
              toValue: 1,
              duration: 120,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
            Animated.timing(tileFlash[i], {
              toValue: 0,
              duration: 400,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }),
          ]),
        );
        // eslint-disable-next-line no-await-in-loop
        await sleep(100);
      }

      if (!mountedRef.current) return;
      setStatusText('Initializing Console');
      await animate(Animated.timing(headerOpacity, { toValue: 1, duration: 220, useNativeDriver: true }));

      dotLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(headerDotPulse, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(headerDotPulse, {
            toValue: 0,
            duration: 700,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      dotLoop.start();

      await typeConsoleText(CONSOLE_READY_TEXT, 30);
      if (!mountedRef.current) return;

      setStatusText('Ready when you are');
      await animate(Animated.timing(continueOpacity, { toValue: 1, duration: 350, useNativeDriver: true }));

      continueLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(continuePulse, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(continuePulse, {
            toValue: 0,
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      );
      continueLoop.start();

      if (!mountedRef.current) return;
      setContinueReady(true);
      await sleep(650);
      if (!mountedRef.current) return;
      await animate(
        Animated.parallel([
          Animated.timing(taglineOpacity, {
            toValue: 1,
            duration: 920,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(taglineLift, {
            toValue: 0,
            duration: 920,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
    }

    runSequence();

    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      if (dotLoop) dotLoop.stop();
      if (continueLoop) continueLoop.stop();
    };
  }, []);

  const skip = () => {
    const target = startupTarget || makeTarget('Login');
    if (!startupTarget) setStatusText('Finalizing startup');
    navigation.replace(target.name, target.params);
  };

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]}> 
      <View style={styles.centerArea}>
        <Animated.View style={[styles.iconWrap, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}> 
          <Image source={iconSource} style={styles.icon} resizeMode="contain" />

          <View style={styles.lensOrbitBase} />
          <Animated.View style={[styles.lensOrbitArc, { opacity: orbitOpacity, transform: [{ scale: focusScale }, { rotate: spin }] }]} />
          <Animated.View style={[styles.lensOrbitDotTrack, { opacity: orbitOpacity, transform: [{ rotate: spin }] }]}> 
            <View style={styles.lensOrbitDot} />
          </Animated.View>

          <Animated.View style={[styles.tipGlow, { opacity: tipOpacity, transform: [{ scale: tipScale }] }]} />
        </Animated.View>

        <View style={styles.statusWrap}>
          <Text style={styles.statusKicker}>LEADLENS</Text>
          <Text style={styles.statusText}>{statusText}</Text>
          <View style={styles.statusLine}>
            <View style={styles.statusLineLeft} />
            <View style={styles.statusLineRight} />
          </View>
        </View>

        <Animated.View style={[styles.dashboardPreview, { opacity: dashboardOpacity, transform: [{ translateY: dashboardY }] }]}> 
          <Animated.View style={[styles.previewHeader, { opacity: headerOpacity }]}> 
            <Animated.View style={[styles.previewLogoDot, { opacity: dotOpacity, transform: [{ scale: dotScale }] }]} />
            <Text style={styles.previewTitle}>{consoleText || ' '}</Text>
          </Animated.View>

          <View style={styles.previewStatsRow}>
            {TILE_CONFIG.map((tile, index) => {
              const cardOpacity = tileCharge[index].interpolate({ inputRange: [0, 1], outputRange: [0.42, 1] });
              const cardScale = tileCharge[index].interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });
              const chargeWidth = tileCharge[index].interpolate({ inputRange: [0, 1], outputRange: [0, TILE_WIDTH - 16] });
              const glowOpacity = tileCharge[index].interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.08, 0.28, 0.36] });
              const flashOpacity = tileFlash[index].interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] });
              const flashScale = tileFlash[index].interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.15, 1.05] });

              return (
                <Animated.View
                  key={tile.key}
                  style={[
                    styles.previewStat,
                    {
                      opacity: cardOpacity,
                      transform: [{ scale: cardScale }],
                    },
                  ]}
                >
                  <Animated.View style={[styles.previewStatGlow, { opacity: glowOpacity }]} />
                  <Animated.View
                    style={[
                      styles.previewStatFlash,
                      {
                        backgroundColor: tile.color,
                        opacity: flashOpacity,
                        transform: [{ scale: flashScale }],
                      },
                    ]}
                  />
                  <Text style={styles.previewNum}>{tile.title}</Text>
                  <Text style={styles.previewLabel}>{tile.label}</Text>
                  <Text style={[styles.previewStateText, tileStates[index] === 'ONLINE' ? styles.previewStateOnline : null]}>
                    {tileStates[index]}
                  </Text>
                  <View style={styles.chargeTrack}>
                    <Animated.View style={[styles.chargeFill, { width: chargeWidth, backgroundColor: tile.color, shadowColor: tile.color }]} />
                  </View>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>
      </View>

      <Animated.View style={[styles.skipWrap, { opacity: continueOpacity }]}> 
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineLift }] }]}> 
          <Text style={styles.taglinePurple}>THE FUTURE </Text>
          <Text style={styles.taglineChrome}>OF FIELD </Text>
          <Text style={styles.taglineRed}>PROSPECTING</Text>
        </Animated.Text>

        <Animated.View style={[styles.continuePulseWrap, { transform: [{ scale: continueScale }] }]}> 
          <Animated.View style={[styles.continueGlowBase, { opacity: continueGlowOpacity }]} />
          <Animated.View style={[styles.continueGlowPurple, { opacity: continuePurpleOpacity }]} />
          <Animated.View style={[styles.continueGlowRed, { opacity: continueRedOpacity }]} />
          <TouchableOpacity
            style={[styles.skipBtn, !continueReady && styles.skipBtnDisabled]}
            onPress={skip}
            activeOpacity={0.9}
            disabled={!continueReady}
          >
            <Text style={styles.skipText}>CONTINUE</Text>
            <Text style={styles.skipArrow}>›</Text>
          </TouchableOpacity>
        </Animated.View>
        <Text style={styles.version}>v{APP_VERSION}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#02030A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  centerArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 72,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  logoCircuitField: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  logoTraceGroup: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
  },
  logoTraceLeft: {
    position: 'absolute',
    left: ICON_SIZE * 0.11,
    height: 2.5,
    borderRadius: 99,
    backgroundColor: 'rgba(140,90,255,0.9)',
    shadowColor: COLORS.purple,
    shadowOpacity: 1,
    shadowRadius: 9,
  },
  logoTraceRight: {
    position: 'absolute',
    right: ICON_SIZE * 0.11,
    height: 2.5,
    borderRadius: 99,
    backgroundColor: 'rgba(255,74,120,0.9)',
    shadowColor: COLORS.accent2,
    shadowOpacity: 1,
    shadowRadius: 9,
  },
  logoTraceNodeLeft: {
    position: 'absolute',
    top: -2.25,
    width: 7,
    height: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.purple,
    backgroundColor: '#170022',
  },
  logoTraceNodeRight: {
    position: 'absolute',
    top: -2.25,
    width: 7,
    height: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: COLORS.accent2,
    backgroundColor: '#22000A',
  },
  logoTraceSignalLeft: {
    position: 'absolute',
    top: -1.75,
    left: ICON_SIZE * 0.11,
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#D2B5FF',
    shadowColor: COLORS.purple,
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  logoTraceSignalRight: {
    position: 'absolute',
    top: -1.75,
    right: ICON_SIZE * 0.11,
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#FFB0C4',
    shadowColor: COLORS.accent2,
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  lensOrbitBase: {
    position: 'absolute',
    top: ICON_SIZE * 0.25,
    left: ICON_SIZE * 0.4075,
    width: ICON_SIZE * 0.185,
    height: ICON_SIZE * 0.185,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  lensOrbitArc: {
    position: 'absolute',
    top: ICON_SIZE * 0.25,
    left: ICON_SIZE * 0.4075,
    width: ICON_SIZE * 0.185,
    height: ICON_SIZE * 0.185,
    borderRadius: 999,
    borderWidth: 1.6,
    borderTopColor: COLORS.chrome,
    borderRightColor: COLORS.accent2,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    borderLeftColor: COLORS.purple,
  },
  lensOrbitDotTrack: {
    position: 'absolute',
    top: ICON_SIZE * 0.25,
    left: ICON_SIZE * 0.4075,
    width: ICON_SIZE * 0.185,
    height: ICON_SIZE * 0.185,
    borderRadius: 999,
    alignItems: 'center',
  },
  lensOrbitDot: {
    position: 'absolute',
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  tipGlow: {
    position: 'absolute',
    bottom: ICON_SIZE * 0.055,
    width: ICON_SIZE * 0.22,
    height: ICON_SIZE * 0.22,
    borderRadius: ICON_SIZE,
    backgroundColor: 'rgba(255,0,180,0.42)',
    shadowColor: '#FF37E6',
    shadowOpacity: 1,
    shadowRadius: 26,
  },
  statusWrap: {
    alignItems: 'center',
    marginTop: 24,
  },
  statusKicker: {
    color: COLORS.label,
    fontSize: 11,
    letterSpacing: 4,
    fontWeight: '800',
  },
  statusText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 6,
  },
  statusLine: {
    marginTop: 12,
    width: 180,
    height: 2,
    flexDirection: 'row',
    borderRadius: 100,
    overflow: 'hidden',
  },
  statusLineLeft: { flex: 1, backgroundColor: COLORS.purple },
  statusLineRight: { flex: 1, backgroundColor: COLORS.accent2 },
  dashboardPreview: {
    width: PANEL_WIDTH,
    marginTop: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    backgroundColor: 'rgba(14,16,24,0.76)',
    padding: PANEL_PADDING,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 9,
    minHeight: 24,
  },
  previewLogoDot: {
    width: 10,
    height: 10,
    borderRadius: 99,
    backgroundColor: COLORS.success,
    shadowColor: COLORS.success,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  previewTitle: {
    flex: 1,
    color: COLORS.text,
    fontWeight: '900',
    fontSize: 15,
  },
  previewStatsRow: {
    flexDirection: 'row',
    gap: TILE_GAP,
  },
  previewStat: {
    position: 'relative',
    flex: 1,
    minHeight: 94,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 14,
  },
  previewStatGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  previewStatFlash: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: -12,
    bottom: -12,
    borderRadius: 22,
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 10,
  },
  previewNum: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '900',
  },
  previewLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 4,
  },
  previewStateText: {
    marginTop: 5,
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  previewStateOnline: {
    color: COLORS.success,
  },
  chargeTrack: {
    marginTop: 8,
    width: TILE_WIDTH - 16,
    height: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  chargeFill: {
    height: 4,
    borderRadius: 99,
    shadowOpacity: 0.95,
    shadowRadius: 8,
  },
  skipWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
  },
  tagline: {
    marginBottom: 14,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  taglinePurple: { color: COLORS.purple },
  taglineChrome: { color: COLORS.chrome },
  taglineRed: { color: COLORS.accent2 },
  continuePulseWrap: {
    width: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueGlowBase: {
    position: 'absolute',
    width: 220,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  continueGlowPurple: {
    position: 'absolute',
    left: 0,
    width: 140,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(123,63,190,0.32)',
  },
  continueGlowRed: {
    position: 'absolute',
    right: 0,
    width: 140,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(204,16,64,0.30)',
  },
  skipBtn: {
    width: 220,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    backgroundColor: 'rgba(10,12,20,0.92)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  skipBtnDisabled: {
    opacity: 0.7,
  },
  skipText: {
    color: COLORS.text,
    fontWeight: '900',
    letterSpacing: 1.4,
    fontSize: 14,
  },
  skipArrow: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: -1,
  },
  version: {
    marginTop: 10,
    color: COLORS.label,
    fontSize: 11,
    letterSpacing: 1,
  },
});
