import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_COLORS = {
  Suspect:    { color: '#F5C842', bg: '#F5C84218' },
  New:        { color: '#00C9FF', bg: '#00C9FF18' },
  Contacted:  { color: '#7B3FBE', bg: '#7B3FBE18' },
  'In Progress': { color: '#FF6B35', bg: '#FF6B3518' },
  Closed:     { color: '#22C55E', bg: '#22C55E18' },
};

const EMPTY = {
  business_name: '', poc_first: '', poc_last: '',
  phone: '', email: '', website: '',
  street_number: '', street_name: '', city: '', state: '', zip: '',
  status: 'Suspect', property_type: 'Commercial', vertical: 'Retail', notes: '',
};

export default function Prospects() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  useEffect(() => { fetchProspects(); }, [page]);

  async function fetchProspects() {
    setLoading(true);
    const { data, error } = await supabase
      .from('prospects')
      .select('id, business_name, poc_first, poc_last, phone, email, city, state, zip, status, vertical, rep_name, saved_at, capture_method, queue_status')
      .order('saved_at', { ascending: false, nullsFirst: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (!error) setProspects(data || []);
    setLoading(false);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from('prospects').insert([{
      ...newLead,
      saved_at: new Date().toISOString(),
      collected_at: new Date().toISOString(),
      source_type: 'manual_admin',
    }]);
    if (!error) {
      setNewLead(EMPTY);
      setShowAddModal(false);
      fetchProspects();
    } else {
      alert('Error: ' + error.message);
    }
    setSaving(false);
  }

  const set = (k, v) => setNewLead(p => ({ ...p, [k]: v }));

  const filtered = prospects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    const q = search.toLowerCase();
    if (q && ![(p.business_name||''), (p.poc_first||''), (p.poc_last||''), (p.city||''), (p.rep_name||'')].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  const C = {
    bg: '#080A0F', surface: '#0E1219', card: '#121820',
    border: '#1C2333', borderLit: '#252E42',
    cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
    chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  };

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · PROSPECTS</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>Prospects</h1>
          <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{prospects.length} loaded · page {page + 1}</div>
        </div>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '10px 20px', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
          + ADD PROSPECT
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, rep, city..."
          style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 14px', outline: 'none', width: 260 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'Suspect', 'New', 'Contacted', 'In Progress', 'Closed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 12px', background: filterStatus === s ? `${C.cyan}15` : 'transparent', border: `1px solid ${filterStatus === s ? C.cyan + '66' : C.borderLit}`, borderRadius: 6, color: filterStatus === s ? C.cyan : C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['BUSINESS', 'CONTACT', 'LOCATION', 'REP', 'STATUS', 'VERTICAL', 'CAPTURED', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No prospects found</td></tr>
            ) : filtered.map(p => {
              const sc = STATUS_COLORS[p.status] || { color: C.textDim, bg: C.border };
              return (
                <tr key={p.id} onClick={() => setSelected(p)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.chrome }}>{p.business_name || '—'}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{p.capture_method || '—'}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: C.textDim }}>
                    {[p.poc_first, p.poc_last].filter(Boolean).join(' ') || '—'}
                    {p.phone && <div style={{ fontSize: 10, color: C.textMuted }}>{p.phone}</div>}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: C.textDim }}>
                    {[p.city, p.state].filter(Boolean).join(', ') || '—'}
                    {p.zip && <div style={{ fontSize: 10, color: C.textMuted }}>{p.zip}</div>}
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: C.textDim }}>{p.rep_name || '—'}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '3px 9px', borderRadius: 20, color: sc.color, background: sc.bg, border: `1px solid ${sc.color}44` }}>
                      {p.status || '—'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: C.textDim }}>{p.vertical || '—'}</td>
                  <td style={{ padding: '13px 16px', fontSize: 11, color: C.textMuted }}>
                    {p.saved_at ? new Date(p.saved_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ fontSize: 11, color: C.cyan, cursor: 'pointer' }}>VIEW</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
          style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 6, color: page === 0 ? C.textMuted : C.textDim, fontSize: 11, cursor: page === 0 ? 'default' : 'pointer' }}>
          ← PREV
        </button>
        <button onClick={() => setPage(p => p + 1)} disabled={prospects.length < PAGE_SIZE}
          style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 6, color: prospects.length < PAGE_SIZE ? C.textMuted : C.textDim, fontSize: 11, cursor: prospects.length < PAGE_SIZE ? 'default' : 'pointer' }}>
          NEXT →
        </button>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: 24, overflowY: 'auto' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${C.cyan}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>PROSPECT DETAIL</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.chrome }}>{selected.business_name}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['Contact', [selected.poc_first, selected.poc_last].filter(Boolean).join(' ') || '—'],
                ['Phone', selected.phone || '—'],
                ['Email', selected.email || '—'],
                ['Website', selected.website || '—'],
                ['Address', [selected.street_number, selected.street_name].filter(Boolean).join(' ') || '—'],
                ['City / State / ZIP', [selected.city, selected.state, selected.zip].filter(Boolean).join(', ') || '—'],
                ['Status', selected.status || '—'],
                ['Vertical', selected.vertical || '—'],
                ['Rep', selected.rep_name || '—'],
                ['Capture Method', selected.capture_method || '—'],
                ['Queue Status', selected.queue_status || '—'],
                ['Captured', selected.saved_at ? new Date(selected.saved_at).toLocaleString() : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 3 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 13, color: C.chrome }}>{value}</div>
                </div>
              ))}
            </div>
            {selected.notes && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', marginTop: 8 }}>
                <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>NOTES</div>
                <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>{selected.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${C.cyan}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.chrome }}>Add Prospect</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>
            <form onSubmit={handleAdd}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['BUSINESS NAME *', 'business_name', true],
                  ['WEBSITE', 'website', false],
                  ['CONTACT FIRST', 'poc_first', false],
                  ['CONTACT LAST', 'poc_last', false],
                  ['PHONE', 'phone', false],
                  ['EMAIL', 'email', false],
                  ['STREET NUMBER', 'street_number', false],
                  ['STREET NAME', 'street_name', false],
                  ['CITY', 'city', false],
                  ['STATE', 'state', false],
                  ['ZIP', 'zip', false],
                  ['VERTICAL', 'vertical', false],
                ].map(([label, key, required]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>{label}</div>
                    <input required={required} value={newLead[key]} onChange={e => set(key, e.target.value)}
                      style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 7, color: C.text, fontSize: 13, padding: '9px 12px', boxSizing: 'border-box', outline: 'none' }} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>STATUS</div>
                  <select value={newLead.status} onChange={e => set('status', e.target.value)}
                    style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 7, color: C.text, fontSize: 13, padding: '9px 12px', outline: 'none' }}>
                    {['Suspect','New','Contacted','In Progress','Closed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>NOTES</div>
                  <textarea value={newLead.notes} onChange={e => set('notes', e.target.value)} rows={3}
                    style={{ width: '100%', background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 7, color: C.text, fontSize: 13, padding: '9px 12px', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowAddModal(false)} style={{ flex: 1, padding: '11px 0', background: 'transparent', border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>CANCEL</button>
                <button type="submit" disabled={saving} style={{ flex: 2, padding: '11px 0', background: `${C.cyan}18`, border: `1px solid ${C.cyan}66`, borderRadius: 8, color: C.cyan, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                  {saving ? 'SAVING...' : 'SAVE PROSPECT →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
