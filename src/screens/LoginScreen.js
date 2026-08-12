import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, KeyboardAvoidingView,
  Platform, Image, Animated, Pressable, Dimensions,
} from 'react-native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import {
  AUTH_PROFILE_KEY, COLORS, LEADS_STORAGE_KEY, LEADS_BACKUP_KEY,
  LEGAL_ACCEPTANCE_KEY, PRIVACY_POLICY_VERSION, ROLES, SUPABASE_SETTINGS_KEY,
  TERMS_VERSION, USER_STORAGE_KEY, DISABLED_USERS_KEY,
} from '../constants';
import { PrimaryButton } from '../components/UI';
import { AntDesign } from '@expo/vector-icons';
import {
  sendPasswordReset, signInWithEmailPassword,
  signInWithOAuthProvider, signUpWithEmailPassword,
  getAuthRedirectUrl,
} from '../utils/auth';
import { createSupabaseClient } from '../utils/supabaseClient';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';

import * as LocalAuthentication from 'expo-local-authentication';
import { registerPushToken } from '../utils/pushNotifications';

import BetaTracker from '../../utils/betaTracker';
import Constants from 'expo-constants';

import { syncProspectsFromSupabase, syncUserSettingsFromSupabase, syncAllDataToSupabase } from '../utils/backendSync';

// ── Responsive logo sizing ──────────────────────────────────────────────────
// The logo image is 1522x546 (aspect ratio ~2.79:1). Calculate dimensions
// so the logo occupies ~28% of screen height, clamped between 56–120px to
// stay legible on small phones without dominating tablets.
const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const LOGO_ASPECT = 1522 / 546; // ≈ 2.79
const LOGO_H_RAW = Math.round(SCREEN_H * 0.28);
const LOGO_H = Math.max(56, Math.min(120, LOGO_H_RAW));
const LOGO_W = Math.round(LOGO_H * LOGO_ASPECT);
const LOGO_WRAP_MB = Math.max(10, Math.round(SCREEN_H * 0.018));
const LOGO_ACCENT_W = Math.max(120, Math.min(280, Math.round(SCREEN_W * 0.65)));

async function ensureAuthenticatedClient(client, maxAttempts = 3) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data: { session } } = await client.auth.getSession();
    if (session) return; // Session loaded, ready to use
    if (i < maxAttempts - 1) await new Promise(r => setTimeout(r, 100));
  }
}

const REMEMBER_ME_KEY = '@leadlens_remember_me';
const BIOMETRIC_ENABLED_KEY = '@leadlens_biometric_enabled';
const PIN_LOGIN_ENABLED_KEY = '@leadlens_pin_login_enabled';
const USER_PIN_KEY = '@leadlens_user_pin';

function safeParseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[LoginScreen] Ignoring invalid stored JSON:', err?.message || String(err));
    return fallback;
  }
}

function hasAcceptedLegal(rawLegal) {
  const parsed = safeParseJson(rawLegal, null);
  return parsed?.privacyVersion === PRIVACY_POLICY_VERSION && parsed?.termsVersion === TERMS_VERSION;
}

function normalizeSavedProfile(saved) {
  if (!saved || typeof saved !== 'object') return null;
  const firstName = saved.firstName || '';
  const lastName = saved.lastName || '';
  return {
    ...saved,
    firstName,
    lastName,
    repName: saved.repName || `${firstName} ${lastName}`.trim(),
  };
}

const ROLE_OPTIONS = [
  { role: ROLES.ACCOUNT_MANAGER,  icon: '👤', desc: 'View and manage your own leads',              color: COLORS.accent },
  { role: ROLES.BRANCH_MANAGER,   icon: '🏢', desc: 'View all prospects for your branch',           color: COLORS.purple },
  { role: ROLES.REGIONAL_MANAGER, icon: '🌐', desc: 'View all prospects across all branches',        color: COLORS.success },
];

