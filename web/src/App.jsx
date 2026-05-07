import { Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

  return (
    <div className="flex min-h-screen bg-[#080A0F] text-[#E8EAF2]">
      {session && <Sidebar />}
      <main className="flex-1">
        <Routes>
          <Route
            path="/"
            element={session ? <Dashboard /> : <Navigate to="/login" />}
          />
          <Route
            path="/login"
            element={!session ? <Login /> : <Navigate to="/" />}
          />
          {/* Add more routes here as needed */}
        </Routes>
      </main>
    </div>
  );
}

export default App;
