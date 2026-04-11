import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader, FieldInput, PrimaryButton } from '../components/UI';
import { extractLeadFromImage } from '../utils/claudeApi';

export default function CaptureScreen({ navigation, route }) {
  const { user, mode: initialMode } = route.params;
  const [mode, setMode] = useState(initialMode); // 'image' | 'manual' | null
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('Analyzing image...');
  const [imageUri, setImageUri] = useState(null);
  const [lead, setLead] = useState({ ...EMPTY_LEAD });

  const update = (key, val) => setLead((p) => ({ ...p, [key]: val }));

  const pickImage = async (fromCamera) => {
    let result;
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Camera permission required'); return; }
      result = await ImagePicker.launchCameraAsync({ quality: 0.85, base64: true });
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Photo library permission required'); return; }
      result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, base64: true, mediaTypes: ImagePicker.MediaTypeOptions.Images });
    }

    if (result.canceled) return;

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setLoading(true);
    setLoadingMsg('Scanning with AI...');

    try {
      // Get base64 - prefer from picker, else read from file
      let b64 = asset.base64;
      if (!b64) {
        const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        b64 = raw;
      }
      const mime = asset.mimeType || 'image/jpeg';
      const extracted = await extractLeadFromImage(b64, mime);
      const merged = { ...EMPTY_LEAD, ...extracted, captureMethod: 'image', imageUri: asset.uri };
      navigation.navigate('Review', { user, lead: merged, editIdx: null });
    } catch (err) {
      Alert.alert('Extraction issue', 'Could not fully read the image. Fill in what\'s missing on the next screen.');
      navigation.navigate('Review', { user, lead: { ...EMPTY_LEAD, captureMethod: 'image', imageUri: asset.uri }, editIdx: null });
    } finally {
      setLoading(false);
    }
  };

  const goManualReview = () => {
    navigation.navigate('Review', { user, lead: { ...lead, captureMethod: 'manual' }, editIdx: null });
  };

  if (loading) {
    return (
      <View style={s.root}>
        <ScreenHeader title="Capture" onBack={() => navigation.goBack()} />
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={s.loadingText}>{loadingMsg}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScreenHeader title="New Prospect" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">

        {/* Image capture options */}
        <Text style={s.sectionLabel}>Image Source</Text>
        {[
          { label: 'Take Photo', sub: 'Business card or storefront', icon: '📷', cam: true },
          { label: 'Choose from Gallery', sub: 'Saved photo or screenshot', icon: '🖼️', cam: false },
        ].map(({ label, sub, icon, cam }) => (
          <TouchableOpacity key={label} style={s.captureBtn} onPress={() => pickImage(cam)} activeOpacity={0.7}>
            <View style={[s.capIcon, { backgroundColor: 'rgba(0,201,255,0.15)' }]}>
              <Text style={{ fontSize: 22 }}>{icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.capLabel}>{label}</Text>
              <Text style={s.capSub}>{sub}</Text>
            </View>
            <Text style={s.capArrow}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Divider */}
        <View style={s.dividerRow}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or enter manually</Text>
          <View style={s.dividerLine} />
        </View>

        {/* Manual form */}
        <Text style={s.sectionLabel}>Manual Entry</Text>
        <View style={s.formGroup}>
          <FieldInput label="Business Name" placeholder="Acme Corp"
            value={lead.businessName} onChangeText={(v) => update('businessName', v)} />
        </View>
        <View style={s.row}>
          <FieldInput label="First Name" placeholder="Jane"
            value={lead.pocFirst} onChangeText={(v) => update('pocFirst', v)} />
          <View style={{ width: 10 }} />
          <FieldInput label="Last Name" placeholder="Smith"
            value={lead.pocLast} onChangeText={(v) => update('pocLast', v)} />
        </View>
        <View style={[s.formGroup, { marginTop: 10 }]}>
          <FieldInput label="Phone" placeholder="(555) 555-5555" keyboardType="phone-pad"
            value={lead.phone} onChangeText={(v) => update('phone', v)} />
        </View>
        <View style={[s.formGroup, { marginTop: 10 }]}>
          <FieldInput label="Email" placeholder="contact@biz.com" keyboardType="email-address" autoCapitalize="none"
            value={lead.email} onChangeText={(v) => update('email', v)} />
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <View style={{ width: 80 }}>
            <FieldInput label="St #" placeholder="123"
              value={lead.streetNumber} onChangeText={(v) => update('streetNumber', v)} />
          </View>
          <View style={{ width: 10 }} />
          <FieldInput label="Street Name" placeholder="Main St"
            value={lead.streetName} onChangeText={(v) => update('streetName', v)} />
        </View>
        <View style={[s.row, { marginTop: 10 }]}>
          <FieldInput label="City" placeholder="Houston"
            value={lead.city} onChangeText={(v) => update('city', v)} />
          <View style={{ width: 10 }} />
          <View style={{ width: 60 }}>
            <FieldInput label="State" placeholder="TX" maxLength={2} autoCapitalize="characters"
              value={lead.state} onChangeText={(v) => update('state', v.toUpperCase())} />
          </View>
          <View style={{ width: 10 }} />
          <View style={{ width: 80 }}>
            <FieldInput label="ZIP" placeholder="77001" keyboardType="numeric"
              value={lead.zip} onChangeText={(v) => update('zip', v)} />
          </View>
        </View>

        <PrimaryButton title="Review Lead →" onPress={goManualReview} style={{ marginTop: 20 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: COLORS.muted, fontSize: 13 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: COLORS.muted,
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 16,
  },
  captureBtn: {
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 8,
  },
  capIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  capLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  capSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  capArrow: { fontSize: 22, color: COLORS.muted },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { fontSize: 12, color: COLORS.muted },
  formGroup: {},
  row: { flexDirection: 'row', marginTop: 0 },
});
