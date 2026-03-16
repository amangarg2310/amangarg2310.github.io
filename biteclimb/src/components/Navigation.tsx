import { NavLink, useLocation } from 'react-router-dom'
import { HomeIcon, ListPlusIcon, UserIcon, ActivityIcon, TrophyIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-t border-neutral-100 dark:border-neutral-800 px-2 py-1.5 z-50">
      <div className="flex justify-around items-center max-w-md mx-auto">
        <NavItem to="/" icon={<HomeIcon size={20} />} label="Discover" />
        <NavItem to="/rankings" icon={<TrophyIcon size={20} />} label="Rankings" />
        <NavItem to="/feed" icon={<ActivityIcon size={20} />} label="Feed" />
        <NavItem to="/tier-builder" icon={<ListPlusIcon size={20} />} label="Create" />
        <NavItem to="/profile" icon={<UserIcon size={20} />} label="Profile" />
      </div>
    </nav>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  const location = useLocation()
  const isActive = to === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(to)

  return (
    <NavLink
      to={to}
      className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all duration-200 ${
        isActive ? 'text-purple-600' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300'
      }`}
    >
      <div className={`mb-0.5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>{icon}</div>
      <span className="text-[10px] font-semibold">{label}</span>
      {isActive && <div className="w-1 h-1 rounded-full bg-purple-600 mt-0.5 animate-scale-in" />}
    </NavLink>
  )
}
