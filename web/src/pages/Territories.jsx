import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const C = {
  bg: '#080A0F', surface: '#0E1219', card: '#121820',
  border: '#1C2333', borderLit: '#252E42',
  cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
  chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  green: '#22C55E', orange: '#FF6B35',
};

export default function Territories() {
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newZips, setNewZips] = useState('');
  const [newRep, setNewRep] = useState('');
  const [reps, setReps] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadTerritories();
    loadReps();
  }, []);

  const loadTerritories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('territories')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTerritories(data || []);
    } catch (e) {
      console.error(e);
      setTerritories([]);
    }
    setLoading(false);
  };

  const loadReps = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').eq('status', 'active');
    setReps(data || []);
  };

  const addTerritory = async () => {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const zips = newZips.split(/[\s,]+/).map(z => z.trim()).filter(Boolean);
      const { error } = await supabase.from('territories').insert({
        name: newName.trim(),
        zip_codes: zips,
        assigned_rep_id: newRep || null,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setShowAddModal(false);
      setNewName(''); setNewZips(''); setNewRep('');
      loadTerritories();
    } catch (e) {
      alert('Failed to add territory: ' + e.message);
    }
    setAdding(false);
  };

  const deleteTerritory = async (id) => {
    if (!window.confirm('Delete this territory?')) return;
    await supabase.from('territories').delete().eq('id', id);
    setTerritories(territories.filter(t => t.id !== id));
  };

  const filtered = territories.filter(t =>
    (t.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · TERRITORIES</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>Territory Management</h1>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
          + NEW TERRITORY
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'TERRITORIES', value: territories.length, color: C.cyan },
          { label: 'ASSIGNED', value: territories.filter(t => t.assigned_rep_id).length, color: C.green },
          { label: 'UNASSIGNED', value: territories.filter(t => !t.assigned_rep_id).length, color: C.orange },
          { label: 'TOTAL ZIPS', value: territories.reduce((a, t) => a + (t.zip_codes?.length || 0), 0), color: C.purple },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 20px', minWidth: 120 }}>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search territories..."
        style={{ width: '100%', maxWidth: 400, background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
      />

      {/* Territory cards */}
      {loading ? (
        <div style={{ color: C.textMuted, padding: 40, textAlign: 'center' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: C.textMuted, padding: 60, textAlign: 'center' }}>
          No territories yet. <span style={{ color: C.cyan, cursor: 'pointer' }} onClick={() => setShowAddModal(true)}>Create one →</span>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {filtered.map(t => {
            const assignedRep = reps.find(r => r.id === t.assigned_rep_id);
            return (
              <div key={t.id} style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${t.assigned_rep_id ? C.cyan : C.orange}`, borderRadius: 12, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.chrome }}>{t.name}</div>
                  <button onClick={() => deleteTerritory(t.id)} style={{ background: 'transparent', border: 'none', color: C.red, cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>ASSIGNED TO</div>
                <div style={{ fontSize: 13, color: assignedRep ? C.text : C.orange, marginBottom: 12, fontWeight: 600 }}>
                  {assignedRep ? (assignedRep.full_name || assignedRep.email) : 'Unassigned'}
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>ZIP CODES ({t.zip_codes?.length || 0})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(t.zip_codes || []).slice(0, 8).map(z => (
                    <span key={z} style={{ fontSize: 10, color: C.textDim, background: C.border, borderRadius: 4, padding: '2px 7px' }}>{z}</span>
                  ))}
                  {(t.zip_codes?.length || 0) > 8 && (
                    <span style={{ fontSize: 10, color: C.cyan }}>+{t.zip_codes.length - 8} more</span>
                  )}
                </div>
                {/* Reassign rep */}
                <div style={{ marginTop: 14 }}>
                  <select
                    value={t.assigned_rep_id || ''}
                    onChange={async e => {
                      const repId = e.target.value || null;
                      await supabase.from('territories').update({ assigned_rep_id: repId }).eq('id', t.id);
                      setTerritories(territories.map(x => x.id === t.id ? { ...x, assigned_rep_id: repId } : x));
                    }}
                    style={{ width: '100%', background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.textDim, fontSize: 12, padding: '7px 10px', outline: 'none' }}
                  >
                    <option value="">— Unassigned —</option>
                    {reps.map(r => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Territory Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${C.cyan}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: C.chrome, margin: '0 0 20px' }}>New Territory</h2>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>TERRITORY NAME</div>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Houston North"
                style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', boxSizing: 'border-box', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>ZIP CODES (comma or space separated)</div>
              <textarea value={newZips} onChange={e => setNewZips(e.target.value)} placeholder="77001, 77002, 77003..."
                rows={3} style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>ASSIGN REP (optional)</div>
              <select value={newRep} onChange={e => setNewRep(e.target.value)}
                style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '10px 14px', outline: 'none' }}>
                <option value="">— Unassigned —</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.full_name || r.email}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '11px 0', background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>CANCEL</button>
              <button onClick={addTerritory} disabled={adding} style={{ flex: 2, padding: '11px 0', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: adding ? 0.5 : 1 }}>
                {adding ? 'CREATING...' : 'CREATE TERRITORY →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
