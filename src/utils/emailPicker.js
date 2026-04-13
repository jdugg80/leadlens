import { Alert, Linking } from 'react-native';
import * as MailComposer from 'expo-mail-composer';

const CLIENTS = [
  { label: 'Gmail',        id: 'gmail' },
  { label: 'Outlook',      id: 'outlook' },
  { label: 'Yahoo Mail',   id: 'yahoo' },
  { label: 'Default Mail App', id: 'default' },
  { label: 'Cancel', id: 'cancel', style: 'cancel' },
];

/**
 * Show an email client picker then compose an email.
 * @param {object} opts - { to, subject, body }
 */
export function pickEmailClientAndSend({ to, subject, body }) {
  return new Promise((resolve) => {
    const buttons = CLIENTS.map(c => ({
      text: c.label,
      style: c.style,
      onPress: c.id === 'cancel'
        ? () => resolve(false)
        : () => { sendVia(c.id, { to, subject, body }).then(resolve); },
    }));

    Alert.alert('Choose Email App', null, buttons);
  });
}

async function sendVia(clientId, { to, subject, body }) {
  const encodedTo      = encodeURIComponent(to || '');
  const encodedSubject = encodeURIComponent(subject || '');
  const encodedBody    = encodeURIComponent(body || '');

  const urls = {
    gmail:   `googlegmail://co?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`,
    outlook: `ms-outlook://compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`,
    yahoo:   `ymail://mail/compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`,
  };

  if (clientId !== 'default') {
    try {
      const canOpen = await Linking.canOpenURL(urls[clientId]);
      if (canOpen) {
        await Linking.openURL(urls[clientId]);
        return true;
      } else {
        Alert.alert(
          'App not found',
          `${CLIENTS.find(c => c.id === clientId)?.label} doesn't appear to be installed. Falling back to default mail app.`
        );
        // Fall through to default
      }
    } catch {
      // Fall through to default
    }
  }

  // Default: expo-mail-composer
  try {
    const available = await MailComposer.isAvailableAsync();
    if (available) {
      await MailComposer.composeAsync({ recipients: [to], subject, body });
      return true;
    }
    Alert.alert('No email app found', 'Please set up an email account on your phone first.');
    return false;
  } catch (e) {
    Alert.alert('Email failed', e.message);
    return false;
  }
}
