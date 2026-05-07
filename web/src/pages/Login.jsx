import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 rounded-2xl border border-[#252A3A] bg-[#0E1018] p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-[#E8EAF2]">
            LeadLens <span className="text-[#00C9FF]">Portal</span>
          </h2>
          <p className="mt-2 text-sm text-[#7A85A8]">Management and Analytics Dashboard</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Email Address</label>
              <input
                type="email"
                required
                className="mt-1 block w-full rounded-lg border border-[#252A3A] bg-[#141720] px-4 py-3 text-[#E8EAF2] placeholder-[#5A6080] outline-none focus:border-[#00C9FF] focus:ring-1 focus:ring-[#00C9FF]"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-[#7A85A8]">Password</label>
              <input
                type="password"
                required
                className="mt-1 block w-full rounded-lg border border-[#252A3A] bg-[#141720] px-4 py-3 text-[#E8EAF2] placeholder-[#5A6080] outline-none focus:border-[#00C9FF] focus:ring-1 focus:ring-[#00C9FF]"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#00C9FF] py-3 font-bold text-[#080A0F] transition-all hover:bg-[#00B5E6] disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
