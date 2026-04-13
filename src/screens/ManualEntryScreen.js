import { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  TextInput, Animated, PermissionsAndroid,
} from 'react-native';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader, PrimaryButton } from '../components/UI';

export default function ManualEntryScreen({ navigation, route }) {
  const { user } = route.params;
  const [lead, setLead] = useState({ ...EMPTY_LEAD });
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceField, setVoiceField] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef(null);

  const update = (key, val) => setLead(p => ({ ...p, [key]: val }));

  const goReview = () =>
    navigation.navigate('Review', { user, lead: { ...lead, captureMethod: 'manual' }, editIdx: null });

  const startVoice = async (fieldKey, fieldLabel) => {
    // Request mic permission automatically
    try {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
          title: 'Microphone Access',
          message: 'LeadLens needs microphone access for voice input.',
          buttonPositive: 'Allow',
        });
      }
    } catch {}
    setVoiceField({ key: fieldKey, label: fieldLabel });
    setVoiceMode(true);
    pulseLoop.current = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.25, duration: 700, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    pulseLoop.current.start();
  };

  const stopVoice = () => {
    setVoiceMode(false);
    setVoiceField(null);
    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
  };

  if (voiceMode) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="Voice Entry" onBack={stopVoice} />
        <View style={s.voiceWrap}>
          <Text style={s.voiceFieldLabel}>Field: {voiceField?.label}</Text>
          <Animated.View style={[s.micCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={s.micIcon}>🎤</Text>
          </Animated.View>
          <Text style={s.voiceHint}>
            Tap the mic on your keyboard to speak.{'\n'}Your words will appear in the field below.
          </Text>
          <TextInput
            style={s.voiceInput}
            placeholder={`Say the ${voiceField?.label?.toLowerCase()}...`}
            placeholderTextColor={COLORS.muted}
            value={lead[voiceField?.key] || ''}
            onChangeText={v => voiceField && update(voiceField.key, v)}
            autoFocus
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={s.voiceDoneBtn} onPress={stopVoice}>
            <Text style={s.voiceDoneBtnText}>Done ✔</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="Manual Entry" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        <View style={s.voiceTip}>
          <Text style={s.voiceTipText}>💡 Tap 🎤 beside any label to use voice input</Text>
        </View>

        <Text style={s.sectionLabel}>Business Info</Text>
        <View style={s.card}>
          <VF label="Business Name" placeholder="Acme Corp"
            value={lead.businessName} onChangeText={v => update('businessName', v)}
            onVoice={() => startVoice('businessName', 'Business Name')} />
          <View style={[s.row, { marginTop: 10 }]}>
            <View style={{ flex: 1 }}>
              <VF label="First Name" placeholder="Jane"
                value={lead.pocFirst} onChangeText={v => update('pocFirst', v)}
                onVoice={() => startVoice('pocFirst', 'First Name')} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ flex: 1 }}>
              <VF label="Last Name" placeholder="Smith"
                value={lead.pocLast} onChangeText={v => update('pocLast', v)}
                onVoice={() => startVoice('pocLast', 'Last Name')} />
            </View>
          </View>
        </View>

        <Text style={s.sectionLabel}>Contact</Text>
        <View style={s.card}>
          <VF label="Phone" placeholder="(555) 555-5555" keyboardType="phone-pad"
            value={lead.phone} onChangeText={v => update('phone', v)}
            onVoice={() => startVoice('phone', 'Phone Number')} />
          <View style={{ marginTop: 10 }}>
            <VF label="Email" placeholder="contact@biz.com" keyboardType="email-address" autoCapitalize="none"
              value={lead.email} onChangeText={v => update('email', v)}
              onVoice={() => startVoice('email', 'Email Address')} />
          </View>
        </View>

        <Text style={s.sectionLabel}>Address</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={{ width: 80 }}>
              <VF label="St #" placeholder="123"
                value={lead.streetNumber} onChangeText={v => update('streetNumber', v)}
                onVoice={() => startVoice('streetNumber', 'Street Number')} />
            </View>
            <View style={{ width: 10 }} />
            <VF label="Street Name" placeholder="Main St"
              value={lead.streetName} onChangeText={v => update('streetName', v)}
              onVoice={() => startVoice('streetName', 'Street Name')} />
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            <VF label="City" placeholder="Houston"
              value={lead.city} onChangeText={v => update('city', v)}
              onVoice={() => startVoice('city', 'City')} />
            <View style={{ width: 10 }} />
            <View style={{ width: 60 }}>
              <VF label="State" placeholder="TX" maxLength={2} autoCapitalize="characters"
                value={lead.state} onChangeText={v => update('state', v.toUpperCase())}
                onVoice={() => startVoice('state', 'State')} />
            </View>
            <View style={{ width: 10 }} />
            <View style={{ width: 80 }}>
              <VF label="ZIP" placeholder="77001" keyboardType="numeric"
                value={lead.zip} onChangeText={v => update('zip', v)}
                onVoice={() => startVoice('zip', 'ZIP')} />
            </View>
          </View>
        </View>

        <PrimaryButton title="Review Lead →" onPress={goReview} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VF({ label, onVoice, ...props }) {
  return (
    <View style={{ flex: props.style?.flex }}>
      <View style={vfs.labelRow}>
        <Text style={vfs.label}>{label}</Text>
        <TouchableOpacity onPress={onVoice} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={vfs.mic}>🎤</Text>
        </TouchableOpacity>
      </View>
      <TextInput style={vfs.input} placeholderTextColor={COLORS.muted} {...props} />
    </View>
  );
}

const vfs = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 11, fontWeight: '700', color: COLORS.label, letterSpacing: 1, textTransform: 'uppercase' },
  mic: { fontSize: 13 },
  input: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 15,
  },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 14,
  },
  row: { flexDirection: 'row' },
  voiceTip: {
    backgroundColor: 'rgba(0,201,255,0.06)', borderWidth: 1, borderColor: 'rgba(0,201,255,0.2)',
    borderRadius: 10, padding: 10, marginTop: 14,
  },
  voiceTipText: { fontSize: 12, color: COLORS.accent },
  voiceWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  voiceFieldLabel: { fontSize: 13, color: COLORS.muted },
  micCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(0,201,255,0.1)', borderWidth: 2, borderColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  micIcon: { fontSize: 40 },
  voiceHint: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 20 },
  voiceInput: {
    width: '100%', minHeight: 80,
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.accent,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: COLORS.text, fontSize: 16, textAlignVertical: 'top',
  },
  voiceDoneBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40,
  },
  voiceDoneBtnText: { color: '#000', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
});
