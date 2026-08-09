import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import ThemedToast from '../components/ThemedToast';
import useThemedToast from '../hooks/useThemedToast';

// ─── Design Palette ───────────────────────────────────────────────────────────
const PALETTE = {
  bg: '#080A0F',
  surface: '#0E1117',
  border: 'rgba(184,189,208,0.15)',
  cyan: '#00C9FF',
  purple: '#7B3FBE',
  text: '#B8BDD0',
  textDim: '#6B7280',
  white: '#FFFFFF',
  inputBg: '#12161E',
  error: '#FF4D6A',
};

// ─── Topic options ────────────────────────────────────────────────────────────
const TOPICS = [
  { label: 'General Inquiry', value: 'general' },
  { label: 'Billing & Subscriptions', value: 'billing' },
  { label: 'Bug Report', value: 'bug' },
  { label: 'Feature Request', value: 'feature' },
  { label: 'Account Issues', value: 'account' },
];

const INITIAL_FORM = {
  name: '',
  email: '',
  topic: '',
  message: '',
};

export default function SupportScreen({ navigation, route }) {
  const user = route?.params?.user || null;
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const { toastProps, showToast } = useThemedToast();

  const emailRef = useRef(null);
  const messageRef = useRef(null);

  // ─── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const newErrors = {};
    if (!form.name.trim()) newErrors.name = 'Name is required.';
    if (!form.email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      newErrors.email = 'Enter a valid email address.';
    }
    if (!form.topic) newErrors.topic = 'Please select a topic.';
    if (!form.message.trim()) {
      newErrors.message = 'Message cannot be empty.';
    } else if (form.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      // Simulate an API call
      await new Promise((resolve, reject) =>
        setTimeout(() => {
          // Simulate occasional failure for demo purposes:
          // Math.random() < 0.3 ? reject(new Error('Network error')) : resolve();
          resolve();
        }, 1500)
      );
      setForm(INITIAL_FORM);
      setErrors({});
      showToast("Your message has been sent! We'll get back to you soon.", 'success');
    } catch (err) {
      showToast('Failed to send message. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* ThemedToast sits at the top of the root so it renders above everything */}
      <ThemedToast {...toastProps} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Text style={styles.heading}>Support</Text>
          <Text style={styles.subheading}>
            Report bugs, suggest features, or contact our team directly.
          </Text>

          {/* Quick Actions */}
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => navigation.navigate('BugReportScreen', {
                repEmail: user?.email || user?.user_metadata?.email || '',
                repName: user?.user_metadata?.repName || user?.user_metadata?.full_name || '',
              })}
              activeOpacity={0.8}
            >
              <Text style={styles.navBtnIcon}>🐛</Text>
              <View style={styles.navBtnText}>
                <Text style={styles.navBtnLabel}>Report a Bug</Text>
                <Text style={styles.navBtnHint}>Crashes, broken features, unexpected behavior</Text>
              </View>
              <Text style={styles.navBtnChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnPurple]}
              onPress={() => navigation.navigate('FeatureRequestScreen', {
                repEmail: user?.email || user?.user_metadata?.email || '',
                repName: user?.user_metadata?.repName || user?.user_metadata?.full_name || '',
              })}
              activeOpacity={0.8}
            >
              <Text style={styles.navBtnIcon}>💡</Text>
              <View style={styles.navBtnText}>
                <Text style={styles.navBtnLabel}>Suggest a Feature</Text>
                <Text style={styles.navBtnHint}>Ideas to make LeadLens work better for you</Text>
              </View>
              <Text style={styles.navBtnChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Contact Form */}
          <Text style={styles.sectionLabel}>OR CONTACT US DIRECTLY</Text>

          {/* Name */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="Jane Doe"
              placeholderTextColor={PALETTE.textDim}
              value={form.name}
              onChangeText={(v) => setField('name', v)}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              autoCorrect={false}
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
          </View>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              ref={emailRef}
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="jane@example.com"
              placeholderTextColor={PALETTE.textDim}
              value={form.email}
              onChangeText={(v) => setField('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => messageRef.current?.focus()}
            />
            {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
          </View>

          {/* Topic selector */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Topic</Text>
            <View style={styles.topicsRow}>
              {TOPICS.map((t) => {
                const selected = form.topic === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    style={[
                      styles.topicChip,
                      selected && styles.topicChipSelected,
                    ]}
                    onPress={() => setField('topic', t.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text
                      style={[
                        styles.topicChipText,
                        selected && styles.topicChipTextSelected,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {errors.topic ? <Text style={styles.errorText}>{errors.topic}</Text> : null}
          </View>

          {/* Message */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              ref={messageRef}
              style={[styles.input, styles.textArea, errors.message && styles.inputError]}
              placeholder="Describe your issue in detail…"
              placeholderTextColor={PALETTE.textDim}
              value={form.message}
              onChangeText={(v) => setField('message', v)}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              returnKeyType="default"
            />
            {errors.message ? <Text style={styles.errorText}>{errors.message}</Text> : null}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Submit support request"
          >
            {submitting ? (
              <ActivityIndicator color={PALETTE.white} />
            ) : (
              <Text style={styles.submitText}>Send Message</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PALETTE.bg,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: PALETTE.white,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  subheading: {
    fontSize: 14,
    color: PALETTE.text,
    marginBottom: 24,
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: PALETTE.textDim,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  navRow: {
    gap: 10,
    marginBottom: 20,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.cyan,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  navBtnPurple: {
    borderColor: PALETTE.purple,
  },
  navBtnIcon: {
    fontSize: 22,
  },
  navBtnText: {
    flex: 1,
  },
  navBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.white,
    marginBottom: 2,
  },
  navBtnHint: {
    fontSize: 12,
    color: PALETTE.textDim,
    lineHeight: 16,
  },
  navBtnChevron: {
    fontSize: 22,
    color: PALETTE.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: PALETTE.border,
    marginBottom: 20,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: PALETTE.text,
    marginBottom: 8,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: PALETTE.inputBg,
    borderWidth: 1,
    borderColor: PALETTE.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    color: PALETTE.white,
    fontSize: 15,
  },
  inputError: {
    borderColor: PALETTE.error,
  },
  textArea: {
    height: 120,
    paddingTop: 12,
  },
  errorText: {
    color: PALETTE.error,
    fontSize: 12,
    marginTop: 5,
    fontWeight: '500',
  },
  topicsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topicChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.inputBg,
    marginBottom: 4,
  },
  topicChipSelected: {
    borderColor: PALETTE.cyan,
    backgroundColor: 'rgba(0,201,255,0.10)',
  },
  topicChipText: {
    color: PALETTE.textDim,
    fontSize: 13,
    fontWeight: '500',
  },
  topicChipTextSelected: {
    color: PALETTE.cyan,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    // Gradient-like effect using cyan-to-purple via overlay trick
    backgroundColor: PALETTE.cyan,
    shadowColor: PALETTE.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: PALETTE.bg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
