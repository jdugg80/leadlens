import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line
} from 'recharts';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalLeads: 0,
    newLeads: 0,
    contacted: 0,
    closed: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      // Mock stats or fetch from Supabase
      // For now, let's just count leads
      const { count, error } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true });

      if (!error) {
        setStats(prev => ({ ...prev, totalLeads: count || 0 }));
      }
      setLoading(false);
    }

    fetchStats();
  }, []);

  const data = [
    { name: 'Mon', leads: 4 },
    { name: 'Tue', leads: 7 },
    { name: 'Wed', leads: 5 },
    { name: 'Thu', leads: 12 },
    { name: 'Fri', leads: 9 },
    { name: 'Sat', leads: 2 },
    { name: 'Sun', leads: 1 },
  ];

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-[#7A85A8]">Real-time prospecting intelligence overview</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Total Prospects', value: stats.totalLeads, color: '#00C9FF' },
          { label: 'New Today', value: 12, color: '#00E5A0' },
          { label: 'Pending Review', value: 8, color: '#FFC800' },
          { label: 'Closed Deals', value: 24, color: '#CC1040' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-[#252A3A] bg-[#0E1018] p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">{stat.label}</p>
            <p className="mt-2 text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-[#252A3A] bg-[#0E1018] p-6">
          <h3 className="mb-6 text-lg font-bold text-[#E8EAF2]">Weekly Activity</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2030" vertical={false} />
                <XAxis dataKey="name" stroke="#5A6080" />
                <YAxis stroke="#5A6080" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0E1018', borderColor: '#252A3A', color: '#E8EAF2' }}
                  itemStyle={{ color: '#00C9FF' }}
                />
                <Bar dataKey="leads" fill="#00C9FF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-[#252A3A] bg-[#0E1018] p-6">
          <h3 className="mb-6 text-lg font-bold text-[#E8EAF2]">Conversion Trend</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2030" vertical={false} />
                <XAxis dataKey="name" stroke="#5A6080" />
                <YAxis stroke="#5A6080" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0E1018', borderColor: '#252A3A', color: '#E8EAF2' }}
                  itemStyle={{ color: '#CC1040' }}
                />
                <Line type="monotone" dataKey="leads" stroke="#CC1040" strokeWidth={3} dot={{ r: 4, fill: '#CC1040' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
