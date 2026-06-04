import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const C = {
  bg: '#080A0F', surface: '#0E1219', card: '#121820',
  border: '#1C2333', borderLit: '#252E42',
  cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
  chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  green: '#22C55E', orange: '#FF6B35', yellow: '#F5C842',
};

const STATUS_COLORS = { open: C.orange, reviewing: C.yellow, resolved: C.green, closed: C.textMuted };

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => { loadTickets(); }, []);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTickets(data || []);
    } catch (e) {
      console.error(e);
      setTickets([]);
    }
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from('support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    setTickets(tickets.map(t => t.id === id ? { ...t, status } : t));
    if (selected?.id === id) setSelected({ ...selected, status });
  };

  const filtered = tickets.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterType !== 'all' && t.issue_type !== filterType) return false;
    if (search && !(t.subject || t.rep_name || t.rep_email || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount = tickets.filter(t => t.status === 'open').length;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · SUPPORT</div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>Support Tickets</h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'TOTAL', value: tickets.length, color: C.cyan },
          { label: 'OPEN', value: openCount, color: C.orange },
          { label: 'REVIEWING', value: tickets.filter(t => t.status === 'reviewing').length, color: C.yellow },
          { label: 'RESOLVED', value: tickets.filter(t => t.status === 'resolved').length, color: C.green },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${s.color}`, borderRadius: 10, padding: '14px 20px', minWidth: 100 }}>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."
          style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '8px 14px', outline: 'none', width: 240 }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'open', 'reviewing', 'resolved', 'closed'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: '6px 14px', background: filterStatus === s ? `${C.cyan}15` : 'transparent', border: `1px solid ${filterStatus === s ? C.cyan + '66' : C.borderLit}`, borderRadius: 6, color: filterStatus === s ? C.cyan : C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets table */}
      <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['REP', 'SUBJECT', 'TYPE', 'STATUS', 'DEVICE', 'SUBMITTED', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: C.textMuted }}>No tickets found</td></tr>
            ) : filtered.map(ticket => (
              <tr key={ticket.id} onClick={() => setSelected(ticket)} style={{ borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <td style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.chrome }}>{ticket.rep_name || '—'}</div>
                  <div style={{ fontSize: 11, color: C.textDim }}>{ticket.rep_email}</div>
                </td>
                <td style={{ padding: '14px 16px', maxWidth: 240 }}>
                  <div style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject || '—'}</div>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 10px', borderRadius: 20, color: C.purple, background: `${C.purple}22`, border: `1px solid ${C.purple}44` }}>
                    {ticket.issue_type || 'Bug'}
                  </span>
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 10px', borderRadius: 20, color: STATUS_COLORS[ticket.status] || C.textMuted, background: `${STATUS_COLORS[ticket.status] || C.textMuted}22`, border: `1px solid ${STATUS_COLORS[ticket.status] || C.textMuted}44` }}>
                    {(ticket.status || 'open').toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: '14px 16px', fontSize: 11, color: C.textDim }}>{ticket.device_model || '—'}</td>
                <td style={{ padding: '14px 16px', fontSize: 11, color: C.textDim }}>
                  {ticket.created_at ? new Date(ticket.created_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                  <select value={ticket.status || 'open'} onChange={e => updateStatus(ticket.id, e.target.value)}
                    style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderRadius: 6, color: C.textDim, fontSize: 11, padding: '5px 8px', outline: 'none', cursor: 'pointer' }}>
                    <option value="open">Open</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: 24, overflowY: 'auto' }}>
          <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${STATUS_COLORS[selected.status] || C.orange}`, borderRadius: 12, padding: 28, width: '100%', maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 4 }}>TICKET #{selected.id}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.chrome }}>{selected.subject}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Rep info */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>REP INFO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['Name', selected.rep_name], ['Email', selected.rep_email], ['Employee #', selected.employee_num], ['Branch', selected.branch], ['Device', selected.device_model], ['App Version', selected.app_version]].map(([l, v]) => (
                  <div key={l}>
                    <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 1, fontWeight: 700 }}>{l}</div>
                    <div style={{ fontSize: 12, color: C.text, marginTop: 2 }}>{v || '—'}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.cyan, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>EXPECTED BEHAVIOR</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{selected.expected || selected.expected_behavior || '—'}</div>
            </div>

            {/* Actual */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: C.red, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>WHAT ACTUALLY HAPPENED</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{selected.actual || selected.actual_behavior || selected.details || '—'}</div>
            </div>

            {/* Status control */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['open', 'reviewing', 'resolved', 'closed'].map(s => (
                <button key={s} onClick={() => updateStatus(selected.id, s)} style={{ padding: '8px 16px', background: selected.status === s ? `${STATUS_COLORS[s]}22` : 'transparent', border: `1px solid ${selected.status === s ? STATUS_COLORS[s] : C.borderLit}`, borderRadius: 6, color: selected.status === s ? STATUS_COLORS[s] : C.textDim, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer' }}>
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
