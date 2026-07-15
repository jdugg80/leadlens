import { useState, useCallback, useRef } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as FileSystem from 'expo-file-system';
import { storageBridge } from '../utils/storage';
import {
  prepareExportFile,
  ProspectRecord,
  ExportFormat,
} from '../utils/exportFormatters';

const ONEDRIVE_STORAGE_KEY = '@leadlens_onedrive_tokens';
const ONEDRIVE_CLIENT_ID = process.env.EXPO_PUBLIC_ONEDRIVE_CLIENT_ID || '';
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

const discovery = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

interface OneDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ExportProgress {
  stage: 'auth' | 'preparing' | 'uploading' | 'complete' | 'error';
  message: string;
  percent?: number;
}

interface UseExportToOneDriveResult {
  isExporting: boolean;
  progress: ExportProgress | null;
  error: string | null;
  isAuthenticated: boolean;
  login: () => Promise<boolean>;
  logout: () => void;
  exportToOneDrive: (
    prospects: ProspectRecord[],
    options?: { format?: ExportFormat; territory?: string; folder?: string }
  ) => Promise<{ success: boolean; fileUri?: string; webUrl?: string; error?: string }>;
}

async function refreshAccessToken(refreshToken: string): Promise<OneDriveTokens | null> {
  try {
    const response = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ONEDRIVE_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'offline_access Files.ReadWrite',
      }).toString(),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000,
    };
  } catch {
    return null;
  }
}

async function getValidToken(): Promise<string | null> {
  try {
    const raw = storageBridge.getSync(ONEDRIVE_STORAGE_KEY);
    if (!raw) return null;

    const tokens: OneDriveTokens = JSON.parse(raw);

    if (Date.now() < tokens.expiresAt) {
      return tokens.accessToken;
    }

    const refreshed = await refreshAccessToken(tokens.refreshToken);
    if (refreshed) {
      storageBridge.setSync(ONEDRIVE_STORAGE_KEY, JSON.stringify(refreshed));
      return refreshed.accessToken;
    }

    storageBridge.removeSync(ONEDRIVE_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

async function uploadToOneDrive(
  accessToken: string,
  fileUri: string,
  filename: string,
  folder: string = 'LeadLens Exports'
): Promise<{ webUrl: string }> {
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const folderPath = encodeURIComponent(`/${folder}`);
  const encodedFilename = encodeURIComponent(filename);
  const uploadUrl = `${GRAPH_API_BASE}/me/drive/root:${folderPath}/${encodedFilename}:/content`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: fileContent,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  return { webUrl: result.webUrl || '' };
}

export function useExportToOneDrive(): UseExportToOneDriveResult {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const raw = storageBridge.getSync(ONEDRIVE_STORAGE_KEY);
      if (!raw) return false;
      const tokens: OneDriveTokens = JSON.parse(raw);
      return Date.now() < tokens.expiresAt;
    } catch {
      return false;
    }
  });
  const abortRef = useRef(false);

  const login = useCallback(async (): Promise<boolean> => {
    try {
      if (!ONEDRIVE_CLIENT_ID) {
        setError('OneDrive client ID not configured');
        return false;
      }

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'leadlens',
        path: 'auth/callback',
      });

      const request = new AuthSession.AuthRequest({
        clientId: ONEDRIVE_CLIENT_ID,
        scopes: ['offline_access', 'Files.ReadWrite'],
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        extraParams: {
          prompt: 'consent',
        },
      });

      const result = await request.promptAsync(discovery);

      if (result.type !== 'success') {
        if (result.type === 'error') {
          setError(result.error?.message || 'Authentication failed');
        }
        return false;
      }

      const tokenResponse = await AuthSession.exchangeCodeAsync(
        {
          clientId: ONEDRIVE_CLIENT_ID,
          code: result.params.code,
          redirectUri,
          extraParams: {
            client_secret: process.env.EXPO_PUBLIC_ONEDRIVE_CLIENT_SECRET || '',
          },
        },
        discovery
      );

      const tokens: OneDriveTokens = {
        accessToken: tokenResponse.accessToken,
        refreshToken: (tokenResponse as any).refreshToken || '',
        expiresAt: Date.now() + (tokenResponse.expiresIn - 300) * 1000,
      };

      storageBridge.setSync(ONEDRIVE_STORAGE_KEY, JSON.stringify(tokens));
      setIsAuthenticated(true);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    storageBridge.removeSync(ONEDRIVE_STORAGE_KEY);
    setIsAuthenticated(false);
  }, []);

  const exportToOneDrive = useCallback(
    async (
      prospects: ProspectRecord[],
      options: { format?: ExportFormat; territory?: string; folder?: string } = {}
    ) => {
      abortRef.current = false;
      setIsExporting(true);
      setError(null);

      try {
        setProgress({ stage: 'auth', message: 'Verifying OneDrive connection...' });

        let accessToken = await getValidToken();
        if (!accessToken) {
          setProgress({ stage: 'auth', message: 'Connecting to OneDrive...' });
          const loginSuccess = await login();
          if (!loginSuccess || abortRef.current) {
            throw new Error('Authentication required');
          }
          accessToken = await getValidToken();
          if (!accessToken) {
            throw new Error('Failed to obtain access token');
          }
        }

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'preparing', message: 'Preparing export file...' });
        const format = options.format || 'xlsx';
        const { fileUri, filename } = await prepareExportFile(prospects, {
          format,
          territory: options.territory,
        });

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'uploading', message: 'Uploading to OneDrive...', percent: 0 });
        const { webUrl } = await uploadToOneDrive(
          accessToken,
          fileUri,
          filename,
          options.folder
        );

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'complete', message: 'Export complete!' });

        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch {}

        return { success: true, fileUri, webUrl };
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
    [login]
  );

  return {
    isExporting,
    progress,
    error,
    isAuthenticated,
    login,
    logout,
    exportToOneDrive,
  };
}
