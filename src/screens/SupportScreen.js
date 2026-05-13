import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as MailComposer from 'expo-mail-composer';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { APP_VERSION, COLORS, SUPPORT_EMAIL } from '../constants';
import { Card, FieldInput, PrimaryButton, ScreenHeader, SectionLabel } from '../components/UI';
import { showThemedAlert } from '../components/ThemedAlert';

const ISSUE_TYPES = ['Bug', 'Export problem', 'Sync problem', 'OCR / scan issue', 'Duplicate issue', 'Login/session issue', 'Feature request', 'General feedback'];

export default function SupportScreen({ navigation, route }) {
  const { user } = route.params || {};
  const [issueType, setIssueType] = useState('Bug');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [attachments, setAttachments] = useState([]);

  const meta = useMemo(() => {
    return [
      `App Version: ${APP_VERSION}`,
      `Platform: ${Platform.OS}`,
      `Rep Name: ${user?.repName || ''}`,
      `Employee #: ${user?.employeeNum || ''}`,
      `Branch / Dept / Team: ${user?.branchNum || ''}`,
      `Issue Type: ${issueType}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');
  }, [issueType, user]);

  const addScreenshot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showThemedAlert('Permission needed', 'Please allow photo library access to attach screenshots.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [...prev, { name: asset.fileName || 'screenshot.jpg', uri: asset.uri, type: 'image' }]);
    }
  };

  const addVideo = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['video/*'] });
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [...prev, { name: asset.name || 'screen-recording.mp4', uri: asset.uri, type: 'video' }]);
    }
  };

  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  const send = async () => {
    if (!subject.trim() || !details.trim()) {
      showThemedAlert('Missing details', 'Please enter a subject and describe the issue before sending.');
      return;
    }

    const body = [
      `Subject: ${subject.trim()}`,
      '',
      'Issue Details:',
      details.trim(),
      '',
      'Expected Result:',
      expected.trim() || '(not provided)',
      '',
      'Actual Result:',
      actual.trim() || '(not provided)',
      '',
      'App Metadata:',
      meta,
    ].join('\n');

    const available = await MailComposer.isAvailableAsync();
    if (!available) {
      showThemedAlert('No mail app', 'Please configure a mail app on this device first.');
      return;
    }

    try {
      await MailComposer.composeAsync({
        recipients: [SUPPORT_EMAIL],
        subject: `[LeadLens Support] ${subject.trim()}`,
        body,
        attachments: attachments.map((item) => item.uri),
      });
      showThemedAlert('Draft opened', 'Your support email draft was opened with the selected attachments.');
    } catch (err) {
      showThemedAlert('Could not open mail draft', err.message || 'Please try again.');
    }
  };

  return (
    <View style={s.root}>
      <ScreenHeader title="Support & Feedback" onBack={() => navigation.goBack()} badge="BETA" />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Card accent>
          <Text style={s.lead}>Use this page to report issues, send feedback, and attach screenshots or short screen recordings.</Text>
          <Text style={s.sub}>Messages go to {SUPPORT_EMAIL} as a mail draft so you can review before sending.</Text>
        </Card>

        <SectionLabel>Issue Type</SectionLabel>
        <View style={s.chips}>
          {ISSUE_TYPES.map((type) => (
            <TouchableOpacity key={type} style={[s.chip, issueType === type && s.chipOn]} onPress={() => setIssueType(type)}>
              <Text style={[s.chipText, issueType === type && s.chipTextOn]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <SectionLabel>Details</SectionLabel>
        <Card>
          <FieldInput label="Subject" value={subject} onChangeText={setSubject} placeholder="Short summary of the problem" />
          <View style={{ marginTop: 12 }}>
            <FieldInput label="What happened?" value={details} onChangeText={setDetails} multiline numberOfLines={6} style={s.multi} placeholder="Describe the issue in plain English." />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="What did you expect?" value={expected} onChangeText={setExpected} multiline numberOfLines={3} style={s.smallMulti} />
          </View>
          <View style={{ marginTop: 12 }}>
            <FieldInput label="What actually happened?" value={actual} onChangeText={setActual} multiline numberOfLines={3} style={s.smallMulti} />
          </View>
        </Card>

        <SectionLabel>Attachments</SectionLabel>
        <Card>
          <View style={s.attachRow}>
            <PrimaryButton title="Add Screenshot" onPress={addScreenshot} style={s.attachBtn} />
            <PrimaryButton title="Add Screen Recording" onPress={addVideo} style={[s.attachBtn, { backgroundColor: COLORS.accent2 }]} />
          </View>
          {attachments.length ? (
            <View style={{ marginTop: 14 }}>
              {attachments.map((item, idx) => (
                <View key={`${item.uri}-${idx}`} style={s.attachmentItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.attachmentName}>{item.name}</Text>
                    <Text style={s.attachmentType}>{item.type === 'video' ? 'Short screen recording' : 'Screenshot / image'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAttachment(idx)}><Text style={s.remove}>Remove</Text></TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.empty}>No attachments selected yet.</Text>
          )}
        </Card>

        <SectionLabel>App Metadata</SectionLabel>
        <Card>
          <Text style={s.meta}>{meta}</Text>
        </Card>

        <PrimaryButton title="Open Support Email Draft" onPress={send} style={{ marginTop: 18 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  lead: { color: COLORS.text, fontSize: 14, lineHeight: 22, fontWeight: '700' },
  sub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 },
  chip: {
    borderWidth: 1, borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface2, borderRadius: 18,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 8,
  },
  chipOn: { borderColor: 'rgba(123,63,190,0.5)', backgroundColor: 'rgba(123,63,190,0.12)' },
  chipText: { color: COLORS.muted, fontWeight: '700', fontSize: 12 },
  chipTextOn: { color: COLORS.purple },
  multi: { minHeight: 130, textAlignVertical: 'top' },
  smallMulti: { minHeight: 88, textAlignVertical: 'top' },
  attachRow: { gap: 10 },
  attachBtn: { marginTop: 0 },
  attachmentItem: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 12, backgroundColor: COLORS.surface2,
    padding: 12, marginBottom: 8, gap: 12,
  },
  attachmentName: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  attachmentType: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  remove: { color: COLORS.danger, fontWeight: '700', fontSize: 12 },
  empty: { color: COLORS.muted, fontSize: 12, marginTop: 12 },
  meta: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
