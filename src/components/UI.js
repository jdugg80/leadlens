import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../constants';

export function ScreenHeader({ title, badge, onBack }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      {onBack && (
        <TouchableOpacity style={s.backBtn} onPress={onBack}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      )}
      <Text style={s.title}>{title}</Text>
      {badge ? <Text style={s.badge}>{badge}</Text> : null}
    </View>
  );
}

export function FieldLabel({ children }) {
  return <Text style={s.label}>{children}</Text>;
}

export function FieldInput({ label, style, ...props }) {
  return (
    <View style={s.fieldGroup}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        style={[s.input, style]}
        placeholderTextColor={COLORS.muted}
        {...props}
      />
    </View>
  );
}

export function PrimaryButton({ title, onPress, disabled, style }) {
  return (
    <TouchableOpacity
      style={[s.primaryBtn, disabled && s.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <Text style={s.primaryBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function SecondaryButton({ title, onPress, style, danger }) {
  return (
    <TouchableOpacity
      style={[s.secondaryBtn, danger && s.dangerBtn, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[s.secondaryBtnText, danger && s.dangerText]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style, accent }) {
  return (
    <View style={[s.card, accent && s.cardAccent, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

export function StatusBadge({ status }) {
  const color =
    status === 'New' ? COLORS.accent
    : status === 'Contacted' || status === 'In Progress' ? COLORS.accent2
    : COLORS.success;
  return (
    <View style={[s.statusBadge, { borderColor: color + '44', backgroundColor: color + '18' }]}>
      <Text style={[s.statusText, { color }]}>{status}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    height: 56,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { color: COLORS.text, fontSize: 22, marginTop: -2 },
  title: {
    flex: 1,
    fontFamily: 'System',
    fontSize: 20, fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  badge: {
    backgroundColor: 'rgba(0,201,255,0.12)',
    color: COLORS.accent,
    borderWidth: 1, borderColor: 'rgba(0,201,255,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    fontSize: 11, fontWeight: '600',
  },
  label: {
    fontSize: 11, fontWeight: '600',
    color: COLORS.label,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  fieldGroup: { flex: 1 },
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  primaryBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 17, fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  disabled: { opacity: 0.45 },
  secondaryBtn: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerBtn: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,59,92,0.3)',
  },
  secondaryBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  dangerText: { color: COLORS.danger },
  card: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  cardAccent: {
    backgroundColor: 'rgba(0,201,255,0.04)',
    borderColor: 'rgba(0,201,255,0.2)',
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '600',
    color: COLORS.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10, marginTop: 16,
  },
  statusBadge: {
    borderWidth: 1, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
});
