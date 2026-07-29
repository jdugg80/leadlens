import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS } from '../constants';
import { storageBridge } from '../utils/storage';
import { useExportToOneDrive } from '../hooks/useExportToOneDrive';
import { useExportToGoogleDrive } from '../hooks/useExportToGoogleDrive';
import { useExportLocal } from '../hooks/useExportLocal';
import { ProspectRecord, ExportFormat } from '../utils/exportFormatters';
import { showToast } from '../context/ToastContext';

const EXPORT_PREFS_KEY = '@leadlens_export_destination_prefs';

type ExportDestination = 'onedrive' | 'google_drive' | 'local';

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  prospects: ProspectRecord[];
  territory?: string;
  onExportComplete?: (destination: ExportDestination, success: boolean) => void;
}

const DESTINATIONS = [
  {
    key: 'onedrive' as ExportDestination,
    label: 'OneDrive',
    icon: '☁',
    description: 'Save to Microsoft OneDrive',
    color: '#0078D4',
  },
  {
    key: 'google_drive' as ExportDestination,
    label: 'Google Drive',
    icon: '📁',
    description: 'Save to Google Drive',
    color: '#4285F4',
  },
  {
    key: 'local' as ExportDestination,
    label: 'Local Storage',
    icon: '💾',
    description: 'Save to device or share',
    color: COLORS.accent,
  },
];

const FORMAT_OPTIONS = [
  { key: 'xlsx' as ExportFormat, label: 'XLSX', description: 'Excel spreadsheet' },
  { key: 'csv' as ExportFormat, label: 'CSV', description: 'Comma-separated values' },
];

