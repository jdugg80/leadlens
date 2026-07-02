/**
 * BetaTracker — LeadLens beta session & event tracker
 *
 * Writes to the `beta_events` table on Supabase, which feeds the
 * admin_activity_feed view visible in the Scarlett admin portal.
 *
 * Usage in screens:
 *   import BetaTracker from '../../utils/betaTracker';
 *   await BetaTracker.trackScreen('Dashboard');
 *   await BetaTracker.track('capture_lead', { screen: 'Capture', feature: 'gps' });
 *   await BetaTracker.trackError('Map failed to load', { screen: 'TerritoryMap' });
 */

import { storage as AsyncStorage } from '../src/utils/storage';

// ── Config ────────────────────────────────────────────────────────────────────
// Events are written to the SCARLETT project so the admin portal can read them.
// The LeadLens project (EXPO_PUBLIC_SUPABASE_URL) is for app data only.
const SUPABASE_URL      = process.env.SCARLETT_SUPABASE_URL || 'https://dlntgyhfxxbcwwcxaorn.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SCARLETT_ANON_KEY;
const EVENTS_TABLE      = 'beta_events';
const DEVICE_ID_KEY     = 'beta_tracker_device_id';
const USER_KEY          = '@leadlens_user'; // matches USER_STORAGE_KEY in src/constants/index.js

// ── Internal state ────────────────────────────────────────────────────────────
let _sessionId    = null;
let _sessionStart = null;
let _testerEmail  = null;
let _deviceId     = null;
let _ready        = false;
let _lastSessionStartTime = null; // debounce: prevents rapid duplicate session_start inserts

// ── Helpers ───────────────────────────────────────────────────────────────────
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

async function resolveDeviceId() {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return uuid(); // fallback — won't persist but won't crash
  }
}

async function resolveEmail() {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    if (raw) {
      const user = JSON.parse(raw);
      return user?.repEmail || user?.email || null;
    }
  } catch {}
  return null;
}

