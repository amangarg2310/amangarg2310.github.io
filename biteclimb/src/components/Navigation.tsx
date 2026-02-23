import { NavLink } from 'react-router-dom'
import { HomeIcon, ListPlusIcon, UserIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function Navigation() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-100 shadow-lg px-2 py-2 z-50">
      <div className="flex justify-around items-center max-w-md mx-auto">
        <NavItem to="/" icon={<HomeIcon size={20} />} label="Discover" />
        <NavItem to="/tier-builder" icon={<ListPlusIcon size={20} />} label="Create" />
        <NavItem to="/profile" icon={<UserIcon size={20} />} label="Profile" />
      </div>
    </nav>
  )
}

function NavItem({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center px-3 py-1.5 rounded-xl transition-all ${
          isActive
            ? 'text-purple-600 bg-purple-50'
            : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100'
        }`
      }
    >
      <div className="mb-0.5">{icon}</div>
      <span className="text-xs font-medium">{label}</span>
    </NavLink>
  )
}
