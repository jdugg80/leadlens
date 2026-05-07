import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const EMPTY_LEAD = {
  businessName: '',
  pocFirst: '',
  pocLast: '',
  phone: '',
  email: '',
  website: '',
  streetNumber: '',
  streetName: '',
  addressLine2: '',
  city: '',
  state: '',
  zip: '',
  status: 'Suspect',
  propertyType: 'Commercial',
  vertical: 'Retail',
  notes: '',
};

export default function Prospects() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState(EMPTY_LEAD);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProspects();
  }, []);

  async function fetchProspects() {
    setLoading(true);
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) {
      setProspects(data || []);
    }
    setLoading(false);
  }

  async function handleAddLead(e) {
    e.preventDefault();
    setSaving(true);

    // Normalize fields if necessary, but for MVP we'll just save
    const { error } = await supabase
      .from('leads')
      .insert([{
        ...newLead,
        created_at: new Date().toISOString(),
      }]);

    if (!error) {
      setNewLead(EMPTY_LEAD);
      setShowAddModal(false);
      fetchProspects();
    } else {
      alert('Error saving lead: ' + error.message);
    }
    setSaving(false);
  }

  return (
    <div className="p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prospects</h1>
          <p className="text-[#7A85A8]">Manage and track your business leads</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-lg bg-[#00C9FF] px-6 py-2 font-bold text-[#080A0F] transition-all hover:bg-[#00B5E6]"
        >
          + Add Prospect
        </button>
      </header>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#00C9FF] border-t-transparent"></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#252A3A] bg-[#0E1018]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#141720] text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">
              <tr>
                <th className="px-6 py-4">Business Name</th>
                <th className="px-6 py-4">POC</th>
                <th className="px-6 py-4">Location</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Vertical</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#252A3A]">
              {prospects.map((lead) => (
                <tr key={lead.id} className="transition-colors hover:bg-[#1C2030]/50">
                  <td className="px-6 py-4 font-medium text-[#E8EAF2]">{lead.businessName}</td>
                  <td className="px-6 py-4 text-[#A0A8C0]">
                    {lead.pocFirst} {lead.pocLast}
                  </td>
                  <td className="px-6 py-4 text-[#A0A8C0]">
                    {lead.city}, {lead.state}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${
                      lead.status === 'Suspect' ? 'bg-yellow-500/10 text-yellow-500' :
                      lead.status === 'New' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-green-500/10 text-green-500'
                    }`}>
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[#A0A8C0]">{lead.vertical}</td>
                  <td className="px-6 py-4 text-right text-[#00C9FF]">
                    <button className="hover:underline">View</button>
                  </td>
                </tr>
              ))}
              {prospects.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-[#7A85A8]">
                    No prospects found. Click "Add Prospect" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Prospect Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#252A3A] bg-[#0E1018] shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="border-b border-[#252A3A] bg-[#141720] px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-[#E8EAF2]">New Prospect</h2>
              <button onClick={() => setShowAddModal(false)} className="text-[#7A85A8] hover:text-[#E8EAF2]">✕</button>
            </div>

            <form onSubmit={handleAddLead} className="p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#00C9FF]">Business Info</h3>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#7A85A8]">Business Name</label>
                    <input
                      required
                      className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                      value={newLead.businessName}
                      onChange={e => setNewLead({...newLead, businessName: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase text-[#7A85A8]">POC First Name</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                        value={newLead.pocFirst}
                        onChange={e => setNewLead({...newLead, pocFirst: e.target.value})}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase text-[#7A85A8]">POC Last Name</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                        value={newLead.pocLast}
                        onChange={e => setNewLead({...newLead, pocLast: e.target.value})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#7A85A8]">Phone</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                      value={newLead.phone}
                      onChange={e => setNewLead({...newLead, phone: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#CC1040]">Location & Details</h3>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#7A85A8]">Street Address</label>
                    <input
                      className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                      value={newLead.streetName}
                      placeholder="e.g. 123 Main St"
                      onChange={e => setNewLead({...newLead, streetName: e.target.value})}
                    />
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold uppercase text-[#7A85A8]">City</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                        value={newLead.city}
                        onChange={e => setNewLead({...newLead, city: e.target.value})}
                      />
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] font-bold uppercase text-[#7A85A8]">State</label>
                      <input
                        className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF]"
                        value={newLead.state}
                        maxLength={2}
                        onChange={e => setNewLead({...newLead, state: e.target.value.toUpperCase()})}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-[#7A85A8]">Status</label>
                    <select
                      className="mt-1 w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm outline-none focus:border-[#00C9FF] appearance-none"
                      value={newLead.status}
                      onChange={e => setNewLead({...newLead, status: e.target.value})}
                    >
                      <option>Suspect</option>
                      <option>New</option>
                      <option>Contacted</option>
                      <option>In Progress</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-4 border-t border-[#252A3A] pt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-[#252A3A] bg-transparent px-6 py-2 font-bold text-[#7A85A8] transition-all hover:bg-[#141720]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#00C9FF] px-8 py-2 font-bold text-[#080A0F] transition-all hover:bg-[#00B5E6] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Prospect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