async function insert(row) {
  if (!SUPABASE_ANON_KEY) {
    console.warn('[BetaTracker] SUPABASE_ANON_KEY missing -- check EXPO_PUBLIC_SUPABASE_ANON_KEY in .env');
    return;
  }
  console.log('[BetaTracker] inserting:', row.event_name, '| email:', row.tester_email, '| target:', SUPABASE_URL.includes('dlntgyh') ? 'SCARLETT' : 'LEADLENS');
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${EVENTS_TABLE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':         SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify(row),
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[BetaTracker] insert failed -- status:', response.status, '| body:', text);
    } else {
      console.log('[BetaTracker] insert ok:', row.event_name);
    }
  } catch (err) {
    console.warn('[BetaTracker] network error:', err?.message || String(err));
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
const BetaTracker = {
  /**
   * Call at app startup and whenever the app returns to foreground.
   * Starts a new session and records a session_start event.
   *
   * @param {string} [email] - Pass the logged-in user's email if you have it.
   *   BetaTracker will also try to read it from AsyncStorage automatically.
   */
  async init(email) {
    // Guard: if a session is already active, don't create a duplicate
    if (_ready && _sessionId) {
      console.log('[BetaTracker] init() skipped — session already active:', _sessionId);
      return;
    }

    // Debounce: suppress duplicate session_start if last one was < 5 s ago
    // (protects against rapid active↔background cycling in dev-client / Fast Refresh)
    const now = Date.now();
    if (_lastSessionStartTime && (now - _lastSessionStartTime) < 5000) {
      console.log('[BetaTracker] init() skipped — too soon since last session_start');
      return;
    }

    // Refresh email — prefer the argument, fall back to stored value
    _testerEmail = email || (await resolveEmail()) || _testerEmail;
    _deviceId    = _deviceId || (await resolveDeviceId());
    _sessionId   = uuid();
    _sessionStart = now;
    _ready        = true;
    _lastSessionStartTime = now;

    await insert({
      session_id:   _sessionId,
      device_id:    _deviceId,
      tester_email: _testerEmail,
      event_name:   'session_start',
      event_type:   'session',
      source:       'app',
      severity:     'info',
      success:      true,
      created_at:   new Date().toISOString(),
    });
  },

  /**
   * Call when the app goes to background or the user logs out.
   * Records session duration and clears session state.
   */
  async endSession() {
    if (!_ready || !_sessionId) return;

    const duration = _sessionStart
      ? Math.round((Date.now() - _sessionStart) / 1000)
      : null;

    await insert({
      session_id:       _sessionId,
      device_id:        _deviceId,
      tester_email:     _testerEmail,
      event_name:       'session_end',
      event_type:       'session',
      source:           'app',
      severity:         'info',
      success:          true,
      duration_seconds: duration,
      created_at:       new Date().toISOString(),
    });

    _sessionId    = null;
    _sessionStart = null;
    _ready        = false;
  },

  /**
   * Record a screen view. Call from screen componentDidMount / useEffect.
   *
   * @param {string} screenName - e.g. 'Dashboard', 'Capture', 'TerritoryMap'
   */
  async trackScreen(screenName) {
    if (!_ready) return;
    await insert({
      session_id:   _sessionId,
      device_id:    _deviceId,
      tester_email: _testerEmail,
      event_name:   'screen_view',
      event_type:   'screen_view',
      screen:       screenName,
      severity:     'info',
      success:      true,
      source:       'app',
      metadata:     JSON.stringify({}),
      created_at:   new Date().toISOString(),
    });
  },

  /**
   * Record a generic interaction event.
   *
   * @param {string} eventName - e.g. 'capture_lead', 'export_csv', 'scan_card'
   * @param {object} opts
   * @param {string}  [opts.screen]   - Screen name
   * @param {string}  [opts.feature]  - Feature bucket (e.g. 'gps', 'ocr', 'territory')
   * @param {string}  [opts.status]   - Short status note (e.g. 'success', 'no_gps_permission')
   * @param {string}  [opts.severity] - 'info' | 'warning' | 'error' | 'critical'
   * @param {boolean} [opts.success]  - Whether the action succeeded
   * @param {object}  [opts.metadata] - Any extra key/value pairs
   */
  async track(eventName, {
    screen   = null,
    feature  = null,
    status   = null,
    severity = 'info',
    success  = true,
    metadata = {},
  } = {}) {
    if (!_ready) return;
    await insert({
      session_id:   _sessionId,
      device_id:    _deviceId,
      tester_email: _testerEmail,
      event_name:   eventName,
      event_type:   'interaction',
      screen,
      feature,
      status,
      severity,
      success,
      source:       'app',
      metadata:     JSON.stringify(metadata || {}),
      created_at:   new Date().toISOString(),
    });
  },

  /**
   * Record an error or crash. Automatically sets severity=error and success=false.
   *
   * @param {string} message  - Error message or description
   * @param {object} opts     - Same shape as track() opts
   */
  async trackError(message, {
    screen   = null,
    feature  = null,
    metadata = {},
  } = {}) {
    if (!_ready) return;
    await insert({
      session_id:   _sessionId,
      device_id:    _deviceId,
      tester_email: _testerEmail,
      event_name:   'error',
      event_type:   'error',
      screen,
      feature,
      status:       message,
      severity:     'error',
      success:      false,
      source:       'app',
      metadata:     JSON.stringify(metadata || {}),
      created_at:   new Date().toISOString(),
    });
  },

  /**
   * Update the tracked email mid-session (e.g. after login completes).
   * All subsequent events will use this email.
   */
  setEmail(email) {
    if (email) _testerEmail = email;
  },

  /** True if a session is currently active. */
  get isActive() {
    return _ready && !!_sessionId;
  },
};

export default BetaTracker;

// ── Legacy method aliases ─────────────────────────────────────────────────────
// Screens call BetaTracker.screen() and BetaTracker.crash() — map them to the
// canonical trackScreen() and trackError() without touching every screen file.

BetaTracker.screen = function(screenName) {
  return BetaTracker.trackScreen(screenName);
};

BetaTracker.crash = function(screenName, err) {
  const message = err instanceof Error
    ? err.message
    : (typeof err === 'string' ? err : 'Unknown error');
  return BetaTracker.trackError(message, {
    screen: screenName,
    metadata: (err instanceof Error && err.stack)
      ? { stack: err.stack.slice(0, 500) }
      : {},
  });
};
