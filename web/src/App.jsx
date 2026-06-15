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
import TargetLensHomeownerView from './components/TargetLensHomeownerView';
import { supabase } from './lib/supabase';

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => { subscription.unsubscribe(); window.removeEventListener('resize', handler); };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#080A0F' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #00C9FF', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const protect = (el) => session ? el : <Navigate to="/login" />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080A0F', color: '#E8EAF2' }}>
      {session && <Sidebar />}
      <main style={{
        flex: 1,
        overflowX: 'hidden',
        paddingTop: session && isMobile ? 56 : 0,
        minWidth: 0,
      }}>
        <Routes>
          <Route path="/"                element={protect(<Dashboard />)} />
          <Route path="/login"           element={!session ? <Login /> : <Navigate to="/" />} />
          <Route path="/prospects"       element={protect(<Prospects />)} />
          <Route path="/reps"            element={protect(<Reps />)} />
          <Route path="/territories"     element={protect(<Territories />)} />
          <Route path="/support-tickets" element={protect(<SupportTickets />)} />
          <Route path="/roadmap"         element={protect(<Roadmap />)} />
          <Route path="/settings"        element={protect(<Settings />)} />
          <Route path="/targetlens"      element={protect(<TargetLensHomeownerView />)} />
          <Route path="*"                element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
