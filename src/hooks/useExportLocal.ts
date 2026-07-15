import { useState, useCallback, useRef } from 'react';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import {
  prepareExportFile,
  ProspectRecord,
  ExportFormat,
} from '../utils/exportFormatters';

interface ExportProgress {
  stage: 'preparing' | 'saving' | 'complete' | 'error';
  message: string;
  percent?: number;
}

interface UseExportLocalResult {
  isExporting: boolean;
  progress: ExportProgress | null;
  error: string | null;
  exportLocal: (
    prospects: ProspectRecord[],
    options?: { format?: ExportFormat; territory?: string }
  ) => Promise<{ success: boolean; fileUri?: string; error?: string }>;
  shareFile: (fileUri: string, mimeType: string) => Promise<void>;
}

async function copyToUserSelectedLocation(
  sourceUri: string,
  filename: string
): Promise<string | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: false,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const destUri = result.assets[0].uri;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    return destUri;
  } catch {
    return null;
  }
}

export function useExportLocal(): UseExportLocalResult {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const shareFile = useCallback(async (fileUri: string, mimeType: string) => {
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      throw new Error('Sharing is not available on this device');
    }

    await Sharing.shareAsync(fileUri, {
      mimeType,
      dialogTitle: 'Save or share your prospect export',
      UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'com.microsoft.excel.xlsx',
    });
  }, []);

  const exportLocal = useCallback(
    async (
      prospects: ProspectRecord[],
      options: { format?: ExportFormat; territory?: string } = {}
    ) => {
      abortRef.current = false;
      setIsExporting(true);
      setError(null);

      try {
        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'preparing', message: 'Preparing export file...' });
        const format = options.format || 'xlsx';
        const { fileUri, filename, mimeType } = await prepareExportFile(prospects, {
          format,
          territory: options.territory,
        });

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'saving', message: 'Opening share sheet...' });
        await shareFile(fileUri, mimeType);

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'complete', message: 'Export complete!' });

        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {}

        return { success: true, fileUri };
      } catch (err: any) {
        if (err.message === 'Export cancelled') {
          setProgress(null);
          return { success: false, error: 'Cancelled' };
        }
        setError(err.message || 'Export failed');
        setProgress({ stage: 'error', message: err.message || 'Export failed' });
        return { success: false, error: err.message };
      } finally {
        setIsExporting(false);
      }
    },
    [shareFile]
  );

  return {
    isExporting,
    progress,
    error,
    exportLocal,
    shareFile,
  };
}
