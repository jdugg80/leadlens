import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, AreaChart, Area
} from 'recharts';

const C = {
  bg: '#080A0F', surface: '#0E1219', card: '#121820',
  border: '#1C2333', borderLit: '#252E42',
  cyan: '#00C9FF', red: '#CC1040', purple: '#7B3FBE',
  chrome: '#E8EAF2', text: '#C8D0E8', textDim: '#7A88AA', textMuted: '#4A5578',
  green: '#22C55E', orange: '#FF6B35', yellow: '#F5C842',
};

const tooltipStyle = {
  contentStyle: { backgroundColor: '#0E1219', borderColor: '#252E42', color: '#E8EAF2', borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#00C9FF' },
  labelStyle: { color: '#7A88AA', fontSize: 11 },
};

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalProspects: 0,
    newToday: 0,
    activeReps: 0,
    territories: 0,
    openTickets: 0,
    roadmapItems: 0,
  });
  const [weeklyData, setWeeklyData] = useState([]);
  const [recentProspects, setRecentProspects] = useState([]);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => { fetchAll(); setTimeout(() => setChartReady(true), 100); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const safe = async (fn) => { 
  try { 
    return await fn(); 
  } catch (e) { 
    console.error('SAFE ERROR:', e); 
    return { count: 0, data: [] }; 
  } 
};

      const [
        { count: totalProspects },
        { count: newToday },
        { count: activeReps },
        { count: territories },
        { count: openTickets },
        { count: roadmapItems },
        { data: recentP },
        { data: recentT },
      ] = await Promise.all([
        safe(() => supabase.from('prospects').select('*', { count: 'exact', head: true })),
        safe(() => supabase.from('prospects').select('*', { count: 'exact', head: true }).gte('collected_at', today.toISOString())),
        safe(() => supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('status', 'active')),
        safe(() => supabase.from('territories').select('*', { count: 'exact', head: true })),
        safe(() => supabase.from('support_tickets').select('*', { count: 'exact', head: true }).eq('status', 'open')),
        safe(() => supabase.from('feature_requests').select('*', { count: 'exact', head: true }).neq('status', 'done')),
        safe(() => supabase.from('prospects').select('id, business_name, street_number, street_name, city, state, zip, rep_name, status, collected_at, viability_label, queue_status').order('collected_at', { ascending: false }).limit(5)),
        safe(() => supabase.from('support_tickets').select('subject, rep_name, status, created_at').order('created_at', { ascending: false }).limit(4)),
      ]);

      console.log('recentP:', recentP, 'totalProspects:', totalProspects);

      setStats({
        totalProspects: totalProspects || 0,
        newToday: newToday || 0,
        activeReps: activeReps || 0,
        territories: territories || 0,
        openTickets: openTickets || 0,
        roadmapItems: roadmapItems || 0,
      });
      setRecentProspects(recentP || []);
      setRecentTickets(recentT || []);

      // Build last 7 days chart data
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        const { count } = await safe(() => supabase
          .from('prospects')
          .select('*', { count: 'exact', head: true })
          .gte('collected_at', d.toISOString())
          .lt('collected_at', next.toISOString()));
        days.push({
          name: d.toLocaleDateString('en-US', { weekday: 'short' }),
          prospects: count || 0,
        });
      }
      setWeeklyData(days);
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  };

  const statCards = [
    { label: 'TOTAL PROSPECTS', value: stats.totalProspects, color: C.cyan,   sub: `+${stats.newToday} today` },
    { label: 'ACTIVE REPS',     value: stats.activeReps,     color: C.green,  sub: 'In the field' },
    { label: 'TERRITORIES',     value: stats.territories,    color: C.purple, sub: 'Managed zones' },
    { label: 'OPEN TICKETS',    value: stats.openTickets,    color: C.orange, sub: 'Need attention' },
    { label: 'NEW TODAY',       value: stats.newToday,       color: C.yellow, sub: 'Captured today' },
    { label: 'ROADMAP ITEMS',   value: stats.roadmapItems,   color: C.red,    sub: 'Open backlog' },
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: 28, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>ADMIN · OVERVIEW</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.chrome, margin: 0 }}>Dashboard</h1>
          <div style={{ fontSize: 11, color: C.textDim }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: C.card, border: `1px solid ${C.borderLit}`, borderTop: `3px solid ${s.color}`, borderRadius: 12, padding: '18px 20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: 2, fontWeight: 700, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color, lineHeight: 1 }}>{loading ? '—' : s.value}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>{s.sub}</div>
            <div style={{ position: 'absolute', top: 0, right: 0, width: 60, height: 60, background: `${s.color}08`, borderRadius: '0 12px 0 60px' }} />
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Weekly prospects */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderLeft: `3px solid ${C.cyan}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>WEEKLY CAPTURES</div>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 18 }}>Prospects captured last 7 days</div>
          <div style={{ height: 200, minHeight: 200, width: "100%" }}>{chartReady && 
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyData}>
                <defs>
                  <linearGradient id="cyanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="name" stroke={C.textMuted} tick={{ fontSize: 11, fill: C.textDim }} />
                <YAxis stroke={C.textMuted} tick={{ fontSize: 11, fill: C.textDim }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="prospects" stroke={C.cyan} strokeWidth={2} fill="url(#cyanGrad)" dot={{ r: 4, fill: C.cyan }} />
              </AreaChart>
            </ResponsiveContainer>}
          </div>
        </div>

        {/* Status breakdown */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderLeft: `3px solid ${C.purple}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 700, marginBottom: 4 }}>QUICK OVERVIEW</div>
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 18 }}>System status at a glance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {[
              { label: 'Prospect Capture', status: 'OPERATIONAL', color: C.green },
              { label: 'LeadLock (AI Scan)', status: 'OPERATIONAL', color: C.green },
              { label: 'LensSignals', status: 'OPERATIONAL', color: C.green },
              { label: 'Territory Maps', status: 'OPERATIONAL', color: C.green },
              { label: 'CRM Export', status: 'OPERATIONAL', color: C.green },
              { label: 'Push Notifications', status: 'OPERATIONAL', color: C.green },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: C.text }}>{item.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: 10, color: item.color, fontWeight: 700, letterSpacing: 1 }}>{item.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recent prospects */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderLeft: `3px solid ${C.green}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 10, color: C.green, letterSpacing: 3, fontWeight: 700, marginBottom: 16 }}>RECENT PROSPECTS</div>
          {recentProspects.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No prospects yet</div>
          ) : recentProspects.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.chrome }}>{p.business_name || 'Unknown'}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{[p.street_number, p.street_name, p.city, p.state, p.zip].filter(Boolean).join(' ') || '—'}</div>
                <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{p.rep_name || '—'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <div style={{ fontSize: 10, color: C.textMuted }}>{p.collected_at ? new Date(p.collected_at).toLocaleDateString() : '—'}</div>
                {p.queue_status && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '2px 7px', borderRadius: 20, color: p.queue_status === 'approved' ? C.green : p.queue_status === 'pending' ? C.yellow : C.textDim, background: p.queue_status === 'approved' ? `${C.green}22` : p.queue_status === 'pending' ? `${C.yellow}22` : `${C.border}88`, border: `1px solid ${p.queue_status === 'approved' ? C.green : p.queue_status === 'pending' ? C.yellow : C.border}44` }}>{p.queue_status.toUpperCase()}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Recent tickets */}
        <div style={{ background: C.surface, border: `1px solid ${C.borderLit}`, borderLeft: `3px solid ${C.orange}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontSize: 10, color: C.orange, letterSpacing: 3, fontWeight: 700, marginBottom: 16 }}>RECENT SUPPORT TICKETS</div>
          {recentTickets.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>No tickets yet</div>
          ) : recentTickets.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.chrome }}>{t.subject || '—'}</div>
                <div style={{ fontSize: 11, color: C.textDim }}>{t.rep_name || '—'}</div>
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '3px 8px', borderRadius: 20, color: t.status === 'open' ? C.orange : C.green, background: t.status === 'open' ? `${C.orange}22` : `${C.green}22`, border: `1px solid ${t.status === 'open' ? C.orange : C.green}44` }}>
                {(t.status || 'open').toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
