import { Link, NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Logo from './Logo.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }) =>
    `flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-white/10 text-white'
        : 'text-white/60 hover:text-white hover:bg-white/5'
    }`;

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-white/8 bg-ink-900/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 sm:flex">
          <NavLink to="/dashboard" className={linkClass}>
            <LayoutGrid size={16} /> My Ideas
          </NavLink>
          <NavLink to="/new" className={linkClass}>
            <Plus size={16} /> New Analysis
          </NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/new" className="sm:hidden rounded-xl bg-brand-600 p-2 text-white">
            <Plus size={18} />
          </Link>
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)' }}
              title={user?.email}
            >
              {initials}
            </div>
            <span className="hidden text-sm text-white/70 md:block max-w-[120px] truncate">
              {user?.name || user?.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-xl border border-white/10 p-2 text-white/60 transition-colors hover:border-white/25 hover:text-white"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
