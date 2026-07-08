import { Linking, Platform } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { showToast } from '../context/ToastContext';

/**
 * Opens the Outlook app specifically if installed, otherwise falls back to default.
 */
export async function sendOutlookEmail({ to, subject, body }) {
  try {
    const encodedSubject = encodeURIComponent(subject || '');
    const encodedBody = encodeURIComponent(body || '');
    const url = `ms-outlook://compose?to=${encodeURIComponent(to)}&subject=${encodedSubject}&body=${encodedBody}`;

    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }

    // If Outlook deep link fails, try the generic mailto but specifically mention it's a fallback
    return sendIntroEmail({ to, subject, body });
  } catch (e) {
    return sendIntroEmail({ to, subject, body });
  }
}

/**
 * Send an intro email (no attachment) - opens default mail app.
 * Simple and reliable on all Android devices.
 */
export async function sendIntroEmail({ to, subject, body }) {
  try {
    const available = await MailComposer.isAvailableAsync();
    if (available) {
      await MailComposer.composeAsync({ recipients: [to], subject, body });
      return true;
    }
    // Fallback: mailto link
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    showToast('No email app found. Please set up an email account on your phone first.', 'error');
    return false;
  } catch (e) {
    showToast(`Email failed: ${e.message}`, 'error');
    return false;
  }
}

/**
 * Share a file (xlsx export) — uses Android share sheet so the user
 * can pick Gmail, Outlook, Yahoo, Drive, or anything else themselves.
 * This is the only reliable way to send attachments cross-app on Android.
 */
export async function shareFileWithEmail(fileUri, { subject, body }) {
  try {
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: subject,
        UTI: 'com.microsoft.excel.xlsx',
      });
      return true;
    }
    showToast('Sharing not available on this device.', 'error');
    return false;
  } catch (e) {
    showToast(`Share failed: ${e.message}`, 'error');
    return false;
  }
}

// Keep this export for backwards compatibility
export function pickEmailClientAndSend({ to, subject, body }) {
  return sendIntroEmail({ to, subject, body });
}
