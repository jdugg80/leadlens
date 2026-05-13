import 'react-native-url-polyfill/auto';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { createSupabaseClient } from './supabaseClient';

// Ensure WebBrowser completion is registered
WebBrowser.maybeCompleteAuthSession();

// Stable auth redirect generation
const AUTH_REDIRECT_URL = makeRedirectUri({
  scheme: 'leadlens',
  path: 'auth/callback',
});

const AUTH_RESET_URL = makeRedirectUri({
  scheme: 'leadlens',
  path: 'auth/reset-password',
});

console.log('OAUTH_REDIRECT_URL', AUTH_REDIRECT_URL);

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

  if (error) {
    console.error('AUTH_ERROR_SIGNIN', error.message);
    return { ok: false, reason: error.message };
  }
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

  if (error) {
    console.error('AUTH_ERROR_SIGNUP', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true, session: data.session, user: data.user };
}

export async function sendPasswordReset(settings, email) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: AUTH_RESET_URL,
  });

  if (error) {
    console.error('AUTH_ERROR_RESET', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

function parseCallbackUrl(url) {
  const queryString = url.includes("?")
    ? url.split("?")[1]?.split("#")[0]
    : "";

  const hashString = url.includes("#") ? url.split("#")[1] : "";

  const queryParams = Object.fromEntries(new URLSearchParams(queryString));
  const hashParams = Object.fromEntries(new URLSearchParams(hashString));

  const params = {
    ...queryParams,
    ...hashParams,
  };

  return {
    access_token: params.access_token,
    refresh_token: params.refresh_token,
    code: params.code,
    error: params.error,
    error_code: params.error_code,
    error_description: params.error_description,
  };
}

export async function signInWithOAuthProvider(settings, provider) {
  const supabase = createSupabaseClient(settings);
  if (!supabase) return { ok: false, reason: 'Missing Supabase URL or anon key.' };

  if (provider === 'google') console.log('OAUTH_START_GOOGLE');
  if (provider === 'azure') console.log('OAUTH_START_MICROSOFT');

  const redirectTo = AUTH_REDIRECT_URL;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: provider === 'azure' ? 'openid profile email' : undefined,
      queryParams:
        provider === 'azure'
          ? { prompt: 'select_account' }
          : undefined,
    },
  });

  if (error || !data?.url) {
    console.error('OAUTH_ERROR_URL_GEN', error?.message);
    return { ok: false, reason: error?.message || 'Could not create OAuth URL.' };
  }

  try {
    await WebBrowser.warmUpAsync();
  } catch {}

  try {
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    console.log('OAUTH_RESULT_TYPE', result.type);

    if (result.type !== 'success' || !result.url) {
      return {
        ok: false,
        reason:
          result.type === 'cancel'
            ? 'Sign-in cancelled.'
            : `OAuth did not return to app correctly (${result.type}).`,
      };
    }

    const {
      access_token,
      refresh_token,
      code,
      error: oauthError,
      error_code,
      error_description,
    } = parseCallbackUrl(result.url);

    if (oauthError || error_code || error_description) {
      const raw = String(error_description || error_code || oauthError || 'OAuth failed').replace(/\+/g, ' ');
      let cleanDescription = raw;
      try {
        cleanDescription = decodeURIComponent(raw);
      } catch {
        /* invalid % sequences from providers should not crash the app */
      }

      console.error('OAUTH_ERROR_CALLBACK', cleanDescription);
      return {
        ok: false,
        reason: cleanDescription,
      };
    }

    if (code) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.exchangeCodeForSession(code);

      if (sessionError) {
        console.error('OAUTH_ERROR_EXCHANGE', sessionError.message);
        return { ok: false, reason: sessionError.message };
      }

      console.log('OAUTH_SESSION_CREATED', 'via code');
      return {
        ok: true,
        session: sessionData.session,
        user: sessionData.user,
      };
    }

    if (access_token && refresh_token) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

      if (sessionError) {
        console.error('OAUTH_ERROR_SET_SESSION', sessionError.message);
        return { ok: false, reason: sessionError.message };
      }

      console.log('OAUTH_SESSION_CREATED', 'via token');
      return {
        ok: true,
        session: sessionData.session,
        user: sessionData.user,
      };
    }

    console.error('OAUTH_ERROR_NO_CREDENTIALS');
    return {
      ok: false,
      reason: `Unable to exchange credentials. URL was: ${result.url}`,
    };
  } catch (err) {
    console.error('OAUTH_ERROR_EXCEPTION', err.message);
    return { ok: false, reason: err.message };
  } finally {
    try {
      await WebBrowser.coolDownAsync();
    } catch {}
  }
}
