/**
 * FeatureRequestScreen.js — BETA-51
 * - Back button header
 * - "Describe it" field expands to fill available space
 * - Submit button pinned to bottom
 * - 4 randomized Jentris confirmation messages
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { getAppVersionShort } from '../constants';
import useToast from '../hooks/useToast';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true },
});

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
  const insets = useSafeAreaInsets();
  const repEmail = route?.params?.repEmail || 'unknown@leadlens.app';
  const repName = route?.params?.repName || 'there';
  const version = getAppVersionShort();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { showToast } = useToast();

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      showToast('Please fill in a title and describe the feature.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('feature_requests').insert({
        title: title.trim(),
        summary: description.trim(),
        submitted_by: repEmail,
        raw_input: description.trim(),
        source: 'in-app',
        type: 'feature',
        project: 'leadlens',
        status: 'pending',
        update_type: 'rebuild',
        app_version: version,
      });

      if (error) throw error;

      const message = getFeatureConfirmation(repName, title.trim());
      showToast(message, 'success');
      setTimeout(() => navigation.goBack(), 1800);
    } catch (err) {
      console.error('[FeatureRequestScreen] Error:', err);
      showToast(`Submission failed: ${err.message || 'Check your connection and try again.'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safe}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Suggest a Feature</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.body}>
          <Text style={styles.screenSub}>
            What would make LeadLens more useful for you in the field? Every idea gets read by Joe.
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
            textAlignVertical="top"
          />
        </View>

        {/* Submit pinned to bottom */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitBtnText}>Submit Idea</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const C = {
  bg: '#080A0F', border: '#1C2130',
  cyan: '#00C9FF', purple: '#7B3FBE',
  chrome: '#B8BDD0', muted: '#555C6E', white: '#FFFFFF',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 44, alignItems: 'flex-start' },
  backArrow: { fontSize: 32, color: C.cyan, lineHeight: 36 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: C.white },

  screenSub: { fontSize: 14, color: C.chrome, lineHeight: 20, marginBottom: 8 },

  label: {
    fontSize: 12, fontWeight: '600', color: C.chrome,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 18,
  },

  input: {
    backgroundColor: '#0D111A', borderWidth: 1, borderColor: C.border,
    borderRadius: 8, color: C.white, fontSize: 14, paddingHorizontal: 14, paddingVertical: 11,
  },
  inputMulti: { flex: 1, paddingTop: 12, minHeight: 120 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.border },
  submitBtn: {
    backgroundColor: C.purple, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: C.white, letterSpacing: 0.3 },
});