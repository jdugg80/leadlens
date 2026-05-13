import { useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { ThemedAlertHost } from './ThemedAlert';

// ─── SCREEN HEADER ────────────────────────────────────────────────────────────
export function ScreenHeader({ title, badge, onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <View style={s.headerInner}>
        {onBack && (
          <TouchableOpacity style={s.backBtn} onPress={onBack} activeOpacity={0.7}>
            <Text style={s.backArrow}>‹</Text>
          </TouchableOpacity>
        )}
        <Text style={s.title} numberOfLines={1}>{title}</Text>
        {badge ? (
          <View style={s.badgeWrap}>
            <Text style={s.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={s.headerAccentLine}>
        <View style={s.headerAccentLeft} />
        <View style={s.headerAccentRight} />
      </View>
      <ThemedAlertHost />
    </View>
  );
}

// ─── FIELD LABEL ──────────────────────────────────────────────────────────────
export function FieldLabel({ children }) {
  return <Text style={s.label}>{children}</Text>;
}

// ─── FIELD INPUT — lights up with cyan border on focus ────────────────────────
export function FieldInput({ label, style, ...props }) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = (e) => {
    Animated.timing(glowAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    props.onFocus?.(e);
  };
  const handleBlur = (e) => {
    Animated.timing(glowAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    props.onBlur?.(e);
  };

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, COLORS.accent],
  });

  return (
    <View style={s.fieldGroup}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <Animated.View style={[s.inputWrap, { borderColor }]}>
        <TextInput
          style={[s.input, style]}
          placeholderTextColor={COLORS.muted}
          {...props}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
      </Animated.View>
    </View>
  );
}

// ─── PRIMARY BUTTON — chrome body with purple/red accent line ─────────────────
export function PrimaryButton({ title, onPress, disabled, style }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 50 }).start();

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
      <TouchableOpacity
        style={[s.primaryBtn, disabled && s.disabled]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={disabled}
        activeOpacity={0.9}
      >
        <View style={s.primaryBtnSheen} />
        <Text style={s.primaryBtnText}>{title}</Text>
        <View style={s.primaryBtnAccentLine}>
          <View style={s.primaryBtnAccentLeft} />
          <View style={s.primaryBtnAccentRight} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── SECONDARY BUTTON ─────────────────────────────────────────────────────────
export function SecondaryButton({ title, onPress, style, danger }) {
  return (
    <TouchableOpacity
      style={[s.secondaryBtn, danger && s.dangerBtn, style]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.secondaryBtnText, danger && s.dangerText]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── CARD — chrome-edged with corner pip accents ──────────────────────────────
export function Card({ children, style, accent, danger, glow }) {
  const borderColor = danger
    ? 'rgba(255,59,92,0.35)'
    : accent
    ? 'rgba(0,201,255,0.25)'
    : COLORS.border;

  const bgColor = danger
    ? 'rgba(255,59,92,0.04)'
    : accent
    ? 'rgba(0,201,255,0.04)'
    : COLORS.surface;

  return (
    <View style={[s.card, { borderColor, backgroundColor: bgColor }, glow && s.cardGlow, style]}>
      <View style={[s.cornerTL, accent && s.cornerAccent]} />
      <View style={[s.cornerBR, accent && s.cornerAccent]} />
      {children}
    </View>
  );
}

// ─── SECTION LABEL — chrome pip + fade line ───────────────────────────────────
export function SectionLabel({ children }) {
  return (
    <View style={s.sectionLabelRow}>
      <View style={s.sectionPip} />
      <Text style={s.sectionLabel}>{children}</Text>
      <View style={s.sectionLine} />
    </View>
  );
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const color =
    status === 'New'                                     ? COLORS.accent
    : status === 'Contacted' || status === 'In Progress' ? COLORS.purple
    : COLORS.success;

  return (
    <View style={[s.statusBadge, { borderColor: color + '55', backgroundColor: color + '18' }]}>
      <View style={[s.statusDot, { backgroundColor: color }]} />
      <Text style={[s.statusText, { color }]}>{status}</Text>
    </View>
  );
}

// ─── ICON BUTTON — round chrome ring button ───────────────────────────────────
export function IconButton({ icon, onPress, active, color, size = 36 }) {
  const activeColor = color || COLORS.accent;
  return (
    <TouchableOpacity
      style={[
        s.iconBtn,
        { width: size, height: size, borderRadius: size / 2 },
        active && { borderColor: activeColor, backgroundColor: activeColor + '22' },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[s.iconBtnIcon, active && { color: activeColor }]}>{icon}</Text>
    </TouchableOpacity>
  );
}

// ─── DIAL BADGE — rotary instrument style metric ──────────────────────────────
export function DialBadge({ value, label, color, size = 72 }) {
  const c = color || COLORS.accent;
  return (
    <View style={[s.dial, { width: size, height: size, borderRadius: size / 2, borderColor: c + '60' }]}>
      <View style={[s.dialInner, {
        borderColor: c + '30',
        width: size - 10, height: size - 10,
        borderRadius: (size - 10) / 2,
      }]}>
        <Text style={[s.dialValue, { color: c, fontSize: size * 0.28 }]}>{value}</Text>
        {label ? <Text style={[s.dialLabel, { fontSize: size * 0.12 }]}>{label}</Text> : null}
      </View>
    </View>
  );
}

// ─── CHROME DIVIDER — purple/red split ────────────────────────────────────────
export function ChromeDivider() {
  return (
    <View style={s.chromeDivider}>
      <View style={s.chromeDividerLeft} />
      <View style={s.chromeDividerDot} />
      <View style={s.chromeDividerRight} />
    </View>
  );
}

// ─── TAG ──────────────────────────────────────────────────────────────────────
export function Tag({ label, color }) {
  const c = color || COLORS.accent;
  return (
    <View style={[s.tag, { borderColor: c + '50', backgroundColor: c + '15' }]}>
      <Text style={[s.tagText, { color: c }]}>{label}</Text>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({

  // Header
  header: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerAccentLine: { flexDirection: 'row', height: 2 },
  headerAccentLeft:  { flex: 1, backgroundColor: COLORS.purple,  opacity: 0.75 },
  headerAccentRight: { flex: 1, backgroundColor: COLORS.accent2, opacity: 0.75 },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.borderLit,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { color: COLORS.chrome, fontSize: 24, marginTop: -2 },
  title: {
    flex: 1, fontSize: 19, fontWeight: '800',
    color: COLORS.text, letterSpacing: 0.5,
  },
  badgeWrap: {
    backgroundColor: 'rgba(0,201,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.3)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeText: { color: COLORS.accent, fontSize: 10, fontWeight: '700', letterSpacing: 1 },

  // Labels
  label: {
    fontSize: 10, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  fieldGroup: { flex: 1 },

  // Input
  inputWrap: {
    borderWidth: 1, borderRadius: 10,
    backgroundColor: COLORS.surface2, overflow: 'hidden',
  },
  input: {
    paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 15,
  },

  // Primary Button
  primaryBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', overflow: 'hidden',
    shadowColor: COLORS.accent, shadowOpacity: 0.15,
    shadowRadius: 8, elevation: 4,
  },
  primaryBtnSheen: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
    backgroundColor: 'rgba(184,189,208,0.06)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,189,208,0.08)',
  },
  primaryBtnText: {
    color: COLORS.text, fontSize: 14, fontWeight: '800',
    letterSpacing: 2, textTransform: 'uppercase', zIndex: 1,
  },
  primaryBtnAccentLine: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, flexDirection: 'row',
  },
  primaryBtnAccentLeft:  { flex: 1, backgroundColor: COLORS.purple },
  primaryBtnAccentRight: { flex: 1, backgroundColor: COLORS.accent2 },
  disabled: { opacity: 0.38 },

  // Secondary Button
  secondaryBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  dangerBtn: { backgroundColor: 'transparent', borderColor: 'rgba(255,59,92,0.3)' },
  secondaryBtnText: { color: COLORS.textDim, fontSize: 15, fontWeight: '600' },
  dangerText: { color: COLORS.danger },

  // Card
  card: {
    borderWidth: 1, borderRadius: 14, padding: 14,
    position: 'relative', overflow: 'hidden',
  },
  cardGlow: {
    shadowColor: COLORS.accent, shadowOpacity: 0.12,
    shadowRadius: 12, elevation: 4,
  },
  cornerTL: {
    position: 'absolute', top: 0, left: 0, width: 12, height: 12,
    borderTopWidth: 2, borderLeftWidth: 2,
    borderColor: COLORS.borderLit, borderTopLeftRadius: 14,
  },
  cornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
    borderBottomWidth: 2, borderRightWidth: 2,
    borderColor: COLORS.borderLit, borderBottomRightRadius: 14,
  },
  cornerAccent: { borderColor: 'rgba(0,201,255,0.4)' },

  // Section Label
  sectionLabelRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginTop: 18, marginBottom: 10, paddingHorizontal: 2,
  },
  sectionPip: { width: 3, height: 14, borderRadius: 2, backgroundColor: COLORS.purple },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1.8, textTransform: 'uppercase',
  },
  sectionLine: { flex: 1, height: 1, backgroundColor: COLORS.border },

  // Status Badge
  statusBadge: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Icon Button
  iconBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnIcon: { fontSize: 14, color: COLORS.muted },

  // Dial Badge
  dial: {
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface2,
  },
  dialInner: {
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  dialValue: { fontWeight: '800', letterSpacing: 0.5 },
  dialLabel: { color: COLORS.muted, letterSpacing: 1, textTransform: 'uppercase', marginTop: 1 },

  // Chrome Divider
  chromeDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8 },
  chromeDividerLeft:  { flex: 1, height: 1, backgroundColor: COLORS.purple,  opacity: 0.5 },
  chromeDividerDot:   { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.chrome },
  chromeDividerRight: { flex: 1, height: 1, backgroundColor: COLORS.accent2, opacity: 0.5 },

  // Tag
  tag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
});
