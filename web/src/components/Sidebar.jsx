import { NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Sidebar() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Dashboard',       path: '/',                icon: '📊', end: true },
    { name: 'Prospects',       path: '/prospects',       icon: '🏢' },
    { name: 'Reps',            path: '/reps',            icon: '👥' },
    { name: 'Territories',     path: '/territories',     icon: '🗺️' },
    { name: 'TargetLens',      path: '/targetlens',      icon: '🎯' },
    { name: 'Support Tickets', path: '/support-tickets', icon: '🎫' },
    { name: 'Roadmap',         path: '/roadmap',         icon: '🛣️' },
    { name: 'Settings',        path: '/settings',        icon: '⚙️' },
  ];

  const sidebarContent = (
    <aside style={{
      width: 240, minHeight: '100vh', display: 'flex', flexDirection: 'column',
      background: '#0E1219',
      borderRight: isMobile ? 'none' : '1px solid #1C2333',
    }}>
      {/* Logo */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px',
        borderBottom: '3px solid transparent',
        borderImage: 'linear-gradient(90deg, #7B3FBE, #CC1040) 1',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#E8EAF2', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
            LEAD<span style={{ color: '#00C9FF' }}>LENS</span>
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#7B3FBE', letterSpacing: 2, marginTop: 2 }}>ADMIN</span>
        </div>
        {isMobile && (
          <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', color: '#7A88AA', fontSize: 22, cursor: 'pointer', padding: 4 }}>✕</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px' }}>
        {navItems.map(item => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.end}
            onClick={() => isMobile && setOpen(false)}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '11px 14px', borderRadius: 9, marginBottom: 4,
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              fontFamily: "'Inter','Segoe UI',sans-serif",
              transition: 'all 0.15s',
              background: isActive ? '#00C9FF12' : 'transparent',
              color: isActive ? '#00C9FF' : '#7A88AA',
              border: isActive ? '1px solid #00C9FF33' : '1px solid transparent',
            })}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1C2333', padding: 10 }}>
        <div style={{ padding: '8px 14px', marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: '#4A5578', letterSpacing: 2, fontWeight: 700 }}>OKAY MEDIA</div>
          <div style={{ fontSize: 11, color: '#252E42' }}>LeadLens Admin v1.0</div>
        </div>
        <button onClick={handleLogout} style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          padding: '11px 14px', borderRadius: 9, border: '1px solid transparent',
          background: 'transparent', color: '#CC1040', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Inter','Segoe UI',sans-serif",
        }}>
          <span style={{ fontSize: 18 }}>🚪</span> Sign Out
        </button>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: 56, zIndex: 50,
          background: '#0E1219', borderBottom: '3px solid transparent',
          borderImage: 'linear-gradient(90deg, #7B3FBE, #CC1040) 1',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
        }}>
          <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: 'none', color: '#00C9FF', fontSize: 22, cursor: 'pointer', padding: 4 }}>☰</button>
          <span style={{ fontSize: 17, fontWeight: 900, color: '#E8EAF2', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
            LEAD<span style={{ color: '#00C9FF' }}>LENS</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#7B3FBE', letterSpacing: 2, marginLeft: 6 }}>ADMIN</span>
          </span>
          <div style={{ width: 30 }} />
        </div>

        {/* Overlay */}
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.7)' }} onClick={() => setOpen(false)} />
        )}

        {/* Slide-in drawer */}
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 100,
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s ease',
          width: 260,
          boxShadow: open ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        }}>
          {sidebarContent}
        </div>
      </>
    );
  }

  return sidebarContent;
}
