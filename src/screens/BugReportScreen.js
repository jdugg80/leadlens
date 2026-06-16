/**
 * BugReportScreen.js — BETA-47
 *
 * Dedicated bug report screen navigated to from SupportScreen.
 * - Subject + details fields
 * - Up to 5 screenshots/photos (expo-image-picker)
 * - 1 screen recording up to 30 seconds (expo-image-picker video)
 * - Submit → send-support-ticket Edge Function
 * - 4 randomized personalized confirmation messages featuring Jentris
 *
 * Rules:
 *   - NO Modal components (interfere with Android camera)
 *   - Permissions via permissionManager.js
 *   - No direct MMKV or AsyncStorage usage
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { requestPermission } from '../utils/permissionManager';

const SUPABASE_URL = 'https://qkbvwryucaakkkqaqvka.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrYnZ3cnl1Y2Fha2trcWFxdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODIyNzUsImV4cCI6MjA5MTk1ODI3NX0.Mfi0ca1Ea_tdJlknL-8XKY2MwZpDAnzExco3saLc5RU';

const MAX_PHOTOS = 5;
const MAX_VIDEO_SECS = 30;

function getAppMeta() {
  const version =
    Constants.expoConfig?.version || Constants.manifest?.version || '—';
  const build =
    Constants.expoConfig?.extra?.betaBuild ||
    Constants.manifest?.extra?.betaBuild ||
    Constants.expoConfig?.android?.versionCode ||
    '—';
  return { version, build };
}

// ── Confirmation message variants ────────────────────────────────────────────
function getBugConfirmation(repName, repEmail, ticketId) {
  const name = repName || 'there';
  const id = ticketId || '—';
  const variants = [
    `Got it, ${name}. Jentris — Joe's AI assistant — is already on your report and will make sure Joe knows about it. We'll follow up at ${repEmail} if we need more details. Ticket #${id}`,
    `Report received, ${name}. Jentris has eyes on it and will flag Joe right away. Hang tight — we'll reach out at ${repEmail} if we need anything else. Ticket #${id}`,
    `Thanks for flagging that, ${name}. Jentris is reviewing your report now and will loop Joe in. We know bugs in the field are frustrating — we're on it. Ticket #${id}`,
    `You're good, ${name}. Jentris picked up your report and Joe will be in the loop shortly. If we need more details we'll hit you at ${repEmail}. Ticket #${id}`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

export default function BugReportScreen({ navigation, route }) {
  const repEmail = route?.params?.repEmail || 'unknown@leadlens.app';
  const repName = route?.params?.repName || 'there';
  const { version, build } = getAppMeta();

  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Pick photos ──────────────────────────────────────────────────────────
  const pickPhotos = async () => {
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      Alert.alert('Limit reached', `You can attach up to ${MAX_PHOTOS} screenshots.`);
      return;
    }
    const granted = await requestPermission('mediaLibrary');
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.length) {
      const next = result.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `screenshot_${Date.now()}_${i}.jpg`,
      }));
      setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
    }
  };

  // ── Pick video ───────────────────────────────────────────────────────────
  const pickVideo = async () => {
    if (video) {
      Alert.alert('Video already attached', 'Remove the current recording before attaching a new one.');
      return;
    }
    const granted = await requestPermission('mediaLibrary');
    if (!granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsMultipleSelection: false,
      videoMaxDuration: MAX_VIDEO_SECS,
    });

    if (!result.canceled && result.assets?.[0]) {
      const a = result.assets[0];
      if (a.duration && a.duration > MAX_VIDEO_SECS * 1000) {
        Alert.alert('Video too long', `Please attach a recording under ${MAX_VIDEO_SECS} seconds.`);
        return;
      }
      setVideo({ uri: a.uri, name: a.fileName || `recording_${Date.now()}.mp4` });
    }
  };

  const removePhoto = (idx) => setPhotos((prev) => prev.filter((_, i) => i !== idx));
  const removeVideo = () => setVideo(null);

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!subject.trim() || !details.trim()) {
      Alert.alert('Missing info', 'Please fill in the subject and describe the issue.');
      return;
    }
    setSubmitting(true);
    try {
      const repEmail = route?.params?.repEmail || 'unknown@leadlens.app';
      const repName = route?.params?.repName || 'there';

      console.log('[BugReport] Submitting:', { repEmail, repName, subject, details });

      const response = await fetch(`${SUPABASE_URL}/functions/v1/send-support-ticket`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({
    repEmail,
    repName,
    issueType: 'bug',
    subject: subject.trim(),
    details: details.trim(),
    appVersion: version,
    build: String(build),
    platform: Platform.OS,
    attachmentCount: photos.length + (video ? 1 : 0),
  }),
});

const data = await response.json();
if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);

      const message = getBugConfirmation(repName, repEmail, data.ticketId);
      Alert.alert('Report sent', message, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      console.error('[BugReportScreen] Error:', err);
      Alert.alert('Submission failed', err.message || 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>Report a Bug</Text>
      <Text style={styles.screenSub}>
        Describe the issue. Attach screenshots or a short recording to help us reproduce it.
      </Text>

      <Text style={styles.label}>Subject</Text>
      <TextInput
        style={styles.input}
        placeholder="Brief description of the issue"
        placeholderTextColor="#555C6E"
        value={subject}
        onChangeText={setSubject}
        maxLength={120}
      />

      <Text style={styles.label}>What happened?</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholder="Steps to reproduce, what you expected vs what actually occurred…"
        placeholderTextColor="#555C6E"
        value={details}
        onChangeText={setDetails}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />

      <Text style={styles.label}>
        Screenshots / Photos{' '}
        <Text style={styles.labelHint}>({photos.length}/{MAX_PHOTOS})</Text>
      </Text>
      <View style={styles.photoStrip}>
        {photos.map((p, i) => (
          <View key={i} style={styles.thumbWrapper}>
            <Image source={{ uri: p.uri }} style={styles.thumb} resizeMode="cover" />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(i)}>
              <Text style={styles.thumbRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < MAX_PHOTOS && (
          <TouchableOpacity style={styles.thumbAdd} onPress={pickPhotos}>
            <Text style={styles.thumbAddIcon}>📷</Text>
            <Text style={styles.thumbAddLabel}>
              {photos.length === 0 ? 'Add photos' : 'Add more'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.label}>Screen Recording</Text>
      {video ? (
        <View style={styles.videoAttached}>
          <Text style={styles.videoIcon}>🎥</Text>
          <Text style={styles.videoName} numberOfLines={1}>{video.name}</Text>
          <TouchableOpacity onPress={removeVideo} style={styles.videoRemove}>
            <Text style={styles.videoRemoveText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.videoPickBtn} onPress={pickVideo}>
          <Text style={styles.videoPickIcon}>🎬</Text>
          <Text style={styles.videoPickLabel}>Attach recording (up to 30 sec)</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#080A0F" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Send Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const C = {
  bg: '#080A0F',
  surface: '#10141C',
  border: '#1C2130',
  cyan: '#00C9FF',
  red: '#CC1040',
  chrome: '#B8BDD0',
  muted: '#555C6E',
  white: '#FFFFFF',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60 },

  screenTitle: { fontSize: 24, fontWeight: '700', color: C.white, marginBottom: 6 },
  screenSub: { fontSize: 14, color: C.chrome, lineHeight: 20, marginBottom: 28 },

  label: {
    fontSize: 12, fontWeight: '600', color: C.chrome,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 18,
  },
  labelHint: { fontWeight: '400', color: C.muted, textTransform: 'none', letterSpacing: 0 },

  input: {
    backgroundColor: '#0D111A', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, color: C.white, fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  inputMulti: { minHeight: 120, paddingTop: 12 },

  photoStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrapper: { width: 76, height: 76, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  thumb: { width: 76, height: 76 },
  thumbRemove: {
    position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
  },
  thumbRemoveText: { color: C.white, fontSize: 10, fontWeight: '700' },
  thumbAdd: {
    width: 76, height: 76, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0D111A',
  },
  thumbAddIcon: { fontSize: 20, marginBottom: 2 },
  thumbAddLabel: { fontSize: 9, color: C.muted, textAlign: 'center' },

  videoPickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1,
    borderColor: C.border, borderStyle: 'dashed', borderRadius: 8,
    paddingVertical: 14, paddingHorizontal: 14, backgroundColor: '#0D111A',
  },
  videoPickIcon: { fontSize: 20 },
  videoPickLabel: { fontSize: 13, color: C.muted },
  videoAttached: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0D111A',
    borderWidth: 1, borderColor: C.cyan, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 14,
  },
  videoIcon: { fontSize: 20 },
  videoName: { flex: 1, fontSize: 13, color: C.white },
  videoRemove: { paddingHorizontal: 6, paddingVertical: 4 },
  videoRemoveText: { fontSize: 12, color: C.red, fontWeight: '600' },

  submitBtn: {
    marginTop: 28, backgroundColor: C.cyan, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#080A0F', letterSpacing: 0.3 },
});
