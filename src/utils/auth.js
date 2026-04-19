import * as WebBrowser from 'expo-web-browser';
import { createSupabaseClient } from './supabaseClient';

WebBrowser.maybeCompleteAuthSession();

const AUTH_REDIRECT_URL = 'leadlens://auth/callback';
const AUTH_RESET_URL = 'leadlens://auth/reset-password';

export function getAuthRedirectUrl(path = 'callback') {
  if (path === 'reset-password') return AUTH_RESET_URL;
  return AUTH_REDIRECT_URL;
}

export async function signInWithEmailPassword(settings, email, password) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, session: data.session, user: data.user };
}

export async function signUpWithEmailPassword(settings, email, password) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: AUTH_REDIRECT_URL,
    },
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true, session: data.session, user: data.user };
}

export async function sendPasswordReset(settings, email) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: AUTH_RESET_URL,
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

function parseCallbackUrl(url = '') {
  try {
    const [base, hashPart] = url.split('#');
    const queryPart = base.includes('?') ? base.split('?')[1] : '';
    const hashParams = new URLSearchParams(hashPart || '');
    const queryParams = new URLSearchParams(queryPart || '');

    const access_token = hashParams.get('access_token') || queryParams.get('access_token');
    const refresh_token = hashParams.get('refresh_token') || queryParams.get('refresh_token');

    return { access_token, refresh_token };
  } catch {
    return { access_token: null, refresh_token: null };
  }
}

export async function signInWithOAuthProvider(settings, provider) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  const redirectTo = AUTH_REDIRECT_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return { ok: false, reason: error?.message || 'Could not create OAuth URL.' };
  }

  try {
    await WebBrowser.warmUpAsync();
  } catch {}

  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type !== 'success' || !result.url) {
      return {
        ok: false,
        reason:
          result.type === 'cancel'
            ? 'Sign-in cancelled.'
            : `OAuth did not return to app correctly (${result.type}).`,
      };
    }

    const { access_token, refresh_token } = parseCallbackUrl(result.url);

    if (!access_token || !refresh_token) {
      return { ok: false, reason: 'Auth callback did not include session tokens.' };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (sessionError) return { ok: false, reason: sessionError.message };

    return {
      ok: true,
      session: sessionData.session,
      user: sessionData.user,
    };
  } finally {
    try {
      await WebBrowser.coolDownAsync();
    } catch {}
  }
}