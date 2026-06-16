/**
 * FeatureRequestScreen.js — BETA-47
 *
 * Dedicated feature request screen navigated to from SupportScreen.
 * - Title + description fields
 * - Submit → feature_requests table (update_type: 'rebuild')
 * - 4 randomized personalized confirmation messages featuring Jentris
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
  Platform,
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const SUPABASE_URL = 'https://qkbvwryucaakkkqaqvka.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrYnZ3cnl1Y2Fha2trcWFxdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzODIyNzUsImV4cCI6MjA5MTk1ODI3NX0.Mfi0ca1Ea_tdJlknL-8XKY2MwZpDAnzExco3saLc5RU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});

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
function getFeatureConfirmation(repName, featureTitle) {
  const name = repName || 'there';
  const title = featureTitle || 'your idea';
  const variants = [
    `Thanks ${name}, '${title}' is logged and Jentris is on it! She'll review your idea and make sure Joe sees it. Reps who speak up like this are the reason LeadLens keeps getting better.`,
    `Idea received, ${name}! Jentris is already looking at '${title}' and will pass it along to Joe. Your feedback is what shapes this app.`,
    `Love it, ${name}. '${title}' is in the queue and Jentris will make sure it lands on Joe's radar. Keep the ideas coming — every one gets read.`,
    `Got your idea, ${name}! Jentris is on it — she'll review '${title}' and bring it to Joe's attention. Reps like you are why this app keeps getting better.`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

export default function FeatureRequestScreen({ navigation, route }) {
  const repEmail = route?.params?.repEmail || 'unknown@leadlens.app';
  const repName = route?.params?.repName || 'there';
  const { version } = getAppMeta();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing info', 'Please fill in a title and describe the feature.');
      return;
    }
    setSubmitting(true);
    try {
      const repEmail = route?.params?.repEmail || 'unknown@leadlens.app';
      const repName = route?.params?.repName || 'there';

      const { error } = await supabase.from('feature_requests').insert({
        title: title.trim(),
        summary: description.trim(),
        submitted_by: repEmail,
        raw_input: description.trim(),
        source: 'in-app',
        type: 'feature',
        project: 'Leadlens',
        status: 'pending',
        update_type: 'rebuild',
        app_version: version,
  });

      if (error) throw error;

      const message = getFeatureConfirmation(repName, title.trim());
      Alert.alert('Idea submitted', message, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      console.error('[FeatureRequestScreen] Error:', err);
      Alert.alert('Submission failed', err.message || 'Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.screenTitle}>Suggest a Feature</Text>
      <Text style={styles.screenSub}>
        What would make LeadLens more useful for you in the field? Every idea
        gets read by Joe.
      </Text>

      <Text style={styles.label}>Feature title</Text>
      <TextInput
        style={styles.input}
        placeholder="Short, clear name for the feature"
        placeholderTextColor="#555C6E"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
      />

      <Text style={styles.label}>Describe it</Text>
      <TextInput
        style={[styles.input, styles.inputMulti]}
        placeholder="What should it do? Why would it help you sell more?"
        placeholderTextColor="#555C6E"
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={6}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
        onPress={submit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.submitBtnText}>Submit Idea</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const C = {
  bg: '#080A0F',
  border: '#1C2130',
  purple: '#7B3FBE',
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

  input: {
    backgroundColor: '#0D111A', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, color: C.white, fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  inputMulti: { minHeight: 140, paddingTop: 12 },

  submitBtn: {
    marginTop: 28, backgroundColor: C.purple, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: C.white, letterSpacing: 0.3 },
});
