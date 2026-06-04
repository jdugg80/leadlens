import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Sidebar() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Dashboard',       path: '/',                 icon: '📊', end: true },
    { name: 'Prospects',       path: '/prospects',        icon: '🏢' },
    { name: 'Reps',            path: '/reps',             icon: '👥' },
    { name: 'Territories',     path: '/territories',      icon: '🗺️' },
    { name: 'Support Tickets', path: '/support-tickets',  icon: '🎫' },
    { name: 'Roadmap',         path: '/roadmap',          icon: '🛣️' },
    { name: 'Settings',        path: '/settings',         icon: '⚙️' },
  ];

  return (
    <aside className="flex w-64 flex-col border-r border-[#1C2333] bg-[#0E1219] shrink-0">
      {/* Logo */}
      <div className="flex h-16 items-center px-6 border-b border-[#1C2333]"
           style={{ borderBottom: '3px solid transparent', borderImage: 'linear-gradient(90deg, #7B3FBE, #CC1040) 1' }}>
        <h1 className="text-xl font-black tracking-tighter text-[#E8EAF2]">
          LEAD<span className="text-[#00C9FF]">LENS</span>
        </h1>
        <span className="ml-2 text-[9px] font-bold text-[#7B3FBE] tracking-widest mt-1">ADMIN</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-[#00C9FF12] text-[#00C9FF] border border-[#00C9FF33]'
                  : 'text-[#7A88AA] hover:bg-[#141C28] hover:text-[#C8D0E8] border border-transparent'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-[#1C2333] p-3">
        <div className="px-4 py-2 mb-1">
          <div className="text-[10px] text-[#4A5578] tracking-widest font-bold">OKAY MEDIA</div>
          <div className="text-[11px] text-[#2A3560]">LeadLens Admin v1.0</div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-[#CC1040] transition-colors hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
