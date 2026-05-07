import { NavLink } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Sidebar() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: '📊' },
    { name: 'Prospects', path: '/prospects', icon: '🏢' },
    { name: 'Map View', path: '/map', icon: '📍' },
    { name: 'Team Activity', path: '/team', icon: '👥' },
    { name: 'Reports', path: '/reports', icon: '📈' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  return (
    <aside className="flex w-64 flex-col border-r border-[#252A3A] bg-[#0E1018]">
      <div className="flex h-20 items-center px-6">
        <h1 className="text-xl font-black tracking-tighter text-[#E8EAF2]">
          LEAD<span className="text-[#00C9FF]">LENS</span>
        </h1>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-4">
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-[#1C2030] text-[#00C9FF]'
                  : 'text-[#7A85A8] hover:bg-[#141720] hover:text-[#E8EAF2]'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#252A3A] p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-[#FF3B5C] transition-colors hover:bg-red-500/10"
        >
          <span>🚪</span>
          Sign Out
        </button>
      </div>
    </aside>
  );
}
