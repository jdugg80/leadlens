import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, EMPTY_LEAD } from '../constants';
import { ScreenHeader } from '../components/UI';
import { extractLeadFromImage } from '../utils/claudeApi';

export default function CaptureScreen({ navigation, route }) {
  const { user } = route.params;
  const [processing, setProcessing] = useState(false);

  const openCamera = async (quality) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Camera permission required'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality, base64: false });
    if (!result.canceled) await handleAsset(result.assets[0]);
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Photo library permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, base64: false });
    if (!result.canceled) await handleAsset(result.assets[0]);
  };

  const handleAsset = async (asset) => {
    setProcessing(true);
    try {
      const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = ['image/jpeg','image/png','image/gif','image/webp'].includes((asset.mimeType||'').toLowerCase()) ? asset.mimeType : 'image/jpeg';
      const extracted = await extractLeadFromImage(b64, mime);
      navigation.navigate('Review', { user, lead: { ...EMPTY_LEAD, ...extracted, captureMethod: 'image', imageUri: asset.uri }, editIdx: null });
    } catch (err) {
      Alert.alert('Extraction issue', err.message || 'Could not read image.');
      navigation.navigate('Review', { user, lead: { ...EMPTY_LEAD, captureMethod: 'image', imageUri: asset.uri }, editIdx: null });
    } finally { setProcessing(false); }
  };

  if (processing) return (
    <View style={[s.root, { justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={{ color: COLORS.muted, fontSize: 13 }}>AI is reading the image...</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <ScreenHeader title="Capture Lead" onBack={() => navigation.goBack()} />
      <View style={s.wrap}>
        <Text style={s.label}>CHOOSE CAPTURE METHOD</Text>
        <TouchableOpacity style={s.btn} onPress={() => openCamera(0.65)} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(0,201,255,0.12)' }]}><Text style={s.iconText}>💳</Text></View>
          <View style={s.txt}><Text style={s.title}>Business Card / ID</Text><Text style={s.sub}>Opens camera — hold card steady and shoot</Text></View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={() => openCamera(0.8)} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(255,107,43,0.12)' }]}><Text style={s.iconText}>🏪</Text></View>
          <View style={s.txt}><Text style={s.title}>Storefront / Sign</Text><Text style={s.sub}>Opens camera — step back and capture the sign</Text></View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btn} onPress={openGallery} activeOpacity={0.75}>
          <View style={[s.icon, { backgroundColor: 'rgba(0,229,160,0.12)' }]}><Text style={s.iconText}>🖼️</Text></View>
          <View style={s.txt}><Text style={s.title}>Gallery / Screenshot</Text><Text style={s.sub}>Import a saved photo or screenshot</Text></View>
          <Text style={s.arrow}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0F14' },
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  label: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12, marginTop: 16 },
  btn: { backgroundColor: '#13161E', borderWidth: 1, borderColor: '#252A38', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  icon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 26 },
  txt: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: '#E8EAF0' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  arrow: { fontSize: 22, color: '#6B7280' },
});
