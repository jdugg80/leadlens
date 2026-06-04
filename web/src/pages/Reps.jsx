import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const C = {
  bg: '#080A0F', surface: '#0E1219', card: '#121820',
  border: '#1C2333', borderLit: '#252E42',
  cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
  chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  green: '#22C55E', orange: '#FF6B35',
};

const pill = (label, color, bg) => (
  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 10px', borderRadius: 20, color, background: bg, border: `1px solid ${color}55` }}>
    {label}
  </span>
);

export default function Reps() {
  const [reps, setReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRepEmail, setNewRepEmail] = useState('');
  const [newRepName, setNewRepName] = useState('');
  const [newRepRole, setNewRepRole] = useState('rep');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { loadReps(); }, []);

  const loadReps = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReps(data || []);
    } catch (e) {
      console.error('Error loading reps:', e);
      setReps([]);
    }
    setLoading(false);
  };

  const toggleStatus = async (rep) => {
    const newStatus = rep.status === 'active' ? 'inactive' : 'active';
    await supabase.from('profiles').update({ status: newStatus }).eq('id', rep.id);
    setReps(reps.map(r => r.id === rep.id ? { ...r, status: newStatus } : r));
    if (selected?.id === rep.id) setSelected({ ...selected, status: newStatus });
  };

  const removeRep = async (id) => {
    if (!window.confirm('Remove this rep? This cannot be undone.')) return;
    await supabase.from('profiles').delete().eq('id', id);
    setReps(reps.filter(r => r.id !== id));
    setSelected(null);
  };

  const addRep = async () => {
    if (!newRepEmail.trim()) return;
    setAdding(true);
    try {
      const { error } = await supabase.from('profiles').insert({
        email: newRepEmail.trim(),
        full_name: newRepName.trim() || newRepEmail.trim(),
        role: newRepRole,
        status: 'active',
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setShowAddModal(false);
      setNewRepEmail(''); setNewRepName(''); setNewRepRole('rep');
      loadReps();
    } catch (e) {
      alert('Failed to add rep: ' + e.message);
    }
    setAdding(false);
  };

  const filtered = reps.filter(r =>
    (r.full_name || r.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = reps.filter(r => r.status !== 'inactive').length;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · REPS</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>Rep Management</h1>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
          + ADD REP
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'TOTAL REPS', value: reps.length, color: C.cyan },
          { label: 'ACTIVE', value: activeCount, color: C.green },
          { label: 'INACTIVE', value: reps.length - activeCount, color: C.textMuted },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 20px', minWidth: 120 }}>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search reps by name or email..."
        style={{ width: '100%', maxWidth: 400, background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
      />

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['REP', 'ROLE', 'STATUS', 'PROSPECTS', 'FEATURES USED', 'JOINED', 'ACTIONS'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No reps found</td></tr>
            ) : filtered.map(rep => (
              <tr key={rep.id} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
                  onClick={() => setSelected(rep)}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: `${C.purple}33`, border: `1px solid ${C.purple}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.purple }}>
                      {(rep.full_name || rep.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.chrome }}>{rep.full_name || '—'}</div>
                      <div style={{ fontSize: 11, color: C.textDim }}>{rep.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {pill(rep.role?.toUpperCase() || 'REP', rep.role === 'manager' ? C.purple : C.cyan, rep.role === 'manager' ? `${C.purple}22` : `${C.cyan}18`)}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {pill(rep.status === 'active' ? 'ACTIVE' : 'INACTIVE', rep.status === 'active' ? C.green : C.textMuted, rep.status === 'active' ? `${C.green}22` : `${C.border}88`)}
                </td>
                <td style={{ padding: '14px 16px', fontSize: 13, color: C.text, fontWeight: 600 }}>
                  {rep.prospect_count ?? '—'}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(rep.features_used || []).slice(0, 3).map(f => (
                      <span key={f} style={{ fontSize: 9, color: C.textDim, background: C.border, borderRadius: 3, padding: '2px 6px' }}>{f}</span>
                    ))}
                    {!rep.features_used?.length && <span style={{ fontSize: 11, color: C.textMuted }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 12, color: C.textDim }}>
                  {rep.created_at ? new Date(rep.created_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => toggleStatus(rep)} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.borderLit}`, background: 'transparent', color: C.textDim, cursor: 'pointer', fontWeight: 600 }}>
                      {rep.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}
                    </button>
                    <button onClick={() => removeRep(rep.id)} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, cursor: 'pointer', fontWeight: 600 }}>
                      REMOVE
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Rep Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${C.cyan}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 440 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: C.chrome, margin: '0 0 20px' }}>Add New Rep</h2>
            {[
              { label: 'FULL NAME', value: newRepName, set: setNewRepName, placeholder: 'Jane Smith' },
              { label: 'EMAIL', value: newRepEmail, set: setNewRepEmail, placeholder: 'jane@company.com' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{f.label}</div>
                <input value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>ROLE</div>
              <select value={newRepRole} onChange={e => setNewRepRole(e.target.value)}
                style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', outline: 'none' }}>
                <option value="rep">Rep</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '11px 0', background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>CANCEL</button>
              <button onClick={addRep} disabled={adding} style={{ flex: 2, padding: '11px 0', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: adding ? 0.5 : 1 }}>
                {adding ? 'ADDING...' : 'ADD REP →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rep Detail Panel */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: 24, overflowY: 'auto' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${C.purple}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `${C.purple}33`, border: `2px solid ${C.purple}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: C.purple }}>
                  {(selected.full_name || selected.email || '?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.chrome }}>{selected.full_name || '—'}</div>
                  <div style={{ fontSize: 12, color: C.textDim }}>{selected.email}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            {[
              ['ROLE', selected.role?.toUpperCase() || 'REP'],
              ['STATUS', selected.status?.toUpperCase() || '—'],
              ['PROSPECTS CAPTURED', selected.prospect_count ?? '—'],
              ['JOINED', selected.created_at ? new Date(selected.created_at).toLocaleDateString() : '—'],
              ['LAST ACTIVE', selected.last_active ? new Date(selected.last_active).toLocaleDateString() : '—'],
              ['BRANCH', selected.branch || '—'],
              ['EMPLOYEE ID', selected.employee_id || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 13, color: C.chrome, fontWeight: 600 }}>{value}</div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => toggleStatus(selected)} style={{ flex: 1, padding: '11px 0', background: `${C.cyan}12`, border: `1px solid ${C.cyan}44`, borderRadius: 8, color: C.cyan, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {selected.status === 'active' ? 'DEACTIVATE' : 'ACTIVATE'}
              </button>
              <button onClick={() => removeRep(selected.id)} style={{ flex: 1, padding: '11px 0', background: `${C.red}12`, border: `1px solid ${C.red}44`, borderRadius: 8, color: C.red, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                REMOVE REP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
