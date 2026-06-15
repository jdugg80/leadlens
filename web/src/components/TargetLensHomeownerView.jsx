import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function TargetLensHomeownerView() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lookback, setLookback] = useState('90d');
  const [ownerType, setOwnerType] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [counts, setCounts] = useState({ new_homeowner: 0, current_homeowner: 0, rental: 0 });

  useEffect(() => { loadProspects(); }, [lookback, ownerType, stateFilter]);

  async function loadProspects() {
    setLoading(true);
    let q = supabase.from('targetlens_prospects').select('*').eq('lookback_bucket', lookback).order('efficiency_score', { ascending: false });
    if (ownerType !== 'all') q = q.eq('prospect_type', ownerType);
    if (stateFilter !== 'all') q = q.eq('state', stateFilter.toUpperCase());
    const { data } = await q;
    setProspects(data || []);
    const c = { new_homeowner: 0, current_homeowner: 0, rental: 0 };
    (data || []).forEach(p => { if (c[p.prospect_type] !== undefined) c[p.prospect_type]++; });
    setCounts(c);
    setLoading(false);
  }

  function exportCSV() {
    const headers = ['Address','City','State','ZIP','Owner','Deed Date','Sale Price','Home Value','Sq Ft','Year Built','Score','Type'];
    const rows = prospects.map(p => [
      p.address, p.city, p.state, p.zip,
      p.grantee_name || p.owner_name,
      p.deed_transfer_date,
      p.deed_transfer_price || p.mls_close_price,
      p.home_value_estimated || p.home_value_assessed,
      p.home_sq_footage, p.year_built,
      p.efficiency_score, p.prospect_type
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `targetlens-homeowner-${lookback}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">TargetLens — Homeowner Prospects</h2>
        <button onClick={exportCSV} className="px-4 py-2 bg-cyan-500/20 border border-cyan-500 text-cyan-400 rounded-lg text-sm font-semibold">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { key: 'new_homeowner', label: 'New Owners', icon: '\uD83D\uDD11', color: 'cyan' },
          { key: 'current_homeowner', label: 'Current Owners', icon: '\uD83C\uDFE0', color: 'purple' },
          { key: 'rental', label: 'Rental', icon: '\uD83D\uDCCB', color: 'red' },
        ].map(({ key, label, icon, color }) => (
          <div key={key} className={`p-4 rounded-xl border border-${color}-500/30 bg-${color}-500/10`}>
            <p className="text-2xl font-bold text-white">{counts[key]}</p>
            <p className="text-sm text-gray-400">{icon} {label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        {['30d','60d','90d','120d'].map(w => (
          <button key={w} onClick={() => setLookback(w)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${lookback === w ? 'border-cyan-500 text-cyan-400 bg-cyan-500/20' : 'border-gray-700 text-gray-400'}`}>
            {w}
          </button>
        ))}
        <div className="w-px bg-gray-700" />
        {['all','new_homeowner','current_homeowner','rental'].map(t => (
          <button key={t} onClick={() => setOwnerType(t)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${ownerType === t ? 'border-purple-500 text-purple-400 bg-purple-500/20' : 'border-gray-700 text-gray-400'}`}>
            {t === 'all' ? 'All Types' : t.replace('_', ' ')}
          </button>
        ))}
        <div className="w-px bg-gray-700" />
        {['all','TX','MA'].map(s => (
          <button key={s} onClick={() => setStateFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${stateFilter === s ? 'border-green-500 text-green-400 bg-green-500/20' : 'border-gray-700 text-gray-400'}`}>
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading prospects...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800 text-left">
                <th className="pb-2 pr-4">Address</th>
                <th className="pb-2 pr-4">Owner</th>
                <th className="pb-2 pr-4">Deed Date</th>
                <th className="pb-2 pr-4">Sale Price</th>
                <th className="pb-2 pr-4">Est. Value</th>
                <th className="pb-2 pr-4">Sq Ft</th>
                <th className="pb-2 pr-4">Yr Built</th>
                <th className="pb-2 pr-4">Score</th>
                <th className="pb-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {prospects.map((p, i) => (
                <tr key={i} className="border-b border-gray-800/50 hover:bg-white/5">
                  <td className="py-2 pr-4 text-white">{p.address}<br/><span className="text-gray-500 text-xs">{p.city}, {p.state}</span></td>
                  <td className="py-2 pr-4 text-gray-300">{p.grantee_name || p.owner_name || '\u2014'}</td>
                  <td className="py-2 pr-4 text-gray-300">{p.deed_transfer_date ? new Date(p.deed_transfer_date).toLocaleDateString() : '\u2014'}</td>
                  <td className="py-2 pr-4 text-gray-300">{p.deed_transfer_price ? '$' + Number(p.deed_transfer_price).toLocaleString() : '\u2014'}</td>
                  <td className="py-2 pr-4 text-gray-300">{(p.home_value_estimated || p.home_value_assessed) ? '$' + Number(p.home_value_estimated || p.home_value_assessed).toLocaleString() : '\u2014'}</td>
                  <td className="py-2 pr-4 text-gray-300">{p.home_sq_footage ? p.home_sq_footage.toLocaleString() : '\u2014'}</td>
                  <td className="py-2 pr-4 text-gray-300">{p.year_built || '\u2014'}</td>
                  <td className="py-2 pr-4">
                    <span className="font-bold" style={{ color: p.efficiency_score >= 70 ? '#00C9FF' : p.efficiency_score >= 50 ? '#7B3FBE' : '#B8BDD0' }}>
                      {p.efficiency_score || 50}
                    </span>
                  </td>
                  <td className="py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      p.prospect_type === 'new_homeowner' ? 'bg-cyan-500/20 text-cyan-400' :
                      p.prospect_type === 'rental' ? 'bg-red-500/20 text-red-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {p.prospect_type === 'new_homeowner' ? '\uD83D\uDD11 New' : p.prospect_type === 'rental' ? '\uD83D\uDCCB Rental' : '\uD83C\uDFE0 Owner'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {prospects.length === 0 && <p className="text-gray-500 text-sm text-center py-8">No prospects found for selected filters. Run the TargetLens agent to populate data.</p>}
        </div>
      )}
    </div>
  );
}