export default function LoginScreen({ navigation }) {
  const [step, setStep] = useState('role');
  const [selectedRole, setSelectedRole] = useState(null);
  const [authMode, setAuthMode] = useState('secure'); // BETA: forced to secure
  const [user, setUser] = useState({
    repName: '', firstName: '', lastName: '', repEmail: '', employeeNum: '', branchNum: '', territory: '', role: '', authProvider: 'local',
  });
  const [supabaseSettings, setSupabaseSettings] = useState({ supabaseUrl: '', supabaseAnonKey: '' });
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [disabledUsers, setDisabledUsers] = useState({});
  const [lastError, setLastError] = useState(null);

  // Press feedback states
  const [googlePressed, setGooglePressed] = useState(false);
  const [microsoftPressed, setMicrosoftPressed] = useState(false);

  const [rememberMe, setRememberMe] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showPinInput, setShowPinInput] = useState(false);

  // Entrance animation
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // OAuth Press scaling animations
  const googleScale = useRef(new Animated.Value(1)).current;
  const microsoftScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = (scaleAnim) => {
    Animated.spring(scaleAnim, {
      toValue: 0.93,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = (scaleAnim) => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      friction: 4,
      tension: 40,
    }).start();
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const [compatible, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (alive) setHasBiometrics(!!compatible && !!enrolled);
      } catch (err) {
        console.warn('[LoginScreen] Biometric capability check failed:', err?.message || String(err));
        if (alive) {
          setHasBiometrics(false);
          setBiometricEnabled(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, [step]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        // Use sync API for instant login screen data load
        const raw = AsyncStorage.getSync(USER_STORAGE_KEY);
        const legal = AsyncStorage.getSync(LEGAL_ACCEPTANCE_KEY);
        const supa = AsyncStorage.getSync(SUPABASE_SETTINGS_KEY);
        const authProfile = AsyncStorage.getSync(AUTH_PROFILE_KEY);
        const disabledRaw = AsyncStorage.getSync(DISABLED_USERS_KEY);
        const remember = AsyncStorage.getSync(REMEMBER_ME_KEY);
        const bio = AsyncStorage.getSync(BIOMETRIC_ENABLED_KEY);
        const pinEn = AsyncStorage.getSync(PIN_LOGIN_ENABLED_KEY);

        if (!alive) return;

        const parsedSupa = safeParseJson(supa, null);
        const parsedDisabled = safeParseJson(disabledRaw, null);
        const parsedAuthProfile = safeParseJson(authProfile, null);
        const saved = normalizeSavedProfile(safeParseJson(raw, null));

        if (parsedSupa) setSupabaseSettings(parsedSupa);
        if (parsedDisabled) setDisabledUsers(parsedDisabled || {});
        if (remember) setRememberMe(remember === 'true');
        if (bio) setBiometricEnabled(bio === 'true');
        if (pinEn) setPinEnabled(pinEn === 'true');

        if (parsedAuthProfile) {
          setAuthEmail(parsedAuthProfile?.email || '');
          setUser(prev => ({
            ...prev,
            repEmail: parsedAuthProfile?.email || prev.repEmail,
            authProvider: parsedAuthProfile?.provider || prev.authProvider,
          }));
        }

        if (!saved) return;

        if (remember === 'true' && (bio === 'true' || pinEn === 'true')) {
          if (bio === 'true') {
            try {
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Login to LeadLens',
                fallbackLabel: 'Use PIN',
              });
              if (result?.success) {
                proceedWithUser(saved, legal);
                return;
              }
            } catch (err) {
              console.warn('[LoginScreen] Biometric login failed safely:', err?.message || String(err));
            }
          }
          if (pinEn === 'true') setShowPinInput(true);
        }

        if (!alive) return;
        setUser(prev => ({ ...prev, ...saved }));
        if (saved.role) setSelectedRole(saved.role);

        const profileComplete = !!(saved.employeeNum && saved.role && saved.firstName && saved.lastName);

        if (profileComplete) {
          // Check for an active Supabase session — OAuth sessions auto-refresh,
          // so if one exists we can skip straight to Dashboard without asking
          // the user to click through their profile again.
          const supabase = createSupabaseClient(parsedSupa || {});
          let hasActiveSession = false;

          if (supabase) {
            try {
              const { data: { user: authUser } } = await supabase.auth.getUser();
              if (authUser) {
                hasActiveSession = true;

                // Beta access check — always verify regardless of remember flag
                const userEmail = authUser.email || saved.repEmail;
                const { data: tester } = await supabase
                  .from('beta_testers')
                  .select('is_active')
                  .eq('email', userEmail.toLowerCase().trim())
                  .single();

                if (!tester?.is_active) {
                  console.log('[LoginScreen] Beta check failed on resume');
                  await supabase.auth.signOut();
                  showThemedAlert('Beta Access Required', 'Your beta access is not active.');
                  return;
                }
              }
            } catch (err) {
              console.warn('[LoginScreen] Session check failed:', err?.message);
            }
          }

          if (hasActiveSession || remember === 'true') {
            // Active session or explicit remember — go straight to Dashboard
            proceedWithUser(saved, legal);
          } else {
            // No active session, no remember — show role/profile to re-authenticate
            setStep(saved.role ? 'profile' : 'role');
          }
        } else if (saved.role) {
          setStep('profile');
        }
      } catch (err) {
        console.warn('[LoginScreen] Stored login bootstrap failed safely:', err?.message || String(err));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const proceedWithUser = (savedProfile, legalRaw) => {
    const accepted = hasAcceptedLegal(legalRaw);
    navigation.replace(accepted ? 'Dashboard' : 'Consent', { user: savedProfile });
  };

  const getDisabledEntry = (email) => {
    const key = String(email || '').trim().toLowerCase();
    return key ? disabledUsers?.[key] || null : null;
  };

  const assertEnabled = (email) => {
    const disabled = getDisabledEntry(email);
    if (!disabled) return true;
    const msg = disabled.reason
      ? `This account is disabled. Reason: ${disabled.reason}`
      : 'This account is disabled. Contact management to restore access.';
    setLastError(msg);
    showThemedAlert('Account disabled', msg);
    return false;
  };

  const update = (key, val) => setUser(p => ({ ...p, [key]: val }));

  const ensureSupabase = () => {
    const supabase = createSupabaseClient(supabaseSettings || {});
    if (supabase) return true;
    const msg = 'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, or save the URL and anon key in Settings first.';
    setLastError(msg);
    showThemedAlert('Missing Supabase setup', msg);
    return false;
  };

  const afterSecureAuth = async (profile) => {
    const email = profile?.email || user.repEmail || authEmail;
    if (!assertEnabled(email)) return;

    // Beta Access Check
    try {
      const supabase = createSupabaseClient(supabaseSettings);
      if (supabase) {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          // Check beta_testers table for the user's email
          const { data: tester, error: testerError } = await supabase
            .from('beta_testers')
            .select('is_active')
            .eq('email', email.toLowerCase().trim())
            .single();

          if (testerError || !tester?.is_active) {
            console.log('[LoginScreen] Beta access denied for:', email);
            await supabase.auth.signOut();
            showThemedAlert('Beta Access Required', 'Your beta access is not active. Please contact support.');
            return;
          }

          // Also update profile beta_status for consistency if needed
          await supabase.from('profiles').update({ beta_status: 'active' }).eq('id', authUser.id);
        }
      }
    } catch (err) {
      console.warn('[LoginScreen] Beta check failed:', err.message);
    }

    const nextUser = {
      ...user,
      repEmail: email,
      authProvider: profile?.provider || user.authProvider || 'supabase',
    };

    // Auto-fill from local storage if exists
    const rawSaved = await AsyncStorage.getItem(USER_STORAGE_KEY);
    const saved = safeParseJson(rawSaved, null);
    if (saved && saved.firstName && saved.role) {
      // Preserve the auth email — old saved user may have a different repEmail
      setUser({ ...nextUser, ...saved, repEmail: email });
      setSelectedRole(saved.role);
    } else {
      setUser(nextUser);
    }

    if (email) setAuthEmail(email);

    // Re-init BetaTracker with confirmed email so session_start gets the right email.
    // Without this, session_start fires from App.js before login with NULL email.
    try {
      await BetaTracker.init(email);
    } catch (_) {}

    // Multi-tenancy fix: If user changed, clear local leads before pulling
    const lastAuth = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
    const lastEmail = lastAuth ? JSON.parse(lastAuth).email : null;
    if (lastEmail && lastEmail.toLowerCase() !== email.toLowerCase()) {
      console.log('[Login] User changed, clearing local leads bucket');
      await AsyncStorage.removeItem(LEADS_STORAGE_KEY);
    }

    if (profile?.email) await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify({ email: profile.email, provider: profile.provider }));

    // Pull from Supabase only when local queue is empty (e.g. fresh install / rebuild).
    // This prevents overwriting locally-captured prospects on every login.
    try {
      const localRaw = await AsyncStorage.getItem(LEADS_STORAGE_KEY).catch((err) => {
        console.warn('[Login] Failed to read local leads:', err?.message || String(err));
        return null;
      });
      let localLeads = localRaw ? JSON.parse(localRaw) : [];

      // Restore from logout backup if local queue is empty. clearUserSession()
      // copies @leadlens_leads → @leadlens_leads_backup before wiping so that
      // re-login can restore the user's previous queue without a full pull.
      if (!localLeads.length) {
        const backupRaw = await AsyncStorage.getItem(LEADS_BACKUP_KEY).catch((err) => {
          console.warn('[Login] Failed to read logout backup:', err?.message || String(err));
          return null;
        });
        if (backupRaw) {
          const backupLeads = JSON.parse(backupRaw);
          if (backupLeads.length) {
            console.log(`[Login] Restoring ${backupLeads.length} prospects from logout backup`);
            await AsyncStorage.setItem(LEADS_STORAGE_KEY, backupRaw);
            localLeads = backupLeads;
          }
          // Clean up the backup after restore
          await AsyncStorage.removeItem(LEADS_BACKUP_KEY).catch((err) =>
            console.warn('[Login] Failed to clear logout backup:', err?.message || String(err))
          );
        }
      }

      if (!localLeads.length) {
        console.log('[Login] Local queue empty — pulling from Supabase');
        await syncProspectsFromSupabase(supabaseSettings);
      } else {
        console.log(`[Login] Local queue has ${localLeads.length} prospects — skipping pull sync`);
      }
      await syncUserSettingsFromSupabase(supabaseSettings);
    } catch (err) {
      console.warn('[Login] Pull sync failed:', err.message);
    }

    setAuthMode('local');

    // If we have all profile info, we can go straight to the Enter button
    if (saved?.firstName && saved?.lastName && saved?.role) {
       setStep('profile');
    } else {
       setStep('role');
    }

    showThemedAlert('Signed in', 'Your profile has been restored.');
  };

  const runEmailSignIn = async (kind = 'signin') => {
    setLastError(null);
    if (!ensureSupabase() || !assertEnabled(authEmail)) return;
    if (!authEmail.trim() || !authPassword) {
      showThemedAlert('Missing credentials', 'Enter your email and password first.');
      return;
    }
    setAuthBusy(true);
    try {
      console.log(`[Login] Attempting ${kind} for:`, authEmail);
      const result = kind === 'signup'
        ? await signUpWithEmailPassword(supabaseSettings, authEmail, authPassword)
        : await signInWithEmailPassword(supabaseSettings, authEmail, authPassword);

      if (!result.ok) {
        console.error(`[Login] ${kind} failed! Full response:`, JSON.stringify(result, null, 2));
        setLastError(result.reason);

        // Specific help for common Supabase issues
        let userMsg = result.reason || 'Unknown issue';
        if (userMsg.includes('Database error saving new user')) {
          userMsg = 'The server encountered an error creating your profile. This usually means a database trigger is failing. Please contact the administrator.';
        } else if (userMsg.includes('Email not confirmed')) {
          userMsg = 'Please check your inbox to confirm your email before signing in.';
        }

        showThemedAlert(kind === 'signup' ? 'Sign-up failed' : 'Sign-in failed', userMsg);
        return;
      }

      console.log(`[Login] ${kind} success for UID:`, result.user?.id);
      await afterSecureAuth({ email: result.user?.email || authEmail, provider: 'email' });
    } catch (err) {
      console.error(`[Login] ${kind} exception:`, err);
      showThemedAlert('System Error', err.message);
    } finally { setAuthBusy(false); }
  };

  const runProviderSignIn = async (provider) => {
    setLastError(null);
    if (!ensureSupabase()) return;
    setAuthBusy(true);
    try {
      console.log(`[Login] Attempting OAuth:`, provider);
      const result = await signInWithOAuthProvider(supabaseSettings, provider);

      if (!result.ok) {
        console.error(`[Login] OAuth failed for ${provider}:`, JSON.stringify(result, null, 2));
        setLastError(result.reason);
        showThemedAlert('Sign-in failed', result.reason || 'Please try again or contact support.');
        return;
      }

      console.log(`[Login] OAuth success for:`, result.user?.email);
      const rawSavedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
      const savedUser = normalizeSavedProfile(safeParseJson(rawSavedUser, null));
      const routeToDashboard = savedUser?.employeeNum && savedUser?.role && savedUser?.firstName && savedUser?.lastName;

      if (routeToDashboard) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Dashboard', params: { user: savedUser } }],
        });
        return;
      }

      await afterSecureAuth({ email: result.user?.email || authEmail || user.repEmail, provider });
    } catch (err) {
      console.error(`[Login] OAuth exception:`, err);
      showThemedAlert('System Error', err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    setLastError(null);
    if (!ensureSupabase()) return;
    if (!authEmail.trim()) { showThemedAlert('Need an email', 'Enter the user email first.'); return; }
    const result = await sendPasswordReset(supabaseSettings, authEmail.trim());
    if (!result.ok) {
      setLastError(result.reason);
      showThemedAlert('Reset failed', result.reason || 'Unknown issue');
    } else {
      showThemedAlert('Reset sent', 'Check your inbox and spam folder.');
    }
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setUser(p => ({ ...p, role }));
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    setStep('profile');
  };

  // Force secure auth for Beta
  const isAuthed = !!authEmail;
  const canLogin = isAuthed && user.firstName && user.lastName && user.role;

  const handleLogin = async () => {
    setLastError(null);

    if (!isAuthed) {
      showThemedAlert('Secure Login Required', 'Please sign in with Google, Microsoft, or Email first to enable cloud syncing.');
      setStep('role');
      return;
    }
    const firstName = String(user.firstName || '').trim();
    const lastName = String(user.lastName || '').trim();
    if (!firstName || !lastName) {
      showThemedAlert('Complete your profile', 'Enter your first and last name before continuing.');
      return;
    }

    const payload = {
      ...user,
      repEmail: user.repEmail || authEmail,
      firstName,
      lastName,
      repName: String(`${firstName} ${lastName}`).trim(),
    };
    if (!assertEnabled(payload.repEmail)) return;

    try {
      if (payload.repEmail) {
        BetaTracker.setEmail(payload.repEmail);
        await BetaTracker.track('login', {
          screen: 'Login',
          feature: 'auth',
          status: payload.authProvider || 'unknown',
        }).catch(err => {
          console.warn('[LoginScreen] BetaTracker login track failed:', err?.message || String(err));
        });
      }

      await Promise.all([
        AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(payload)),
        AsyncStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false'),
        AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, biometricEnabled ? 'true' : 'false'),
        AsyncStorage.setItem(PIN_LOGIN_ENABLED_KEY, pinEnabled ? 'true' : 'false'),
      ]);

      if (pinEnabled && pinInput) {
        await AsyncStorage.setItem(USER_PIN_KEY, pinInput);
      }

      const rawLegal = await AsyncStorage.getItem(LEGAL_ACCEPTANCE_KEY);
      const accepted = hasAcceptedLegal(rawLegal);

      try {
        const supabaseClient = createSupabaseClient(supabaseSettings);
        if (supabaseClient) {
          await ensureAuthenticatedClient(supabaseClient);
          const { data: { user: authUser } } = await supabaseClient.auth.getUser();
          if (authUser?.id) {
            // Capture token so we can report it to Scarlett for manual push support
            const pushToken = await registerPushToken(authUser.id).catch(() => null);

            // Report current build + push token to Scarlett beta_testers table
            // This powers the "current build" column in the admin portal
            if (payload.repEmail) {
              const SCARLETT_URL = process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
              const SCARLETT_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
              const buildNum = parseInt(Constants.nativeBuildVersion || '0', 10);
              fetch(
                `${SCARLETT_URL}/rest/v1/beta_testers?email=eq.${encodeURIComponent(payload.repEmail.toLowerCase().trim())}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type':  'application/json',
                    'apikey':         SCARLETT_KEY,
                    'Authorization': `Bearer ${SCARLETT_KEY}`,
                    'Prefer':        'return=minimal',
                  },
                  body: JSON.stringify({
                    current_build: buildNum || null,
                    last_seen_at:  new Date().toISOString(),
                    push_token:    pushToken || null,
                  }),
                }
              ).catch(err => console.warn('[LoginScreen] Scarlett build report failed:', err?.message));
            }

            // Update profile and onboarding tracking
            await Promise.all([
              supabaseClient.from('profiles').upsert({
                id: authUser.id,
                email: payload.repEmail,
                rep_name: payload.repName,
                role: payload.role,
                branch_num: payload.branchNum,
                employee_num: payload.employeeNum,
                updated_at: new Date().toISOString()
              }),
              supabaseClient.from('onboarding_profiles').upsert({
                user_id: authUser.id,
                data: payload,
                completed_at: new Date().toISOString()
              })
            ]).catch(err => console.warn('[LoginScreen] Supabase profile sync failed:', err.message));
          }
        }
      } catch (err) {
        console.warn('[LoginScreen] Post-login sync failed:', err.message);
      }

      navigation.replace(accepted ? 'Dashboard' : 'Consent', { user: payload });
    } catch (err) {
      console.warn('[LoginScreen] Login profile save failed:', err?.message || String(err));
      setLastError(err.message);
      showThemedAlert('Login failed', 'LeadLens could not save your profile locally. Restart the app and try again.');
    }
  };

  // ── DEBUG PANEL ─────────────────────────────────────────────────
  const resetAppConfig = async () => {
    await AsyncStorage.removeItem(SUPABASE_SETTINGS_KEY);
    showThemedAlert('Config Reset', 'Custom Supabase settings cleared. Restart the app to use .env values.');
  };

  const renderDebugPanel = () => {
    if (!__DEV__) return null;
    const projectRef = supabaseSettings.supabaseUrl?.split('//')?.[1]?.split('.')?.[0] || 'Unknown';
    return (
      <View style={s.debugPanel}>
        <Text style={s.debugTitle}>🛠 DEBUG PANEL</Text>
        <Text style={s.debugText}>Project ID: {projectRef}</Text>
        <Text style={s.debugText}>Session: {authEmail || 'No Active Session'}</Text>
        <Text style={s.debugText}>Last Error: {lastError || 'None'}</Text>
        <TouchableOpacity onPress={resetAppConfig} style={{ marginTop: 8, padding: 4, backgroundColor: 'rgba(255,0,0,0.2)', borderRadius: 4 }}>
          <Text style={[s.debugText, { color: '#ff4444', textAlign: 'center' }]}>RESET SUPABASE CONFIG</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── ROLE SELECTION STEP ──────────────────────────────────────────
  if (step === 'role') {
    return (
      <View style={s.root}>
      <ThemedAlertHost />
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={s.logoWrap}>
            <View style={s.logoBorder}>
              <Image source={require('../../assets/leadlens/LeadLens_header_logo_v4.png')} style={s.logoHeroImg} resizeMode="contain" />
            </View>
            <View style={s.logoAccentLine}>
              <View style={s.logoAccentL} /><View style={s.logoAccentR} />
            </View>
          </View>

          {/* BETA: Secure Login only — Quick Login disabled */}
          <View style={[s.modeRow, { justifyContent: 'center' }]}>
            <View style={[s.modeChip, s.modeChipOn, { flex: 0, paddingHorizontal: 32 }]}>
              <Text style={[s.modeChipText, s.modeChipTextOn]}>🔒 Secure Login</Text>
            </View>
          </View>

          {/* Secure auth panel */}
          {authMode === 'secure' && (
            <View style={s.authPanel}>
              <View style={s.authPanelCornerTL} /><View style={s.authPanelCornerBR} />
              <Text style={s.authTitle}>Secure Sign-In</Text>
              <Text style={s.authSub}>Supabase authenticated sign-in with Google or Microsoft.</Text>
              <View style={s.providerRow}>
                {/* Google Button */}
                <Pressable
                  onPressIn={() => setGooglePressed(true)}
                  onPressOut={() => setGooglePressed(false)}
                  onPress={() => runProviderSignIn('google')}
                  disabled={authBusy}
                  style={[
                    s.providerIconBtn,
                    googlePressed && {
                      transform: [{ scale: 0.90 }],
                      opacity: 0.82,
                      backgroundColor: COLORS.borderLit,
                      borderColor: COLORS.accent,
                    }
                  ]}
                >
                  <Image
                    source={{ uri: 'https://www.google.com/images/branding/googleg/1x/googleg_standard_color_128dp.png' }}
                    style={{ width: 32, height: 32 }}
                    resizeMode="contain"
                  />
                  <Text style={s.providerBtnLabel}>Google</Text>
                </Pressable>

                {/* Microsoft Button */}
                <Pressable
                  onPressIn={() => setMicrosoftPressed(true)}
                  onPressOut={() => setMicrosoftPressed(false)}
                  onPress={() => runProviderSignIn('azure')}
                  disabled={authBusy}
                  style={[
                    s.providerIconBtn,
                    microsoftPressed && {
                      transform: [{ scale: 0.90 }],
                      opacity: 0.82,
                      backgroundColor: COLORS.borderLit,
                      borderColor: COLORS.accent2,
                    }
                  ]}
                >
                  {/* Official Microsoft 4-Square Colored Logo */}
                  <View style={{ width: 30, height: 30, flexDirection: 'row', flexWrap: 'wrap', gap: 2, alignContent: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 14, height: 14, backgroundColor: '#F25022' }} />
                    <View style={{ width: 14, height: 14, backgroundColor: '#7FBA00' }} />
                    <View style={{ width: 14, height: 14, backgroundColor: '#00A4EF' }} />
                    <View style={{ width: 14, height: 14, backgroundColor: '#FFB900' }} />
                  </View>
                  <Text style={[s.providerBtnLabel, { marginTop: 14 }]}>Microsoft</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Role selection */}
          <View style={s.sectionRow}>
            <View style={s.sectionPip} />
            <Text style={s.sectionLabel}>Select Your Role</Text>
            <View style={s.sectionLine} />
          </View>

          {ROLE_OPTIONS.map(({ role, icon, desc, color }) => (
            <TouchableOpacity
              key={role}
              style={[s.roleCard, { borderColor: color + '50' }]}
              onPress={() => handleRoleSelect(role)}
              activeOpacity={0.75}
            >
              {/* Left color bar */}
              <View style={[s.roleBar, { backgroundColor: color }]} />
              <View style={[s.roleIconWrap, { backgroundColor: color + '20' }]}>
                <Text style={s.roleIcon}>{icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.roleTitle}>{role}</Text>
                <Text style={s.roleDesc}>{desc}</Text>
              </View>
              <Text style={[s.roleArrow, { color }]}>›</Text>
              {/* Corner accents */}
              <View style={[s.roleCornTL, { borderColor: color + '60' }]} />
              <View style={[s.roleCornBR, { borderColor: color + '60' }]} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── PROFILE STEP ─────────────────────────────────────────────────
  const roleOpt   = ROLE_OPTIONS.find(r => r.role === selectedRole);
  const roleColor = roleOpt?.color || COLORS.accent;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ThemedAlertHost />
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={s.logoWrap}>
          <Image source={require('../../assets/leadlens/LeadLens_header_logo_v4.png')} style={s.logoProfileImg} resizeMode="contain" />
        </View>

        {/* Role badge */}
        <TouchableOpacity
          style={[s.roleBadge, { borderColor: roleColor + '55', backgroundColor: roleColor + '10' }]}
          onPress={() => { fadeAnim.setValue(0); slideAnim.setValue(30); setStep('role'); }}
        >
          <View style={[s.roleBadgeDot, { backgroundColor: roleColor }]} />
          <Text style={[s.roleBadgeText, { color: roleColor }]}>{roleOpt?.icon} {selectedRole}</Text>
          <Text style={[s.roleBadgeChange, { color: roleColor }]}>Change ›</Text>
        </TouchableOpacity>

        {!!authEmail && (
          <View style={s.authHint}>
            <Text style={s.authHintText}>🔒 Secure auth: {authEmail}</Text>
          </View>
        )}

        {/* Profile form */}
        <Animated.View style={[s.formCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={s.formCornerTL} /><View style={s.formCornerBR} />

          <View style={s.sectionRow}>
            <View style={[s.sectionPip, { backgroundColor: roleColor }]} />
            <Text style={s.sectionLabel}>Your Profile</Text>
            <View style={s.sectionLine} />
          </View>

          <View style={s.fieldRow}>
            <Field label="First Name" placeholder="First" containerStyle={{ flex: 1 }} value={user.firstName} onChangeText={v => update('firstName', v)} color={roleColor} />
            <View style={{ width: 12 }} />
            <Field label="Last Name" placeholder="Last" containerStyle={{ flex: 1 }} value={user.lastName} onChangeText={v => update('lastName', v)} color={roleColor} />
          </View>
          <Field label="Rep Email" placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" value={user.repEmail || authEmail} onChangeText={v => update('repEmail', v)} color={roleColor} />

          <View style={s.fieldRow}>
            <Field label="Employee # (Optional)" placeholder="e.g. 6992986" containerStyle={{ flex: 1 }} value={user.employeeNum} onChangeText={v => update('employeeNum', v)} color={roleColor} />
            {selectedRole !== ROLES.REGIONAL_MANAGER && (
              <>
                <View style={{ width: 12 }} />
                <Field label="Branch / Dept / Team" placeholder="e.g. 686 or Sales" containerStyle={{ flex: 1 }} value={user.branchNum} onChangeText={v => update('branchNum', v)} color={roleColor} />
              </>
            )}
          </View>

          {selectedRole === ROLES.REGIONAL_MANAGER && (
            <Field label="Region / Market" placeholder="e.g. Gulf Coast" value={user.territory} onChangeText={v => update('territory', v)} color={roleColor} />
          )}
          {selectedRole === ROLES.ACCOUNT_MANAGER && (
            <Field label="Territory (optional)" placeholder="e.g. Houston South" value={user.territory} onChangeText={v => update('territory', v)} color={roleColor} />
          )}

          {/* Remember Me & Security */}
          <View style={s.securitySection}>
            <TouchableOpacity
              style={s.checkRow}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[s.checkbox, rememberMe && s.checkboxOn]}>
                {rememberMe && <Text style={s.checkTick}>✓</Text>}
              </View>
              <Text style={s.checkLabel}>Remember Me</Text>
            </TouchableOpacity>

            {rememberMe && (
              <View style={s.securityOptions}>
                {hasBiometrics && (
                  <TouchableOpacity
                    style={s.checkRow}
                    onPress={() => setBiometricEnabled(!biometricEnabled)}
                  >
                    <View style={[s.checkbox, biometricEnabled && s.checkboxOn]}>
                      {biometricEnabled && <Text style={s.checkTick}>✓</Text>}
                    </View>
                    <Text style={s.checkLabel}>Enable Biometric Login</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={s.checkRow}
                  onPress={() => setPinEnabled(!pinEnabled)}
                >
                  <View style={[s.checkbox, pinEnabled && s.checkboxOn]}>
                    {pinEnabled && <Text style={s.checkTick}>✓</Text>}
                  </View>
                  <Text style={s.checkLabel}>Enable PIN Login</Text>
                </TouchableOpacity>

                {pinEnabled && (
                  <Field
                    label="Setup Login PIN"
                    placeholder="4-8 digits"
                    value={pinInput}
                    onChangeText={setPinInput}
                    keyboardType="numeric"
                    secureTextEntry
                    maxLength={8}
                    color={roleColor}
                  />
                )}
              </View>
            )}
          </View>

          <PrimaryButton
            title={isAuthed ? "Enter LeadLens  ›" : "🔒 Sign In Required"}
            onPress={handleLogin}
            disabled={false}
            style={[{ marginTop: 8 }, !isAuthed && { opacity: 0.6 }]}
          />
          {!isAuthed && (
            <Text style={{ color: COLORS.accent2, fontSize: 11, textAlign: 'center', marginTop: 10, fontWeight: '700' }}>
              You must sign in securely to use LeadLens Beta.
            </Text>
          )}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Local Field component ──────────────────────────────────────────
function Field({ label, style, containerStyle, color, ...props }) {
  const focusAnim = useRef(new Animated.Value(0)).current;
  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.border, color || COLORS.accent],
  });
  return (
    <View style={[{ marginBottom: 14 }, containerStyle]}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Animated.View style={[s.fieldInputWrap, { borderColor }]}>
        <TextInput
          style={[s.fieldInput, style]}
          placeholderTextColor={COLORS.muted}
          onFocus={() => Animated.timing(focusAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start()}
          onBlur={() =>  Animated.timing(focusAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start()}
          {...props}
        />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 20, paddingBottom: 48 },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: LOGO_WRAP_MB, marginTop: 8 },
  logoBorder: {
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  logoHeroImg: { width: LOGO_W, height: LOGO_H },
  logoProfileImg: { width: '50%', maxWidth: 200, aspectRatio: LOGO_ASPECT },
  logoAccentLine: { flexDirection: 'row', width: LOGO_ACCENT_W, height: 2, marginTop: 8 },
  logoAccentL: { flex: 1, backgroundColor: COLORS.purple, opacity: 0.7 },
  logoAccentR: { flex: 1, backgroundColor: COLORS.accent2, opacity: 0.7 },

  // Mode toggle
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  modeChip: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface2, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center',
  },
  modeChipOn: { borderColor: COLORS.accent, backgroundColor: 'rgba(0,201,255,0.1)' },
  modeChipText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  modeChipTextOn: { color: COLORS.accent },

  // Auth panel
  authPanel: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 16, padding: 16, marginBottom: 20, position: 'relative', overflow: 'hidden',
  },
  authPanelCornerTL: {
    position: 'absolute', top: 0, left: 0, width: 14, height: 14,
    borderTopWidth: 2, borderLeftWidth: 2, borderColor: COLORS.accent, borderTopLeftRadius: 16,
  },
  authPanelCornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: 14, height: 14,
    borderBottomWidth: 2, borderRightWidth: 2, borderColor: COLORS.accent2, borderBottomRightRadius: 16,
  },
  authTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  authSub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  authLinks: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 10 },
  authLinkText: { color: COLORS.accent, fontWeight: '700', fontSize: 12 },
  authLinkSep: { color: COLORS.muted },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  providerIconBtn: {
    flex: 1,
    flexDirection: 'column',
    borderWidth: 1,
    borderColor: COLORS.borderLit,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  providerBtnLabel: {
    color: COLORS.textDim,
    fontWeight: '800',
    fontSize: 12,
    marginTop: 8,
  },

  // Section label
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14, marginTop: 4 },
  sectionPip: { width: 3, height: 14, borderRadius: 2, backgroundColor: COLORS.purple },
  sectionLabel: { fontSize: 10, fontWeight: '700', color: COLORS.label, letterSpacing: 1.8, textTransform: 'uppercase' },
  sectionLine: { flex: 1, height: 1, backgroundColor: COLORS.border },

  // Role cards
  roleCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderWidth: 1,
    borderRadius: 16, padding: 14, marginBottom: 12,
    overflow: 'hidden', position: 'relative',
  },
  roleBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  roleIconWrap: {
    width: 46, height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginRight: 14,
  },
  roleIcon: { fontSize: 22 },
  roleTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  roleDesc: { color: COLORS.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  roleArrow: { fontSize: 26, marginLeft: 10, fontWeight: '300' },
  roleCornTL: {
    position: 'absolute', top: 0, left: 0, width: 10, height: 10,
    borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 16,
  },
  roleCornBR: {
    position: 'absolute', bottom: 0, right: 0, width: 10, height: 10,
    borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 16,
  },

  // Role badge
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderWidth: 1, borderRadius: 14, marginBottom: 16,
  },
  roleBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  roleBadgeText: { flex: 1, fontSize: 14, fontWeight: '700' },
  roleBadgeChange: { fontSize: 12, fontWeight: '700' },

  authHint: {
    padding: 10, borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.22)',
    backgroundColor: 'rgba(0,201,255,0.07)',
    borderRadius: 10, marginBottom: 12,
  },
  authHintText: { color: COLORS.accent, fontWeight: '700', fontSize: 12 },

  // Form card
  formCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 18, padding: 18, position: 'relative', overflow: 'hidden',
  },
  formCornerTL: {
    position: 'absolute', top: 0, left: 0, width: 16, height: 16,
    borderTopWidth: 2, borderLeftWidth: 2, borderColor: COLORS.purple, borderTopLeftRadius: 18,
  },
  formCornerBR: {
    position: 'absolute', bottom: 0, right: 0, width: 16, height: 16,
    borderBottomWidth: 2, borderRightWidth: 2, borderColor: COLORS.accent2, borderBottomRightRadius: 18,
  },

  fieldRow: { flexDirection: 'row', alignItems: 'flex-start' },
  fieldLabel: {
    color: COLORS.label, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  fieldInputWrap: {
    borderWidth: 1, borderRadius: 10, backgroundColor: COLORS.surface2, overflow: 'hidden',
  },
  fieldInput: {
    paddingHorizontal: 14, paddingVertical: 13,
    color: COLORS.text, fontSize: 15,
  },

  // Security & Checkbox
  securitySection: {
    marginTop: 4,
    marginBottom: 16,
    gap: 12,
  },
  securityOptions: {
    marginLeft: 28,
    gap: 12,
    marginTop: 4,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.1)',
  },
  checkTick: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
  },
  checkLabel: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: '600',
  },
  debugPanel: {
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  debugTitle: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 4,
  },
  debugText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});
