/**
 * updateChecker.js — Project Scarlett Beta
 * Place at: utils/updateChecker.js
 *
 * Checks Supabase on app launch for a newer build.
 * If found, shows an alert with a download link.
 * If force_update is true, the alert cannot be dismissed.
 */

import { Alert, Linking } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import { getAppVersionShort } from '../src/constants';

const BETA_URL = process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
const BETA_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;

const beta = createClient(BETA_URL, BETA_KEY);

export async function checkForUpdate() {
  try {
    // Read betaBuild embedded by release.js into app.json extra before each EAS build.
    // Constants.expoConfig?.android?.versionCode is NOT reliable at runtime —
    // EAS manages versionCode remotely and it doesn't get baked in.
    const installedBuild =
      Constants.expoConfig?.extra?.betaBuild ||
      Constants.manifest2?.extra?.expoClient?.extra?.betaBuild ||
      Constants.manifest?.extra?.betaBuild ||
      0;

    console.log(`[UpdateChecker] Checking for updates... (Installed Build: ${installedBuild})`);

    // Fetch latest config from Supabase
    const { data, error } = await beta
      .from('app_config')
      .select('current_build, apk_url, update_message, force_update')
      .eq('id', 1)
      .single();

    if (error) {
      console.warn('[UpdateChecker] Supabase error:', error.message);
      return;
    }

    if (!data) {
      console.warn('[UpdateChecker] No config found for ID 1');
      return;
    }

    const { current_build, apk_url, update_message, force_update } = data;

    console.log(`[UpdateChecker] Local: ${installedBuild}, Remote: ${current_build}`);

    // If supbase says 20008 and you are on 20008, no popup.
    // To TEST the popup, set Supabase to 20009.
    if (!current_build || Number(installedBuild) >= Number(current_build)) {
      console.log('[UpdateChecker] App is up to date.');
      return;
    }

    console.log('[UpdateChecker] Showing update popup!');

    // Build the alert
    const title   = '🔴 Update Available';
    const message = update_message ||
      `A new build of LeadLens is ready.\n\nYou are on ${getAppVersionShort()}. Please download and install the latest version to continue testing.`;

    const buttons = [
      {
        text: 'Download Now',
        onPress: () => {
          if (apk_url) Linking.openURL(apk_url);
        },
      },
    ];

    // Only allow dismiss if not a force update
    if (!force_update) {
      buttons.unshift({ text: 'Later', style: 'cancel' });
    }

    Alert.alert(title, message, buttons, {
      cancelable: !force_update,
    });

  } catch (_) {
    // Never interrupt the app
  }
}

export default { checkForUpdate };
