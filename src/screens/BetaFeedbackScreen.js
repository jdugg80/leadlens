/**
 * BetaFeedbackScreen.js
 * Submits beta feedback directly to Project Scarlett's feedback_reports table
 * Supabase project: dlntgyhfxxbcwwcxaorn
 */

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView,
  Platform, StatusBar, SafeAreaView,
} from 'react-native';
import { COLORS } from '../constants';

// Scarlett Supabase — separate from LeadLens DB
const SCARLETT_URL = 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
const SCARLETT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRsbnRneWhmeHhiY3d3Y3hhb3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyODE5NjQsImV4cCI6MjA5Mzg1Nzk2NH0.sN8lupQFAGGsPr_UuEQGqm9JYMASP8D0wyPfCxIMaAw';

const FEEDBACK_TYPES = [
  { key: 'bug',         label: '🐛  Bug',              color: COLORS.danger },
  { key: 'crash',       label: '💥  Crash',            color: '#FF3B5C' },
  { key: 'ux',          label: '🎨  UX / Design',      color: COLORS.warning },
  { key: 'performance', label: '⚡  Performance',       color: COLORS.accent },
  { key: 'feature',     label: '💡  Feature Suggestion',color: COLORS.success },
  { key: 'other',       label: '📝  General',           color: COLORS.purple },
];

const SEVERITY_OPTIONS = [
  { key: 'low',      label: 'Low',      color: COLORS.success },
  { key: 'medium',   label: 'Medium',   color: COLORS.warning },
  { key: 'high',     label: 'High',     color: COLORS.danger },
  { key: 'critical', label: 'Critical', color: '#FF3B5C' },
];

const RATING_LABELS = ['😤', '😕', '😐', '🙂', '🤩'];

