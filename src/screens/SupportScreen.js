import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  SafeAreaView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createSupabaseClient } from '../utils/supabaseClient';
import { storageBridge } from '../utils/storage';
import { showThemedAlert, ThemedAlertHost } from '../components/ThemedAlert';

const COLORS = {
  bg: '#080A0F',
  accent: '#00C9FF',
  accent2: '#CC1040',
  purple: '#7B3FBE',
  chrome: '#B8BDD0',
  surface: '#1A1D24',
  border: '#2A2D34',
  error: '#FF6B6B',
  success: '#4ECB71',
};

export default function SupportScreen({ navigation }) {
  const supabase = createSupabaseClient();
  const [expectedIssue, setExpectedIssue] = useState('');
  const [actualIssue, setActualIssue] = useState('');
  const [issueType, setIssueType] = useState('Bug');
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('v2.0.1-BETA-43');
  const [repName, setRepName] = useState('');
  const [employeeId, setEmployeeId] = useState('N/A');
  const [branch, setBranch] = useState('N/A');
  const [platform] = useState('android');
  const errorScrollRef = useRef(null);

  const issueTypes = ['Bug', 'Feature Request', 'Performance Issue', 'UI/UX Feedback', 'Other'];

  React.useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      // Pull name from auth session first
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const meta = session.user.user_metadata || {};
        const authName = meta.full_name || meta.name || session.user.email || '';
        if (authName) setRepName(authName);
      }

      // Override with locally stored values if present
      const storedName   = await storageBridge.getItem('repName');
      const storedId     = await storageBridge.getItem('employeeId');
      const storedBranch = await storageBridge.getItem('branch');

      if (storedName)   setRepName(storedName);
      if (storedId)     setEmployeeId(storedId);
      if (storedBranch) setBranch(storedBranch);
    } catch (error) {
      console.error('Error loading user info:', error);
    }
  };

  const handleSubmitTicket = async () => {
    // Validation
    if (!expectedIssue.trim()) {
      showThemedAlert('Validation Error', 'Please describe what you expected');
      return;
    }
    if (!actualIssue.trim()) {
      showThemedAlert('Validation Error', 'Please describe what actually happened');
      return;
    }
    setLoading(true);

    try {
      // Get current user session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        showThemedAlert('Authentication Error', 'Unable to verify user session. Please log in again.');
        setLoading(false);
        return;
      }

      const userId = session.user.id;
      const timestamp = new Date().toISOString();

      // Prepare ticket data
      const ticketData = {
        user_id:         userId,
        rep_email:       session.user.email || '',
        rep_name:        repName || session.user.email || 'Unknown',
        issue_type:      issueType,
        subject:         `[${issueType}] ${expectedIssue.substring(0, 80)}`,
        details:         actualIssue,
        expected:        expectedIssue,
        actual:          actualIssue,
        app_version:     appVersion,
        platform:        platform,
        employee_num:    employeeId || 'N/A',
        branch_num:      branch || 'N/A',
        attachments:     attachments.length ? attachments : null,
        status:          'open',
      };

      // Insert ticket into Supabase
      const { data, error } = await supabase
        .from('support_tickets')
        .insert([ticketData])
        .select();

      if (error) {
        console.error('Ticket submission error:', error);
        showThemedAlert('Submission Failed', `Error: ${error.message}`);
        setLoading(false);
        return;
      }

      // Reset form
      setExpectedIssue('');
      setActualIssue('');
      setIssueType('Bug');
      setAttachments([]);

      showThemedAlert(
        '✅ Ticket Submitted',
        `Support ticket #${data[0]?.id || 'submitted'} has been created. Our team will review it shortly.`,
        [
          {
            text: 'OK',
            onPress: () => {
              navigation.goBack();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Unexpected error during submission:', error);
      showThemedAlert('Submission Failed', error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderIssueTypeModal = () => (
    <Modal
      visible={showTypeModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowTypeModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Select Issue Type</Text>
          <FlatList
            data={issueTypes}
            keyExtractor={(item) => item}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.issueTypeItem,
                  issueType === item && styles.issueTypeItemActive,
                ]}
                onPress={() => {
                  setIssueType(item);
                  setShowTypeModal(false);
                }}
              >
                <Text
                  style={[
                    styles.issueTypeText,
                    issueType === item && styles.issueTypeTextActive,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={() => setShowTypeModal(false)}
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={COLORS.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support & Feedback</Text>
        <View style={styles.betaBadge}>
          <Text style={styles.betaBadgeText}>BETA</Text>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        ref={errorScrollRef}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>WHAT DID YOU EXPECT?</Text>
        <TextInput
          style={styles.input}
          placeholder="Describe expected behavior..."
          placeholderTextColor={COLORS.chrome}
          multiline
          numberOfLines={4}
          value={expectedIssue}
          onChangeText={setExpectedIssue}
          editable={!loading}
        />

        <Text style={styles.sectionLabel}>WHAT ACTUALLY HAPPENED?</Text>
        <TextInput
          style={styles.input}
          placeholder="Describe the issue..."
          placeholderTextColor={COLORS.chrome}
          multiline
          numberOfLines={5}
          value={actualIssue}
          onChangeText={setActualIssue}
          editable={!loading}
        />

        <Text style={styles.sectionLabel}>ISSUE TYPE</Text>
        <TouchableOpacity
          style={styles.issueTypeButton}
          onPress={() => setShowTypeModal(true)}
          disabled={loading}
        >
          <Text style={styles.issueTypeButtonText}>{issueType}</Text>
          <Ionicons name="chevron-down" size={20} color={COLORS.accent} />
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>ATTACHMENTS</Text>
        <View style={styles.attachmentContainer}>
          <Text style={styles.attachmentText}>
            {attachments.length > 0
              ? `${attachments.length} attachment${attachments.length !== 1 ? 's' : ''} selected`
              : 'No attachments selected yet'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>APP METADATA</Text>
        <View style={styles.metadataBox}>
          <Text style={styles.metadataText}>App Version: {appVersion}</Text>
          <Text style={styles.metadataText}>Platform: {platform}</Text>
          <Text style={styles.metadataText}>Rep Name: {repName || 'Not set'}</Text>
          <Text style={styles.metadataText}>Employee #: {employeeId}</Text>
          <Text style={styles.metadataText}>Branch / Dept / Team: {branch}</Text>
          <Text style={styles.metadataText}>Issue Type: {issueType}</Text>
          <Text style={styles.metadataText}>
            Time: {new Date().toISOString()}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            loading && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmitTicket}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.accent} />
          ) : (
            <Text style={styles.submitButtonText}>SUBMIT SUPPORT TICKET</Text>
          )}
        </TouchableOpacity>

        <View style={styles.spacer} />
      </ScrollView>

      {renderIssueTypeModal()}
      <ThemedAlertHost />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.chrome,
    flex: 1,
    marginLeft: 12,
  },
  betaBadge: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  betaBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.chrome,
    opacity: 0.6,
    marginBottom: 8,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: 12,
    padding: 12,
    color: COLORS.chrome,
    fontSize: 14,
    marginBottom: 20,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  issueTypeButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  issueTypeButtonText: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.accent,
    marginBottom: 12,
  },
  issueTypeItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: COLORS.bg,
  },
  issueTypeItemActive: {
    backgroundColor: COLORS.accent,
  },
  issueTypeText: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '500',
  },
  issueTypeTextActive: {
    color: COLORS.bg,
  },
  modalCloseButton: {
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.border,
    borderRadius: 8,
  },
  modalCloseText: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  attachmentContainer: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  attachmentText: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '500',
  },
  metadataBox: {
    backgroundColor: COLORS.surface,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.purple,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  metadataText: {
    color: COLORS.chrome,
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 6,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: COLORS.bg,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  spacer: {
    height: 20,
  },
});
