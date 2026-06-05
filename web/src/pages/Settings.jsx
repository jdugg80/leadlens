import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { registerPush, unregisterPush, isPushEnabled } from '../hooks/usePushNotifications';

const C = {
  bg: '#080A0F', surface: '#0E1219', card: '#121820',
  border: '#1C2333', borderLit: '#252E42',
  cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
  chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  green: '#22C55E', orange: '#FF6B35',
};

const Section = ({ title, color = C.cyan, children }) => (
  <div style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
    <div style={{ fontSize: 10, color, letterSpacing: 3, fontWeight: 700, marginBottom: 16 }}>{title}</div>
    {children}
  </div>
);

const Row = ({ label, sub, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${C.border}` }}>
    <div>
      <div style={{ fontSize: 13, color: C.chrome, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{sub}</div>}
    </div>
    <div>{children}</div>
  </div>
);

const Toggle = ({ value, onChange }) => (
  <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? C.cyan : C.border, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
    <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s' }} />
  </button>
);

const Input = ({ value, onChange, placeholder, type = 'text', width = 240 }) => (
  <input
    type={type}
    value={value || ''}
    onChange={e => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width, outline: 'none', fontFamily: "'Inter','Segoe UI',sans-serif" }}
  />
);

export default function Settings() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    loadConfig();
    isPushEnabled().then(setPushEnabled);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('app_config').select('*').eq('id', 1).single();
      if (data) setConfig(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const set = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('app_config').update({
        current_build: config.current_build,
        apk_url: config.apk_url,
        update_message: config.update_message,
        force_update: config.force_update,
        claude_api_key: config.claude_api_key,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const togglePush = async () => {
    setPushLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email;
    if (pushEnabled) {
      await unregisterPush(supabase, email);
      setPushEnabled(false);
    } else {
      const ok = await registerPush(supabase, email);
      setPushEnabled(ok);
    }
    setPushLoading(false);
  };

  if (loading) return (
    <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>
      Loading...
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 780 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · SETTINGS</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>App Settings</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: 1 }}>✓ SAVED</div>}
          <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 24px',
            background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`,
            borderRadius: 8, color: C.cyan,
            fontSize: 12, fontWeight: 700, letterSpacing: 2,
            cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.5 : 1,
            fontFamily: "'Inter','Segoe UI',sans-serif",
          }}>
            {saving ? 'SAVING...' : 'SAVE CHANGES'}
          </button>
        </div>
      </div>

      {/* App Build */}
      <Section title="APP BUILD" color={C.cyan}>
        <Row label="Current Build Number" sub="Displayed in app and used for update checks">
          <Input value={config.current_build} onChange={v => set('current_build', v)} placeholder="e.g. 16" width={120} />
        </Row>
        <Row label="Force Update" sub="Forces all reps to update before using the app">
          <Toggle value={!!config.force_update} onChange={v => set('force_update', v)} />
        </Row>
        <Row label="APK Download URL" sub="Direct link to the latest APK for beta testers">
          <Input value={config.apk_url} onChange={v => set('apk_url', v)} placeholder="https://..." width={320} />
        </Row>
        <div style={{ paddingTop: 12 }}>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>UPDATE MESSAGE</div>
          <textarea
            value={config.update_message || ''}
            onChange={e => set('update_message', e.target.value)}
            placeholder="What's new in this build..."
            rows={5}
            style={{ width: '100%', background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: "'Inter','Segoe UI',sans-serif", lineHeight: 1.6 }}
          />
        </div>
      </Section>

      {/* Push Notifications */}
      <Section title="PUSH NOTIFICATIONS" color={C.purple}>
        <Row label="Browser / Phone Push" sub="Get notified instantly when reps submit bugs or features">
          <button onClick={togglePush} disabled={pushLoading} style={{
            padding: '8px 18px',
            background: pushEnabled ? `${C.cyan}18` : 'transparent',
            border: `1px solid ${pushEnabled ? C.cyan : C.borderLit}`,
            borderRadius: 6, color: pushEnabled ? C.cyan : C.textDim,
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            cursor: 'pointer', opacity: pushLoading ? 0.5 : 1,
          }}>
            {pushLoading ? 'LOADING...' : pushEnabled ? '✓ ENABLED' : 'ENABLE PUSH'}
          </button>
        </Row>
        {pushEnabled && (
          <div style={{ padding: '10px 0', fontSize: 12, color: C.textDim }}>
            ✓ Push notifications active on this device for all new rep submissions.
          </div>
        )}
      </Section>

      {/* Beta Program */}
      <Section title="BETA PROGRAM" color={C.orange}>
        <Row label="Project Scarlett Dashboard" sub="Manage beta testers, invite codes, and app access">
          <a href="https://dlntgyhfxxbcwwcxaorn.supabase.co" target="_blank" rel="noreferrer" style={{
            padding: '8px 18px',
            background: `${C.orange}18`, border: `1px solid ${C.orange}55`,
            borderRadius: 6, color: C.orange,
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textDecoration: 'none', display: 'inline-block',
          }}>
            OPEN SCARLETT →
          </a>
        </Row>
        <Row label="Supabase Dashboard" sub="Database, auth, edge functions, storage">
          <a href="https://supabase.com/dashboard/project/qkbvwryucaakkkqaqvka" target="_blank" rel="noreferrer" style={{
            padding: '8px 18px',
            background: `${C.green}18`, border: `1px solid ${C.green}55`,
            borderRadius: 6, color: C.green,
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            textDecoration: 'none', display: 'inline-block',
          }}>
            OPEN SUPABASE →
          </a>
        </Row>
      </Section>

      {/* API Keys */}
      <Section title="API CONFIGURATION" color={C.red}>
        <Row label="Claude API Key" sub="Used for LeadLock AI scanning and enrichment">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={config.claude_api_key || ''}
              onChange={e => set('claude_api_key', e.target.value)}
              style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 12, padding: '6px 12px', width: 260, outline: 'none', fontFamily: "monospace" }}
            />
            <button onClick={() => setShowApiKey(!showApiKey)} style={{ background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.textDim, fontSize: 10, padding: '6px 10px', cursor: 'pointer', fontWeight: 700 }}>
              {showApiKey ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </Row>
        <div style={{ padding: '10px 0', fontSize: 11, color: C.red }}>
          ⚠ Storing API keys in the database is a security risk. Consider moving to Supabase Secrets before going to production.
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="DANGER ZONE" color={C.red}>
        <Row label="Force All Reps to Logout" sub="Invalidates all active sessions immediately">
          <button onClick={() => window.confirm('Force logout all reps?') && supabase.rpc('force_logout_all')} style={{
            padding: '7px 16px', background: `${C.red}15`,
            border: `1px solid ${C.red}55`, borderRadius: 6, color: C.red,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1,
          }}>
            FORCE LOGOUT
          </button>
        </Row>
      </Section>
    </div>
  );
}
