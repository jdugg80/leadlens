import React, { useEffect, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { COLORS } from '../constants';
import {
  applyTemplate,
  buildTemplateContext,
  getIntroTemplates,
  getReviewTemplates,
} from '../utils/templateSettings';
import {
  sendReviewEmail,
  sendReviewSms,
  getTcpaConsent,
  setTcpaConsent,
  canSendEmail,
  canSendSms,
  getOutreachSettings,
  OUTREACH_CHANNELS,
} from '../utils/outreachService';
import { showThemedAlert } from './ThemedAlert';

const TEMPLATE_SETS = {
  intro: { label: 'Intro', key: 'intro' },
  review: { label: 'Free Review Offer', key: 'review' },
};

export default function ProspectOutreachModal({
  visible,
  prospect,
  user,
  onClose,
  onSent,
  defaultTemplateSet = 'review',
}) {
  const [templateSet, setTemplateSet] = useState(defaultTemplateSet);
  const [introTemplates, setIntroTemplates] = useState(null);
  const [reviewTemplates, setReviewTemplates] = useState(null);
  const [consent, setConsent] = useState(null);
  const [settings, setSettings] = useState(null);
  const [sending, setSending] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    (async () => {
      const [intro, review, tcpa, opts] = await Promise.all([
        getIntroTemplates(),
        getReviewTemplates(),
        getTcpaConsent(),
        getOutreachSettings(),
      ]);
      setIntroTemplates(intro);
      setReviewTemplates(review);
      setConsent(tcpa);
      setSettings(opts);
      setLoading(false);
    })();
  }, [visible]);

  const templates = templateSet === 'intro' ? introTemplates : reviewTemplates;
  const context = prospect && templates ? buildTemplateContext(prospect, user) : null;

  const emailSubject = templates ? applyTemplate(templates.emailSubject, context) : '';
  const emailBody = templates ? applyTemplate(templates.emailBody, context) : '';
  const smsBody = templates ? applyTemplate(templates.smsBody, context) : '';

  const emailCheck = prospect ? canSendEmail(prospect) : { allowed: false };
  const smsCheck = prospect && settings && consent
    ? canSendSms(prospect, settings, consent)
    : { allowed: false };

  const handleToggleConsent = useCallback(async () => {
    const next = !(consent?.consented);
    const updated = await setTcpaConsent(next);
    setConsent(updated);
  }, [consent]);

  const confirmSend = (channel, action) => {
    const isSms = channel === OUTREACH_CHANNELS.SMS;
    const title = isSms ? 'Send text message?' : 'Send email?';
    const message = isSms
      ? 'You are about to send an SMS to this prospect. Confirm you have consent to contact them.'
      : 'You are about to send an email to this prospect.';

    showThemedAlert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        style: 'destructive',
        onPress: action,
      },
    ]);
  };

  const handleSendEmail = async () => {
    if (!emailCheck.allowed) {
      showThemedAlert('Cannot send', emailCheck.reason);
      return;
    }
    confirmSend(OUTREACH_CHANNELS.EMAIL, async () => {
      setSending('email');
      const result = await sendReviewEmail(prospect, user, { templates });
      setSending(null);
      if (result.success) {
        if (onSent) onSent({ channel: OUTREACH_CHANNELS.EMAIL, prospect });
        onClose();
      }
    });
  };

  const handleSendSms = async () => {
    if (!smsCheck.allowed) {
      showThemedAlert('Cannot send', smsCheck.reason);
      return;
    }
    confirmSend(OUTREACH_CHANNELS.SMS, async () => {
      setSending('sms');
      const result = await sendReviewSms(prospect, user, { templates });
      setSending(null);
      if (result.success) {
        if (onSent) onSent({ channel: OUTREACH_CHANNELS.SMS, prospect });
        onClose();
      }
    });
  };

  const handleOpenPrivacy = async () => {
    const url = 'https://leadlens.app/privacy';
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) Linking.openURL(url);
  };

  if (!prospect) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.header}>
            <View>
              <Text style={s.title}>Reach Out</Text>
              <Text style={s.prospectName}>{prospect.businessName || 'Unnamed Prospect'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {loading ? (
              <ActivityIndicator color={COLORS.accent} style={{ marginTop: 40 }} />
            ) : (
              <>
                <Text style={s.sectionLabel}>CONTACT METHODS</Text>
                <View style={s.contactRow}>
                  <View style={[s.contactChip, !emailCheck.allowed && s.contactChipDisabled]}>
                    <Text style={s.contactIcon}>✉️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.contactLabel, !emailCheck.allowed && s.contactLabelDisabled]}>Email</Text>
                      <Text style={s.contactValue} numberOfLines={1}>
                        {prospect.email || 'Not available'}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.contactChip, !smsCheck.allowed && s.contactChipDisabled]}>
                    <Text style={s.contactIcon}>💬</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.contactLabel, !smsCheck.allowed && s.contactLabelDisabled]}>SMS</Text>
                      <Text style={s.contactValue} numberOfLines={1}>
                        {prospect.phone || 'Not available'}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={s.sectionLabel}>MESSAGE TEMPLATE</Text>
                <View style={s.templateRow}>
                  {Object.values(TEMPLATE_SETS).map((set) => (
                    <TouchableOpacity
                      key={set.key}
                      onPress={() => setTemplateSet(set.key)}
                      style={[s.templateChip, templateSet === set.key && s.templateChipActive]}
                    >
                      <Text style={[s.templateChipText, templateSet === set.key && s.templateChipTextActive]}>
                        {set.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.previewBox}>
                  <Text style={s.previewSubject}>{emailSubject}</Text>
                  <Text style={s.previewBody}>{emailBody}</Text>
                </View>

                <View style={s.smsPreviewBox}>
                  <Text style={s.previewLabel}>SMS PREVIEW</Text>
                  <Text style={s.smsBody}>{smsBody}</Text>
                </View>

                <View style={s.tcpaBox}>
                  <TouchableOpacity onPress={handleToggleConsent} style={s.consentRow}>
                    <View style={[s.checkbox, consent?.consented && s.checkboxChecked]}>
                      {consent?.consented && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.consentText}>
                      I have consent to text this prospect. Msg & data rates may apply. Reply STOP to opt out.
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleOpenPrivacy}>
                    <Text style={s.privacyLink}>View Privacy Policy</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              onPress={handleSendEmail}
              disabled={!emailCheck.allowed || sending || loading}
              style={[s.sendBtn, s.emailBtn, (!emailCheck.allowed || sending || loading) && s.sendBtnDisabled]}
            >
              {sending === 'email' ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={s.sendBtnText}>✉️ Send Email</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendSms}
              disabled={!smsCheck.allowed || sending || loading}
              style={[s.sendBtn, s.smsBtn, (!smsCheck.allowed || sending || loading) && s.sendBtnDisabled]}
            >
              {sending === 'sms' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={[s.sendBtnText, s.smsBtnText]}>💬 Send SMS</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    maxHeight: '92%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    color: COLORS.label,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  prospectName: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    maxWidth: 280,
  },
  closeBtn: {
    padding: 8,
  },
  closeText: {
    color: COLORS.chrome,
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    padding: 20,
  },
  sectionLabel: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 4,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  contactChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
  },
  contactChipDisabled: {
    borderColor: 'transparent',
    opacity: 0.5,
  },
  contactIcon: {
    fontSize: 20,
  },
  contactLabel: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  contactLabelDisabled: {
    color: COLORS.muted,
  },
  contactValue: {
    color: COLORS.label,
    fontSize: 11,
    marginTop: 2,
  },
  templateRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  templateChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
  },
  templateChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  templateChipText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  templateChipTextActive: {
    color: COLORS.accent,
  },
  previewBox: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  previewSubject: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  previewBody: {
    color: COLORS.textDim,
    fontSize: 13,
    lineHeight: 20,
  },
  smsPreviewBox: {
    backgroundColor: 'rgba(123,63,190,0.08)',
    borderWidth: 1,
    borderColor: COLORS.purple,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  previewLabel: {
    color: COLORS.purple,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  smsBody: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 20,
  },
  tcpaBox: {
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.borderLit,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  checkmark: {
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
  },
  consentText: {
    flex: 1,
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 18,
  },
  privacyLink: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  emailBtn: {
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  smsBtn: {
    backgroundColor: COLORS.purpleDim,
    borderWidth: 1,
    borderColor: COLORS.purple,
  },
  smsBtnText: {
    color: '#fff',
  },
});
