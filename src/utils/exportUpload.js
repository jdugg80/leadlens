import { storageBridge as AsyncStorage } from './storage';
import * as FileSystem from 'expo-file-system';
import { SUPABASE_SETTINGS_KEY } from '../constants';
import { createSupabaseClient } from './supabaseClient';

const EXPORT_BUCKET = 'exports';

function getFileName(fileUri) {
  return fileUri.split('/').pop() || `LeadLens_Export_${Date.now()}.xlsx`;
}

export async function uploadExportAndGetLink(fileUri) {
  const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
  const settings = raw ? JSON.parse(raw) : null;
  const supabase = createSupabaseClient(settings);

  if (!supabase) {
    throw new Error('Supabase is not configured in Settings.');
  }

  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const fileName = `${Date.now()}_${getFileName(fileUri)}`;
  const path = `leadlens-exports/${fileName}`;

  const upload = await supabase.storage
    .from(EXPORT_BUCKET)
    .upload(path, decodeBase64(base64), {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });

  if (upload.error) {
    throw new Error(upload.error.message || 'Upload failed.');
  }

  const { data } = supabase.storage.from(EXPORT_BUCKET).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Could not generate export link.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
  };
}

function decodeBase64(base64) {
  const binary = global.atob ? global.atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}