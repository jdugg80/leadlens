import { useState, useCallback, useRef } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as FileSystem from 'expo-file-system';
import { storageBridge } from '../utils/storage';
import {
  prepareExportFile,
  ProspectRecord,
  ExportFormat,
} from '../utils/exportFormatters';

const GOOGLE_STORAGE_KEY = '@leadlens_google_drive_tokens';
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET || '';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

interface GoogleDriveTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface ExportProgress {
  stage: 'auth' | 'preparing' | 'uploading' | 'complete' | 'error';
  message: string;
  percent?: number;
}

interface UseExportToGoogleDriveResult {
  isExporting: boolean;
  progress: ExportProgress | null;
  error: string | null;
  isAuthenticated: boolean;
  login: () => Promise<boolean>;
  logout: () => void;
  exportToGoogleDrive: (
    prospects: ProspectRecord[],
    options?: { format?: ExportFormat; territory?: string; folder?: string }
  ) => Promise<{ success: boolean; fileUri?: string; webUrl?: string; error?: string }>;
}

async function refreshAccessToken(refreshToken: string): Promise<GoogleDriveTokens | null> {
  try {
    const response = await fetch(discovery.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
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
    const raw = storageBridge.getSync(GOOGLE_STORAGE_KEY);
    if (!raw) return null;

    const tokens: GoogleDriveTokens = JSON.parse(raw);

    if (Date.now() < tokens.expiresAt) {
      return tokens.accessToken;
    }

    const refreshed = await refreshAccessToken(tokens.refreshToken);
    if (refreshed) {
      storageBridge.setSync(GOOGLE_STORAGE_KEY, JSON.stringify(refreshed));
      return refreshed.accessToken;
    }

    storageBridge.removeSync(GOOGLE_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

async function findOrCreateFolder(
  accessToken: string,
  folderName: string = 'LeadLens Exports',
  parentFolderId: string = 'root'
): Promise<string> {
  const searchQuery = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentFolderId}' in parents and trashed=false`;
  const searchUrl = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(searchQuery)}&fields=files(id)`;

  const searchResponse = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.files?.length > 0) {
      return searchData.files[0].id;
    }
  }

  const createUrl = `${DRIVE_API_BASE}/files`;
  const metadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentFolderId],
  };

  const createResponse = await fetch(createUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!createResponse.ok) {
    throw new Error('Failed to create folder');
  }

  const createData = await createResponse.json();
  return createData.id;
}

async function uploadToGoogleDrive(
  accessToken: string,
  fileUri: string,
  filename: string,
  folderId: string
): Promise<{ fileId: string; webUrl: string }> {
  const fileContent = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const metadata = {
    name: filename,
    parents: [folderId],
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', fileContent);

  const uploadUrl = `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Upload failed with status ${response.status}`);
  }

  const result = await response.json();
  const webUrl = `https://drive.google.com/file/d/${result.id}/view`;
  return { fileId: result.id, webUrl };
}

export function useExportToGoogleDrive(): UseExportToGoogleDriveResult {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    try {
      const raw = storageBridge.getSync(GOOGLE_STORAGE_KEY);
      if (!raw) return false;
      const tokens: GoogleDriveTokens = JSON.parse(raw);
      return Date.now() < tokens.expiresAt;
    } catch (err) {
      console.warn('[GoogleDrive] Failed to parse stored tokens:', (err as Error)?.message || String(err));
      return false;
    }
  });
  const abortRef = useRef(false);

  const login = useCallback(async (): Promise<boolean> => {
    try {
      if (!GOOGLE_CLIENT_ID) {
        setError('Google Drive client ID not configured');
        return false;
      }

      const redirectUri = AuthSession.makeRedirectUri({
        scheme: 'leadlens',
        path: 'auth/callback',
      });

      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        extraParams: {
          access_type: 'offline',
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
          clientId: GOOGLE_CLIENT_ID,
          code: result.params.code,
          redirectUri,
          extraParams: {
            client_secret: GOOGLE_CLIENT_SECRET,
          },
        },
        discovery
      );

      const tokens: GoogleDriveTokens = {
        accessToken: tokenResponse.accessToken,
        refreshToken: (tokenResponse as any).refreshToken || '',
        expiresAt: Date.now() + (tokenResponse.expiresIn - 300) * 1000,
      };

      storageBridge.setSync(GOOGLE_STORAGE_KEY, JSON.stringify(tokens));
      setIsAuthenticated(true);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    storageBridge.removeSync(GOOGLE_STORAGE_KEY);
    setIsAuthenticated(false);
  }, []);

  const exportToGoogleDrive = useCallback(
    async (
      prospects: ProspectRecord[],
      options: { format?: ExportFormat; territory?: string; folder?: string } = {}
    ) => {
      abortRef.current = false;
      setIsExporting(true);
      setError(null);

      try {
        setProgress({ stage: 'auth', message: 'Verifying Google Drive connection...' });

        let accessToken = await getValidToken();
        if (!accessToken) {
          setProgress({ stage: 'auth', message: 'Connecting to Google Drive...' });
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

        setProgress({ stage: 'uploading', message: 'Uploading to Google Drive...', percent: 0 });
        const folderId = await findOrCreateFolder(
          accessToken,
          options.folder || 'LeadLens Exports'
        );
        const { webUrl } = await uploadToGoogleDrive(
          accessToken,
          fileUri,
          filename,
          folderId
        );

        if (abortRef.current) throw new Error('Export cancelled');

        setProgress({ stage: 'complete', message: 'Export complete!' });

        try {
          await FileSystem.deleteAsync(fileUri, { idempotent: true });
        } catch (err) {
          console.warn('[GoogleDrive] Failed to clean up temp file:', (err as Error)?.message || String(err));
        }

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
    exportToGoogleDrive,
  };
}
