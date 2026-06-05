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

export default function Settings() {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  useEffect(() => {
    loadConfig();
    isPushEnabled().then(setPushEnabled);
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('app_config').select('*').single();
      if (data) setConfig(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
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

  const saveConfig = async (updates) => {
    setSaving(true);
    const merged = { ...config, ...updates };
    setConfig(merged);
    try {
      await supabase.from('app_config').upsert({ id: config.id || 1, ...merged });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
    setSaving(false);
  };

  const Toggle = ({ value, onChange }) => (
    <button onClick={() => onChange(!value)} style={{ width: 44, height: 24, borderRadius: 12, background: value ? C.cyan : C.border, border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.2s' }} />
    </button>
  );

  if (loading) return <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}>Loading...</div>;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif", maxWidth: 780 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · SETTINGS</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>App Settings</h1>
        </div>
        {saved && <div style={{ fontSize: 11, color: C.green, fontWeight: 700, letterSpacing: 1, padding: '8px 16px', background: `${C.green}15`, border: `1px solid ${C.green}44`, borderRadius: 6 }}>✓ SAVED</div>}
      </div>

      {/* App Info */}
      <Section title="APP INFORMATION" color={C.cyan}>
        <Row label="Current Version" sub="Displayed in app about screen">
          <input value={config.app_version || ''} onChange={e => setConfig({ ...config, app_version: e.target.value })} onBlur={e => saveConfig({ app_version: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 160, outline: 'none' }} />
        </Row>
        <Row label="Minimum App Version" sub="Reps on older versions will see an update prompt">
          <input value={config.min_version || ''} onChange={e => setConfig({ ...config, min_version: e.target.value })} onBlur={e => saveConfig({ min_version: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 160, outline: 'none' }} />
        </Row>
        <Row label="Maintenance Mode" sub="Shows maintenance message to all users">
          <Toggle value={!!config.maintenance_mode} onChange={v => saveConfig({ maintenance_mode: v })} />
        </Row>
      </Section>

      {/* Beta Settings */}
      <Section title="BETA PROGRAM" color={C.purple}>
        <Row label="Beta Mode Active" sub="Enables beta-specific features and banners">
          <Toggle value={!!config.beta_mode} onChange={v => saveConfig({ beta_mode: v })} />
        </Row>
        <Row label="Beta Build Label" sub="Shown in app header during beta">
          <input value={config.beta_label || ''} onChange={e => setConfig({ ...config, beta_label: e.target.value })} onBlur={e => saveConfig({ beta_label: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 180, outline: 'none' }} />
        </Row>
        <Row label="Max Beta Testers" sub="Cap on active beta users">
          <input type="number" value={config.max_beta_users || ''} onChange={e => setConfig({ ...config, max_beta_users: e.target.value })} onBlur={e => saveConfig({ max_beta_users: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 100, outline: 'none' }} />
        </Row>
      </Section>

      {/* Feature Flags */}
      <Section title="FEATURE FLAGS" color={C.orange}>
        {[
          { key: 'feature_lens_signals', label: 'LensSignals', sub: 'Nearby business monitoring' },
          { key: 'feature_leadlock', label: 'LeadLock Camera', sub: 'AI business card + storefront scanning' },
          { key: 'feature_territory_map', label: 'Territory Map', sub: 'ZIP polygon territory management' },
          { key: 'feature_crm_export', label: 'CRM Export', sub: 'Export prospects to CSV/CRM' },
          { key: 'feature_batch_review', label: 'Batch Review', sub: 'Bulk prospect review workflow' },
        ].map(f => (
          <Row key={f.key} label={f.label} sub={f.sub}>
            <Toggle value={config[f.key] !== false} onChange={v => saveConfig({ [f.key]: v })} />
          </Row>
        ))}
      </Section>

      {/* Prospect Settings */}
      <Section title="PROSPECT SETTINGS" color={C.green}>
        <Row label="Prospect Purge (days)" sub="Automatically remove captured prospects after N days">
          <input type="number" value={config.prospect_purge_days || 14} onChange={e => setConfig({ ...config, prospect_purge_days: e.target.value })} onBlur={e => saveConfig({ prospect_purge_days: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 100, outline: 'none' }} />
        </Row>
        <Row label="Max Queue Size" sub="Max prospects a rep can have in queue at once">
          <input type="number" value={config.max_queue_size || 50} onChange={e => setConfig({ ...config, max_queue_size: e.target.value })} onBlur={e => saveConfig({ max_queue_size: e.target.value })}
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 100, outline: 'none' }} />
        </Row>
      </Section>

      {/* Push Notifications */}
      <Section title="PUSH NOTIFICATIONS" color={C.cyan}>
        <Row label="Browser / Phone Push" sub="Get notified instantly when reps submit bugs or features">
          <button
            onClick={togglePush}
            disabled={pushLoading}
            style={{
              padding: '8px 18px',
              background: pushEnabled ? `${C.cyan}18` : 'transparent',
              border: `1px solid ${pushEnabled ? C.cyan : C.borderLit}`,
              borderRadius: 6, color: pushEnabled ? C.cyan : C.textDim,
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
              cursor: 'pointer', opacity: pushLoading ? 0.5 : 1,
            }}
          >
            {pushLoading ? 'LOADING...' : pushEnabled ? '✓ ENABLED' : 'ENABLE PUSH'}
          </button>
        </Row>
        {pushEnabled && (
          <div style={{ padding: '10px 0', fontSize: 12, color: C.textDim }}>
            ✓ You'll receive push notifications for all new submissions, even when the portal is closed.
          </div>
        )}
      </Section>

      {/* Notifications */}
      <Section title="EMAIL NOTIFICATIONS" color={C.red}>
        <Row label="Critical Bug Emails" sub="Email you when a critical bug is submitted">
          <Toggle value={config.notify_critical !== false} onChange={v => saveConfig({ notify_critical: v })} />
        </Row>
        <Row label="New Rep Signup Alerts" sub="Email you when a new rep joins">
          <Toggle value={!!config.notify_new_rep} onChange={v => saveConfig({ notify_new_rep: v })} />
        </Row>
        <Row label="Notification Email" sub="Where admin alerts are sent">
          <input value={config.admin_email || ''} onChange={e => setConfig({ ...config, admin_email: e.target.value })} onBlur={e => saveConfig({ admin_email: e.target.value })}
            placeholder="you@okaymedia.com"
            style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.text, fontSize: 13, padding: '6px 12px', width: 220, outline: 'none' }} />
        </Row>
      </Section>

      {/* Danger Zone */}
      <Section title="DANGER ZONE" color={C.red}>
        <Row label="Force All Reps to Logout" sub="Invalidates all active sessions immediately">
          <button onClick={() => window.confirm('Force logout all reps?') && supabase.rpc('force_logout_all')} style={{ padding: '7px 16px', background: `${C.red}15`, border: `1px solid ${C.red}55`, borderRadius: 6, color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 1 }}>
            FORCE LOGOUT
          </button>
        </Row>
      </Section>
    </div>
  );
}
