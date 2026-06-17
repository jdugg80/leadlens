import { Linking, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import { storage as AsyncStorage } from './storage';
import { createSupabaseClient } from './supabaseClient';
import { showThemedAlert } from '../components/ThemedAlert';
import {
  applyTemplate,
  buildTemplateContext,
  getReviewTemplates,
} from './templateSettings';
import { sendBackendEmail } from './backendEmail';
import {
  SUPABASE_SETTINGS_KEY,
  TCPA_CONSENT_KEY,
  DEFAULT_BACKEND_EMAIL_SETTINGS,
} from '../constants';
import { logOutreachActivity, OUTREACH_TYPES } from './outreachUtils';

export const OUTREACH_CHANNELS = {
  EMAIL: 'email',
  SMS: 'sms',
};

export const OUTREACH_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  OPENED: 'opened',
  REPLIED: 'replied',
  OPTED_OUT: 'opted_out',
};

const DEFAULT_OUTREACH_SETTINGS = {
  backendEmailEnabled: false,
  backendEmailEndpoint: DEFAULT_BACKEND_EMAIL_SETTINGS.endpoint,
  senderName: '',
  senderEmail: '',
  companyName: 'LeadLens Pest Services',
  includeUnsubscribeLink: true,
  smsQuietHoursStart: 20, // 8 PM
  smsQuietHoursEnd: 8,    // 8 AM
};

