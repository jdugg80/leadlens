import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Prospects from './pages/Prospects';
import Reps from './pages/Reps';
import Territories from './pages/Territories';
import SupportTickets from './pages/SupportTickets';
import Roadmap from './pages/Roadmap';
import Settings from './pages/Settings';
import Sidebar from './components/Sidebar';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#080A0F]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#00C9FF] border-t-transparent"></div>
      </div>
    );
  }

  const protect = (el) => session ? el : <Navigate to="/login" />;

  return (
    <div className="flex min-h-screen bg-[#080A0F] text-[#E8EAF2]">
      {session && <Sidebar />}
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/"                element={protect(<Dashboard />)} />
          <Route path="/login"           element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/prospects"       element={protect(<Prospects />)} />
          <Route path="/reps"            element={protect(<Reps />)} />
          <Route path="/territories"     element={protect(<Territories />)} />
          <Route path="/support-tickets" element={protect(<SupportTickets />)} />
          <Route path="/roadmap"         element={protect(<Roadmap />)} />
          <Route path="/settings"        element={protect(<Settings />)} />
          <Route path="*"                element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
