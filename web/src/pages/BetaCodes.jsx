import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_COLORS = {
  available: { bg: 'bg-[#00E5A0]/10', text: 'text-[#00E5A0]', border: 'border-[#00E5A0]/30', label: 'AVAILABLE' },
  used:      { bg: 'bg-[#7B3FBE]/10', text: 'text-[#7B3FBE]', border: 'border-[#7B3FBE]/30', label: 'USED' },
  revoked:   { bg: 'bg-[#CC1040]/10', text: 'text-[#CC1040]', border: 'border-[#CC1040]/30', label: 'REVOKED' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.available;
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-bold tracking-wider ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

function ConfirmModal({ code, onCancel, onConfirm, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[#CC1040]/40 bg-[#0E1018] p-6 shadow-2xl">
        <div className="mb-1 text-xs font-bold tracking-widest text-[#CC1040]">CONFIRM ACTION</div>
        <h2 className="mb-2 text-xl font-black text-[#E8EAF2]">Delete {code}?</h2>
        <p className="mb-6 text-sm text-[#7A85A8]">
          This will permanently remove the invite code. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-[#252A3A] bg-transparent px-4 py-2 text-sm font-bold text-[#B8BDD0] transition-colors hover:bg-[#141720] disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 rounded-lg bg-[#CC1040] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#aa0d35] disabled:opacity-50"
          >
            {loading ? 'DELETING…' : 'CONFIRM DELETE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ onCancel, onGenerate, loading }) {
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [email, setEmail] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[#00C9FF]/30 bg-[#0E1018] p-6 shadow-2xl">
        <div className="mb-1 text-xs font-bold tracking-widest text-[#00C9FF]">GENERATE CODES</div>
        <h2 className="mb-4 text-xl font-black text-[#E8EAF2]">New Invite Code(s)</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Quantity</label>
            <input
              type="number" min="1" max="20" value={count}
              onChange={e => setCount(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm text-[#E8EAF2] outline-none focus:border-[#00C9FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Prefix (optional)</label>
            <input
              type="text" placeholder="e.g. HAWK" value={prefix}
              onChange={e => setPrefix(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm text-[#E8EAF2] outline-none focus:border-[#00C9FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Assign To (optional)</label>
            <input
              type="text" placeholder="Name" value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
              className="w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm text-[#E8EAF2] outline-none focus:border-[#00C9FF]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Email (optional)</label>
            <input
              type="email" placeholder="email@example.com" value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-2 text-sm text-[#E8EAF2] outline-none focus:border-[#00C9FF]"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-lg border border-[#252A3A] bg-transparent px-4 py-2 text-sm font-bold text-[#B8BDD0] transition-colors hover:bg-[#141720] disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            onClick={() => onGenerate({ count, prefix, assignedTo, email })}
            disabled={loading}
            className="flex-1 rounded-lg bg-[#00C9FF] px-4 py-2 text-sm font-bold text-[#080A0F] transition-colors hover:bg-[#00b3e6] disabled:opacity-50"
          >
            {loading ? 'GENERATING…' : 'GENERATE'}
          </button>
        </div>
      </div>
    </div>
  );
}

function generateCode(prefix = '') {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const word = prefix || Array.from({ length: 4 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join('');
  const num = String(Math.floor(Math.random() * 90) + 10);
  return (word + num).slice(0, 8);
}

export default function BetaCodes() {
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // code row to delete
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchCodes = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setCodes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchCodes(); }, [fetchCodes]);

  // ── DELETE ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleteLoading(true);

    const { error } = await supabase
      .from('invite_codes')
      .delete()
      .eq('id', confirmDelete.id);

    if (error) {
      showToast(`Delete failed: ${error.message}`, 'error');
    } else {
      setCodes(prev => prev.filter(c => c.id !== confirmDelete.id));
      showToast(`Code ${confirmDelete.code} deleted`);
    }
    setDeleteLoading(false);
    setConfirmDelete(null);
  };

  // ── REVOKE ─────────────────────────────────────────────────────────────────
  const handleRevoke = async (row) => {
    const { error } = await supabase
      .from('invite_codes')
      .update({ status: 'revoked' })
      .eq('id', row.id);

    if (error) {
      showToast(`Revoke failed: ${error.message}`, 'error');
    } else {
      setCodes(prev => prev.map(c => c.id === row.id ? { ...c, status: 'revoked' } : c));
      showToast(`Code ${row.code} revoked`);
    }
  };

  // ── SEND EMAIL ─────────────────────────────────────────────────────────────
  const handleSend = async (row) => {
    if (!row.email) {
      showToast('No email on this code', 'error');
      return;
    }
    const subject = encodeURIComponent('Your LeadLens Beta Invite Code');
    const body = encodeURIComponent(
      `Hi ${row.assigned_to || 'there'},\n\nYour LeadLens beta invite code is: ${row.code}\n\nUse this code when prompted during app setup.\n\nThanks,\nThe LeadLens Team`
    );
    window.open(`mailto:${row.email}?subject=${subject}&body=${body}`);
  };

  // ── COPY ───────────────────────────────────────────────────────────────────
  const handleCopy = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`Copied ${code}`);
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  // ── GENERATE ───────────────────────────────────────────────────────────────
  const handleGenerate = async ({ count, prefix, assignedTo, email }) => {
    setGenerateLoading(true);
    const rows = Array.from({ length: count }, () => ({
      code: generateCode(prefix),
      status: 'available',
      assigned_to: assignedTo || null,
      email: email || null,
      created_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('invite_codes')
      .insert(rows)
      .select();

    if (error) {
      showToast(`Generate failed: ${error.message}`, 'error');
    } else {
      setCodes(prev => [...(data || rows), ...prev]);
      showToast(`Generated ${count} code${count > 1 ? 's' : ''}`);
      setShowGenerate(false);
    }
    setGenerateLoading(false);
  };

  // ── FILTER ─────────────────────────────────────────────────────────────────
  const filtered = codes.filter(c => {
    const matchStatus = filterStatus === 'all' || c.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q || [c.code, c.assigned_to, c.email].some(v => v?.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  const counts = {
    total: codes.length,
    available: codes.filter(c => c.status === 'available').length,
    used: codes.filter(c => c.status === 'used').length,
    revoked: codes.filter(c => c.status === 'revoked').length,
  };

  const fmtDate = (v) => v ? new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

  return (
    <div className="flex h-screen flex-col bg-[#080A0F] text-[#E8EAF2]">
      {/* Toast */}
      {toast && (
        <div className={`fixed right-6 top-6 z-50 rounded-lg border px-4 py-3 text-sm font-semibold shadow-lg transition-all ${
          toast.type === 'error'
            ? 'border-[#CC1040]/40 bg-[#1a0a0f] text-[#FF3B5C]'
            : 'border-[#00C9FF]/30 bg-[#0a1420] text-[#00C9FF]'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <ConfirmModal
          code={confirmDelete.code}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}

      {/* Generate modal */}
      {showGenerate && (
        <GenerateModal
          onCancel={() => setShowGenerate(false)}
          onGenerate={handleGenerate}
          loading={generateLoading}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#252A3A] px-8 py-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#E8EAF2]">
            Beta <span className="text-[#00C9FF]">Invite Codes</span>
          </h1>
          <p className="mt-0.5 text-xs text-[#5A6080]">Manage access codes for beta testers</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchCodes}
            className="flex items-center gap-2 rounded-lg border border-[#252A3A] px-4 py-2 text-xs font-bold text-[#7A85A8] transition-colors hover:border-[#00C9FF]/40 hover:text-[#00C9FF]"
          >
            ↻ REFRESH
          </button>
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-2 rounded-lg bg-[#00C9FF] px-4 py-2 text-xs font-bold text-[#080A0F] transition-colors hover:bg-[#00b3e6]"
          >
            + GENERATE CODE
          </button>
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex gap-3 border-b border-[#252A3A] px-8 py-4">
        {[
          { key: 'all',       label: 'All Codes',  val: counts.total,     color: '#B8BDD0' },
          { key: 'available', label: 'Available',  val: counts.available, color: '#00E5A0' },
          { key: 'used',      label: 'Used',       val: counts.used,      color: '#7B3FBE' },
          { key: 'revoked',   label: 'Revoked',    val: counts.revoked,   color: '#CC1040' },
        ].map(({ key, label, val, color }) => (
          <button
            key={key}
            onClick={() => setFilterStatus(key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-1.5 text-xs font-bold transition-colors ${
              filterStatus === key
                ? 'border-[#00C9FF]/40 bg-[#00C9FF]/10 text-[#00C9FF]'
                : 'border-[#252A3A] text-[#5A6080] hover:border-[#3A4060] hover:text-[#B8BDD0]'
            }`}
          >
            <span style={{ color }}>{val}</span>
            {label}
          </button>
        ))}

        <div className="ml-auto">
          <input
            type="text"
            placeholder="Search code, name, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 rounded-lg border border-[#252A3A] bg-[#141720] px-3 py-1.5 text-xs text-[#E8EAF2] outline-none placeholder-[#5A6080] focus:border-[#00C9FF]/50"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-8 py-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00C9FF] border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-[#CC1040]/30 bg-[#1a0a0f] p-4 text-sm text-[#FF3B5C]">
            Error loading codes: {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-[#5A6080]">No codes found.</div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#252A3A]">
                {['CODE', 'ASSIGNED TO', 'EMAIL', 'STATUS', 'USED AT', 'ACTIONS'].map(h => (
                  <th key={h} className="pb-3 text-left text-xs font-bold tracking-widest text-[#5A6080]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#141720]">
              {filtered.map(row => (
                <tr key={row.id} className="group transition-colors hover:bg-[#0E1018]">
                  {/* Code */}
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold tracking-wider text-[#00C9FF]">{row.code}</span>
                      <button
                        onClick={() => handleCopy(row.code)}
                        className="rounded px-1.5 py-0.5 text-xs text-[#5A6080] transition-colors hover:bg-[#1C2030] hover:text-[#B8BDD0]"
                        title="Copy code"
                      >
                        ⎘ COPY
                      </button>
                    </div>
                  </td>
                  {/* Assigned To */}
                  <td className="py-3 pr-4 text-[#B8BDD0]">{row.assigned_to || <span className="text-[#3A4060]">—</span>}</td>
                  {/* Email */}
                  <td className="py-3 pr-4 font-mono text-xs text-[#7A85A8]">{row.email || <span className="text-[#3A4060]">—</span>}</td>
                  {/* Status */}
                  <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                  {/* Used At */}
                  <td className="py-3 pr-4 text-xs text-[#5A6080]">{fmtDate(row.used_at)}</td>
                  {/* Actions */}
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {row.status === 'available' && row.email && (
                        <button
                          onClick={() => handleSend(row)}
                          className="flex items-center gap-1 rounded border border-[#00E5A0]/30 bg-[#00E5A0]/10 px-2.5 py-1 text-xs font-bold text-[#00E5A0] transition-colors hover:bg-[#00E5A0]/20"
                        >
                          ✉ SEND
                        </button>
                      )}
                      {row.status === 'available' && (
                        <button
                          onClick={() => handleRevoke(row)}
                          className="rounded border border-[#CC1040]/30 bg-[#CC1040]/10 px-2.5 py-1 text-xs font-bold text-[#CC1040] transition-colors hover:bg-[#CC1040]/20"
                        >
                          REVOKE
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDelete(row)}
                        className="rounded border border-[#252A3A] px-2.5 py-1 text-xs font-bold text-[#5A6080] transition-colors hover:border-[#CC1040]/40 hover:text-[#CC1040]"
                      >
                        DELETE
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