export async function getOutreachSettings() {
  const raw = await AsyncStorage.getItem('@leadlens_outreach_settings');
  if (!raw) return DEFAULT_OUTREACH_SETTINGS;
  try {
    return { ...DEFAULT_OUTREACH_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_OUTREACH_SETTINGS;
  }
}

export async function saveOutreachSettings(settings) {
  const next = { ...DEFAULT_OUTREACH_SETTINGS, ...settings };
  await AsyncStorage.setItem('@leadlens_outreach_settings', JSON.stringify(next));
  return next;
}

export async function getTcpaConsent() {
  const raw = await AsyncStorage.getItem(TCPA_CONSENT_KEY);
  if (!raw) return { consented: false, consentedAt: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { consented: false, consentedAt: null };
  }
}

export async function setTcpaConsent(consented) {
  const record = { consented: !!consented, consentedAt: consented ? new Date().toISOString() : null };
  await AsyncStorage.setItem(TCPA_CONSENT_KEY, JSON.stringify(record));
  return record;
}

export function isWithinSmsQuietHours(settings) {
  const now = new Date();
  const hour = now.getHours();
  const start = settings?.smsQuietHoursStart ?? DEFAULT_OUTREACH_SETTINGS.smsQuietHoursStart;
  const end = settings?.smsQuietHoursEnd ?? DEFAULT_OUTREACH_SETTINGS.smsQuietHoursEnd;
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

export function canSendSms(prospect, settings, consent) {
  if (!prospect?.phone) return { allowed: false, reason: 'No phone number available.' };
  if (!consent?.consented) return { allowed: false, reason: 'TCPA consent is required before sending SMS.' };
  if (isWithinSmsQuietHours(settings)) {
    return { allowed: false, reason: 'SMS quiet hours are in effect (8 PM - 8 AM). Messages will be held until morning.' };
  }
  return { allowed: true, reason: '' };
}

export function canSendEmail(prospect) {
  if (!prospect?.email) return { allowed: false, reason: 'No email address available.' };
  return { allowed: true, reason: '' };
}

function getSupabaseFromSettings() {
  const raw = AsyncStorage.getSync(SUPABASE_SETTINGS_KEY);
  const config = raw ? JSON.parse(raw) : null;
  return createSupabaseClient(config);
}

export async function trackOutreachMessage({
  prospectId,
  businessName,
  channel,
  toAddress,
  subject,
  body,
  status = OUTREACH_STATUS.PENDING,
  providerResponse = null,
  errorMessage = null,
  userId = null,
}) {
  try {
    const supabase = getSupabaseFromSettings();
    if (!supabase) return null;

    const { data: { user } } = await supabase.auth.getUser();
    const resolvedUserId = userId || user?.id || null;

    const record = {
      prospect_id: prospectId || null,
      business_name: businessName || null,
      user_id: resolvedUserId,
      channel,
      to_address: toAddress,
      subject: subject || null,
      body: body || null,
      status,
      provider_response: providerResponse,
      error_message: errorMessage,
      sent_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('outreach_messages')
      .insert(record)
      .select()
      .single();

    if (error) {
      console.warn('[trackOutreachMessage] Supabase error:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.warn('[trackOutreachMessage] Unexpected error:', err.message);
    return null;
  }
}

export async function updateOutreachStatus(messageId, status, providerResponse = null, errorMessage = null) {
  if (!messageId) return null;
  try {
    const supabase = getSupabaseFromSettings();
    if (!supabase) return null;

    const { error } = await supabase
      .from('outreach_messages')
      .update({
        status,
        provider_response: providerResponse,
        error_message: errorMessage,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId);

    if (error) {
      console.warn('[updateOutreachStatus] Supabase error:', error.message);
      return null;
    }
    return true;
  } catch (err) {
    console.warn('[updateOutreachStatus] Unexpected error:', err.message);
    return null;
  }
}

export async function getOutreachHistoryForProspect(prospectId) {
  if (!prospectId) return [];
  try {
    const supabase = getSupabaseFromSettings();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('outreach_messages')
      .select('*')
      .eq('prospect_id', prospectId)
      .order('sent_at', { ascending: false });

    if (error) {
      console.warn('[getOutreachHistoryForProspect] Supabase error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn('[getOutreachHistoryForProspect] Unexpected error:', err.message);
    return [];
  }
}

export async function sendReviewEmail(prospect, user, { useBackend = false, templates = null } = {}) {
  const emailCheck = canSendEmail(prospect);
  if (!emailCheck.allowed) {
    showThemedAlert('Cannot send email', emailCheck.reason);
    return { success: false, reason: emailCheck.reason };
  }

  const currentTemplates = templates || (await getReviewTemplates());
  const context = buildTemplateContext(prospect, user);
  const subject = applyTemplate(currentTemplates.emailSubject, context);
  const body = applyTemplate(currentTemplates.emailBody, context);

  const messageRecord = await trackOutreachMessage({
    prospectId: prospect.id,
    businessName: prospect.businessName,
    channel: OUTREACH_CHANNELS.EMAIL,
    toAddress: prospect.email,
    subject,
    body,
    status: OUTREACH_STATUS.PENDING,
  });

  try {
    if (useBackend) {
      const settings = await getOutreachSettings();
      const endpoint = settings.backendEmailEndpoint || DEFAULT_BACKEND_EMAIL_SETTINGS.endpoint;
      const result = await sendBackendEmail({
        endpoint,
        to: prospect.email,
        subject,
        text: body,
        html: `<div style="white-space:pre-line;font-family:Arial,sans-serif;">${body.replace(/\n/g, '<br/>')}</div>`,
      });
      await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.SENT, result);
    } else {
      const available = await MailComposer.isAvailableAsync();
      if (available) {
        await MailComposer.composeAsync({ recipients: [prospect.email], subject, body });
        await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.SENT);
      } else {
        const url = `mailto:${encodeURIComponent(prospect.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.SENT);
        } else {
          throw new Error('No email app found.');
        }
      }
    }

    await logOutreachActivity(prospect.id, OUTREACH_TYPES.EMAIL.key, `Review offer email sent to ${prospect.email}`);
    return { success: true, messageId: messageRecord?.id };
  } catch (err) {
    const reason = err?.message || 'Email send failed';
    await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.FAILED, null, reason);
    showThemedAlert('Email failed', reason);
    return { success: false, reason };
  }
}

export async function sendReviewSms(prospect, user, { templates = null } = {}) {
  const settings = await getOutreachSettings();
  const consent = await getTcpaConsent();
  const smsCheck = canSendSms(prospect, settings, consent);

  if (!smsCheck.allowed) {
    showThemedAlert('Cannot send SMS', smsCheck.reason);
    return { success: false, reason: smsCheck.reason };
  }

  const currentTemplates = templates || (await getReviewTemplates());
  const context = buildTemplateContext(prospect, user);
  const body = applyTemplate(currentTemplates.smsBody, context);
  const phone = String(prospect.phone || '').replace(/\D/g, '');

  const messageRecord = await trackOutreachMessage({
    prospectId: prospect.id,
    businessName: prospect.businessName,
    channel: OUTREACH_CHANNELS.SMS,
    toAddress: phone,
    subject: null,
    body,
    status: OUTREACH_STATUS.PENDING,
  });

  try {
    const url = `sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) throw new Error('No messaging app found.');

    await Linking.openURL(url);
    await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.SENT);
    await logOutreachActivity(prospect.id, OUTREACH_TYPES.TEXT.key, `Review offer SMS sent to ${phone}`);
    return { success: true, messageId: messageRecord?.id };
  } catch (err) {
    const reason = err?.message || 'SMS send failed';
    await updateOutreachStatus(messageRecord?.id, OUTREACH_STATUS.FAILED, null, reason);
    showThemedAlert('SMS failed', reason);
    return { success: false, reason };
  }
}

export async function markProspectOptOut(prospectId, channel = OUTREACH_CHANNELS.SMS) {
  await trackOutreachMessage({
    prospectId,
    channel,
    toAddress: null,
    status: OUTREACH_STATUS.OPTED_OUT,
  });
}