export default function ExportModal({
  visible,
  onClose,
  prospects,
  territory = 'all',
  onExportComplete,
}: ExportModalProps) {
  const [selectedDestination, setSelectedDestination] = useState<ExportDestination>(() => {
    try {
      const raw = storageBridge.getSync(EXPORT_PREFS_KEY);
      if (raw) {
        const prefs = JSON.parse(raw);
        return prefs.lastDestination || 'local';
      }
    } catch (err) {
      console.warn('[ExportModal] Failed to read saved export preference:', err?.message || String(err));
    }
    return 'local';
  });
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('xlsx');
  const [isExporting, setIsExporting] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');

  const onedrive = useExportToOneDrive();
  const googleDrive = useExportToGoogleDrive();
  const local = useExportLocal();

  const saveDestinationPreference = useCallback((destination: ExportDestination) => {
    try {
      storageBridge.setSync(
        EXPORT_PREFS_KEY,
        JSON.stringify({ lastDestination: destination, updatedAt: new Date().toISOString() })
      );
    } catch (err) {
      console.warn('[ExportModal] Failed to save export preference:', err?.message || String(err));
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setIsExporting(false);
      setProgressMessage('');
    }
  }, [visible]);

  useEffect(() => {
    if (onedrive.progress?.message) {
      setProgressMessage(onedrive.progress.message);
    } else if (googleDrive.progress?.message) {
      setProgressMessage(googleDrive.progress.message);
    } else if (local.progress?.message) {
      setProgressMessage(local.progress.message);
    }
  }, [onedrive.progress, googleDrive.progress, local.progress]);

  const handleExport = async () => {
    if (prospects.length === 0) {
      showToast('No prospects to export', 'error');
      return;
    }

    setIsExporting(true);
    saveDestinationPreference(selectedDestination);

    try {
      let result;

      switch (selectedDestination) {
        case 'onedrive':
          result = await onedrive.exportToOneDrive(prospects, {
            format: selectedFormat,
            territory,
          });
          break;
        case 'google_drive':
          result = await googleDrive.exportToGoogleDrive(prospects, {
            format: selectedFormat,
            territory,
          });
          break;
        case 'local':
          result = await local.exportLocal(prospects, {
            format: selectedFormat,
            territory,
          });
          break;
      }

      if (result?.success) {
        showToast(`Export complete! ${prospects.length} prospects exported.`, 'success');
        onExportComplete?.(selectedDestination, true);
        onClose();
      } else if (result?.error !== 'Cancelled') {
        showToast(`Export failed: ${result?.error || 'Unknown error'}`, 'error');
        onExportComplete?.(selectedDestination, false);
      }
    } catch (err: any) {
      showToast(`Export failed: ${err.message || 'Unknown error'}`, 'error');
      onExportComplete?.(selectedDestination, false);
    } finally {
      setIsExporting(false);
      setProgressMessage('');
    }
  };

  const handleClose = () => {
    if (!isExporting) {
      onClose();
    }
  };

  const getAuthStatus = (destination: ExportDestination): string | null => {
    switch (destination) {
      case 'onedrive':
        return onedrive.isAuthenticated ? 'Connected' : 'Not connected';
      case 'google_drive':
        return googleDrive.isAuthenticated ? 'Connected' : 'Not connected';
      case 'local':
        return null;
      default:
        return null;
    }
  };

  const handleConnect = async (destination: ExportDestination) => {
    switch (destination) {
      case 'onedrive':
        await onedrive.login();
        break;
      case 'google_drive':
        await googleDrive.login();
        break;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>Export Prospects</Text>
            <Text style={styles.subtitle}>
              {prospects.length} prospect{prospects.length !== 1 ? 's' : ''} will be exported
            </Text>

            <Text style={styles.sectionTitle}>Format</Text>
            <View style={styles.formatRow}>
              {FORMAT_OPTIONS.map((fmt) => (
                <TouchableOpacity
                  key={fmt.key}
                  style={[
                    styles.formatOption,
                    selectedFormat === fmt.key && styles.formatOptionActive,
                  ]}
                  onPress={() => setSelectedFormat(fmt.key)}
                  activeOpacity={0.7}
                  disabled={isExporting}
                >
                  <Text
                    style={[
                      styles.formatLabel,
                      selectedFormat === fmt.key && styles.formatLabelActive,
                    ]}
                  >
                    {fmt.label}
                  </Text>
                  <Text style={styles.formatDescription}>{fmt.description}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Destination</Text>
            {DESTINATIONS.map((dest) => {
              const isSelected = selectedDestination === dest.key;
              const authStatus = getAuthStatus(dest.key);
              const needsAuth = authStatus !== null && !authStatus.includes('Connected');

              return (
                <TouchableOpacity
                  key={dest.key}
                  style={[
                    styles.destinationOption,
                    isSelected && styles.destinationOptionActive,
                  ]}
                  onPress={() => setSelectedDestination(dest.key)}
                  activeOpacity={0.7}
                  disabled={isExporting}
                >
                  <View style={styles.destinationHeader}>
                    <Text style={styles.destinationIcon}>{dest.icon}</Text>
                    <View style={styles.destinationInfo}>
                      <Text
                        style={[
                          styles.destinationLabel,
                          isSelected && styles.destinationLabelActive,
                        ]}
                      >
                        {dest.label}
                      </Text>
                      <Text style={styles.destinationDescription}>
                        {dest.description}
                      </Text>
                    </View>
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  {authStatus && (
                    <View style={styles.authRow}>
                      <Text
                        style={[
                          styles.authStatus,
                          authStatus.includes('Connected') && styles.authStatusConnected,
                        ]}
                      >
                        {authStatus}
                      </Text>
                      {needsAuth && (
                        <TouchableOpacity
                          style={styles.authButton}
                          onPress={() => handleConnect(dest.key)}
                          disabled={isExporting}
                        >
                          <Text style={styles.authButtonText}>Connect</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {isExporting && progressMessage ? (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.progressText}>{progressMessage}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={isExporting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.exportButton,
                (isExporting || prospects.length === 0) && styles.exportButtonDisabled,
              ]}
              onPress={handleExport}
              disabled={isExporting || prospects.length === 0}
            >
              {isExporting ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Text style={styles.exportButtonText}>Export</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  content: {
    padding: 20,
    paddingBottom: 12,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    color: COLORS.chrome,
    fontSize: 14,
    marginBottom: 20,
  },
  sectionTitle: {
    color: COLORS.chrome,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 10,
  },
  formatRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formatOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  formatOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  formatLabel: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
  },
  formatLabelActive: {
    color: COLORS.accent,
  },
  formatDescription: {
    color: COLORS.muted,
    fontSize: 11,
    marginTop: 2,
  },
  destinationOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  destinationOptionActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destinationIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  destinationLabelActive: {
    color: COLORS.accent,
  },
  destinationDescription: {
    color: COLORS.muted,
    fontSize: 12,
    marginTop: 2,
  },
  checkmark: {
    color: COLORS.accent,
    fontSize: 18,
    fontWeight: '700',
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  authStatus: {
    color: COLORS.muted,
    fontSize: 12,
  },
  authStatusConnected: {
    color: COLORS.success,
  },
  authButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: COLORS.accentDim,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  authButtonText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    gap: 10,
  },
  progressText: {
    color: COLORS.chrome,
    fontSize: 14,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.muted,
    fontWeight: '700',
    fontSize: 15,
  },
  exportButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
});