export default function BetaFeedbackScreen({ navigation, route }) {
  // Get tester info from auth context or route params
  const testerEmail = route?.params?.testerEmail || '';
  const testerName  = route?.params?.testerName  || '';
  const inviteCode  = route?.params?.inviteCode  || '';
  const appVersion  = route?.params?.appVersion  || '';

  const [feedbackType,    setFeedbackType]    = useState('');
  const [severity,        setSeverity]        = useState('medium');
  const [screenFeature,   setScreenFeature]   = useState('');
  const [title,           setTitle]           = useState('');
  const [description,     setDescription]     = useState('');
  const [stepsToReproduce,setStepsToReproduce]= useState('');
  const [expectedBehavior,setExpectedBehavior]= useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [sessionRating,   setSessionRating]   = useState(0);
  const [submitting,      setSubmitting]      = useState(false);
  const [submitted,       setSubmitted]       = useState(false);
  const [error,           setError]           = useState('');

  async function submitFeedback() {
    if (!feedbackType) { setError('Please select a feedback type.'); return; }
    if (!description.trim()) { setError('Please describe the issue or feedback.'); return; }

    setError('');
    setSubmitting(true);

    try {
      const payload = {
        feedback_type:    feedbackType,
        severity:         severity,
        screen_feature:   screenFeature.trim() || null,
        title:            title.trim() || null,
        description:      description.trim(),
        steps_to_reproduce: stepsToReproduce.trim() || null,
        expected_behavior:  expectedBehavior.trim() || null,
        additional_notes:   additionalNotes.trim() || null,
        session_rating:     sessionRating > 0 ? sessionRating : null,
        tester_name:        testerName  || null,
        tester_email:       testerEmail || null,
        invite_code:        inviteCode  || null,
        app_version:        appVersion  || null,
        status:             'new',
        submitted_at:       new Date().toISOString(),
      };

      const res = await fetch(`${SCARLETT_URL}/rest/v1/feedback_reports`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SCARLETT_KEY,
          'Authorization': `Bearer ${SCARLETT_KEY}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Submission failed');
      }

      setSubmitted(true);
    } catch (e) {
      console.error('Beta feedback error:', e);
      setError('Failed to submit. Please try again.');
    }

    setSubmitting(false);
  }

  // ── Success screen ──────────────────────────────────────────
  if (submitted) {
    const firstName = (testerName || '').split(' ')[0] || 'friend';
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.successWrap}>
          <Text style={styles.successIcon}>🪙🪙</Text>
          <Text style={styles.successTitle}>Two Cents Deposited, {firstName}.</Text>
          <Text style={styles.successMsg}>
            The O-Kay-est Media team got your feedback loud and clear, {firstName}. Somewhere in Angleton, Texas, a developer just smiled. We'll take it from here — now get back to testing.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>BACK TO WORK →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerEyebrow}>PROJECT SCARLETT</Text>
          <Text style={styles.headerTitle}>Beta Feedback</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >

          {/* Feedback type */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>WHAT TYPE OF FEEDBACK? *</Text>
            <View style={styles.typeGrid}>
              {FEEDBACK_TYPES.map(t => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typeChip, feedbackType === t.key && { borderColor: t.color, backgroundColor: t.color + '20' }]}
                  onPress={() => setFeedbackType(t.key)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, feedbackType === t.key && { color: t.color }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Severity (only for bug/crash/performance) */}
          {['bug', 'crash', 'performance'].includes(feedbackType) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>SEVERITY</Text>
              <View style={styles.severityRow}>
                {SEVERITY_OPTIONS.map(s => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.severityChip, severity === s.key && { borderColor: s.color, backgroundColor: s.color + '20' }]}
                    onPress={() => setSeverity(s.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.severityText, severity === s.key && { color: s.color }]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Screen / Feature */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>SCREEN OR FEATURE</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Territory Map, LeadLock Camera, Export..."
              placeholderTextColor={COLORS.muted}
              value={screenFeature}
              onChangeText={setScreenFeature}
            />
          </View>

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>TITLE</Text>
            <TextInput
              style={styles.input}
              placeholder="Short summary of the issue or idea"
              placeholderTextColor={COLORS.muted}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
            />
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DESCRIPTION *</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Describe what happened or what you'd like to see..."
              placeholderTextColor={COLORS.muted}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
          </View>

          {/* Steps to reproduce (bug/crash only) */}
          {['bug', 'crash'].includes(feedbackType) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>STEPS TO REPRODUCE</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="1. Open the app&#10;2. Navigate to...&#10;3. Tap..."
                placeholderTextColor={COLORS.muted}
                value={stepsToReproduce}
                onChangeText={setStepsToReproduce}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Expected behavior (bug/crash only) */}
          {['bug', 'crash'].includes(feedbackType) && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>EXPECTED BEHAVIOR</Text>
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="What should have happened instead?"
                placeholderTextColor={COLORS.muted}
                value={expectedBehavior}
                onChangeText={setExpectedBehavior}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          )}

          {/* Session rating */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>HOW WAS YOUR SESSION?</Text>
            <View style={styles.ratingRow}>
              {RATING_LABELS.map((emoji, i) => {
                const val = i + 1;
                return (
                  <TouchableOpacity
                    key={val}
                    style={[styles.ratingBtn, sessionRating === val && styles.ratingBtnActive]}
                    onPress={() => setSessionRating(val)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.ratingEmoji}>{emoji}</Text>
                    <Text style={[styles.ratingNum, sessionRating === val && { color: COLORS.accent }]}>{val}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Additional notes */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ANYTHING ELSE?</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder="Any other context, screenshots mentioned, or notes..."
              placeholderTextColor={COLORS.muted}
              value={additionalNotes}
              onChangeText={setAdditionalNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Confidentiality notice */}
          <View style={styles.confidentialBox}>
            <Text style={styles.confidentialText}>
              🔒 This feedback is sent directly and securely to the LeadLens development team.
              All information is treated as confidential under your beta agreement.
            </Text>
          </View>

          {/* Error */}
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠ {error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={submitFeedback}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitBtnText}>SUBMIT FEEDBACK →</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  backBtn: {
    width: 36, height: 36,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: COLORS.chrome,
    fontSize: 16,
    fontWeight: '600',
  },
  headerCenter: { alignItems: 'center' },
  headerEyebrow: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.accent2,
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  // Sections
  section: { marginBottom: 22 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.label,
    marginBottom: 10,
  },

  // Feedback type grid
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.chrome,
  },

  // Severity
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  severityText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.chrome,
  },

  // Inputs
  input: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 14,
  },
  inputMulti: {
    minHeight: 100,
    paddingTop: 12,
  },

  // Rating
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  ratingBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  ratingEmoji: { fontSize: 20, marginBottom: 4 },
  ratingNum: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.muted,
  },

  // Confidential
  confidentialBox: {
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.purple,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  confidentialText: {
    fontSize: 12,
    color: COLORS.textDim,
    lineHeight: 18,
  },

  // Error
  errorBox: {
    backgroundColor: COLORS.accent2Dim,
    borderWidth: 1,
    borderColor: COLORS.accent2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
  },

  // Submit
  submitBtn: {
    backgroundColor: COLORS.accent2,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // Success
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  successIcon: { fontSize: 56, marginBottom: 20 },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 14,
    textAlign: 'center',
  },
  successMsg: {
    fontSize: 15,
    color: COLORS.textDim,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 36,
  },
  doneBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 48,
  },
  doneBtnText: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
