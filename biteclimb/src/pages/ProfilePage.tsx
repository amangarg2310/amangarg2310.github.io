import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  SettingsIcon, EditIcon, ListIcon,
  FlameIcon, TrophyIcon, LogOutIcon, MoonIcon, SunIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import type { TierType } from '../data/types'

const CUISINE_COLORS: Record<string, string> = {
  Italian: 'bg-red-400',
  Japanese: 'bg-blue-400',
  Korean: 'bg-orange-400',
  Mexican: 'bg-green-400',
  Thai: 'bg-yellow-400',
  Indian: 'bg-purple-400',
}

export function ProfilePage() {
  const { id: routeId } = useParams<{ id: string }>()
  const { user: currentUser, logout } = useAuthStore()
  const { isDark, setTheme, theme } = useThemeStore()
  const userId = routeId || currentUser?.id
  const isOwnProfile = !routeId || routeId === currentUser?.id

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: () => api.users.profile(userId!),
    enabled: !!userId,
  })

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    enabled: isOwnProfile,
  })

  const profileData = isOwnProfile && meData ? { ...profile, ...meData } : profile

  if (isLoading || !profileData) {
    return (
      <div className="max-w-md mx-auto px-4 py-6 page-enter">
        <div className="skeleton h-8 w-32 rounded-lg mb-6" />
        <div className="flex items-center mb-6"><div className="skeleton w-20 h-20 rounded-full mr-4" /><div className="space-y-2 flex-1"><div className="skeleton h-6 w-32 rounded-lg" /><div className="skeleton h-4 w-48 rounded-lg" /></div></div>
        <div className="grid grid-cols-4 gap-2 mb-6">{[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
      </div>
    )
  }

  const tasteDna = profileData.taste_dna || []
  const maxDna = Math.max(...tasteDna.map(d => d.count), 1)
  const streak = typeof profileData.streak === 'number' ? profileData.streak : 0

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      <header className="flex justify-between items-center mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">Profile</h1>
          <p className="text-sm text-neutral-500">biteclimb</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Toggle theme">
            {isDark ? <SunIcon size={20} className="text-yellow-500" /> : <MoonIcon size={20} className="text-neutral-600" />}
          </button>
          {isOwnProfile && (
            <>
              <button className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Settings"><SettingsIcon size={20} className="text-neutral-600 dark:text-neutral-400" /></button>
              <button onClick={logout} className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800" aria-label="Log out"><LogOutIcon size={20} className="text-neutral-600 dark:text-neutral-400" /></button>
            </>
          )}
        </div>
      </header>

      {/* User info */}
      <div className="flex items-center mb-6 animate-fade-in-up stagger-1">
        <div className="relative mr-4 shrink-0">
          <img src={profileData.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80'} alt={profileData.username} className="w-20 h-20 rounded-full object-cover ring-2 ring-purple-100 dark:ring-purple-900" />
          {isOwnProfile && <button className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-full" aria-label="Edit avatar"><EditIcon size={14} /></button>}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold dark:text-neutral-100">{profileData.username}</h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">{profileData.bio || 'No bio yet'}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">{profileData.food_personality}</span>
            <span className="text-xs text-neutral-400">Since {new Date(profileData.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6 animate-fade-in-up stagger-2">
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-3 text-center"><div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{profileData.tier_lists ?? 0}</div><div className="text-[10px] text-neutral-500">Lists</div></div>
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-3 text-center"><div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{profileData.dishes_rated ?? 0}</div><div className="text-[10px] text-neutral-500">Rated</div></div>
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-3 text-center"><div className="text-lg font-bold text-neutral-900 dark:text-neutral-100">{profileData.followers ?? 0}</div><div className="text-[10px] text-neutral-500">Followers</div></div>
        <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-xl shadow-sm p-3 text-center text-white"><div className="text-lg font-bold flex items-center justify-center gap-0.5"><FlameIcon size={16} /> {streak}</div><div className="text-[10px] text-white/80">Day Streak</div></div>
      </div>

      {/* Taste DNA */}
      {tasteDna.length > 0 && (
        <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-3">
          <h2 className="font-semibold mb-3 flex items-center text-sm dark:text-neutral-100">
            <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mr-2"><span className="text-white text-xs">🧬</span></span>Your Taste DNA
          </h2>
          <div className="space-y-2.5">
            {tasteDna.map(({ cuisine, count }) => (
              <div key={cuisine} className="flex items-center gap-2">
                <span className="text-xs text-neutral-600 dark:text-neutral-400 w-20 shrink-0">{cuisine}</span>
                <div className="flex-1 h-3 bg-neutral-100 dark:bg-neutral-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${CUISINE_COLORS[cuisine] || 'bg-neutral-400'} transition-all duration-500`} style={{ width: `${(count / maxDna) * 100}%` }} /></div>
                <span className="text-xs text-neutral-400 w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-4">
        <h2 className="font-semibold mb-3 flex items-center text-sm dark:text-neutral-100"><TrophyIcon size={16} className="mr-2 text-yellow-500" />Achievements</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'First Bite', icon: '🍽️', progress: Math.min(profileData.dishes_rated ?? 0, 1), max: 1 },
            { name: 'Tier Master', icon: '🏆', progress: Math.min(profileData.tier_lists ?? 0, 5), max: 5 },
            { name: 'Social Foodie', icon: '👥', progress: Math.min(profileData.followers ?? 0, 10), max: 10 },
            { name: 'Streak King', icon: '🔥', progress: Math.min(streak, 7), max: 7 },
          ].map(badge => (
            <div key={badge.name} className="bg-neutral-50 dark:bg-neutral-700 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2"><span className="text-2xl">{badge.icon}</span><div className="text-sm font-medium dark:text-neutral-100">{badge.name}</div></div>
              <div className="h-1.5 bg-neutral-200 dark:bg-neutral-600 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${(badge.progress / badge.max) * 100}%` }} /></div>
              <p className="text-[10px] text-neutral-400 mt-1">{badge.progress}/{badge.max}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Ratings */}
      {profile?.recent_ratings && profile.recent_ratings.length > 0 && (
        <div className="mb-6 animate-fade-in-up stagger-5">
          <h2 className="font-semibold mb-3 flex items-center text-sm dark:text-neutral-100"><ListIcon size={16} className="mr-2 text-purple-500" />Recently Rated</h2>
          <div className="space-y-2">
            {profile.recent_ratings.map(rating => (
              <Link key={rating.dish_id} to={`/dish/${rating.dish_id}`} className="flex items-center bg-white dark:bg-neutral-800 rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow">
                <div className="h-12 w-12 rounded-lg overflow-hidden mr-3 shrink-0"><img src={rating.image_url} alt={rating.name} className="h-full w-full object-cover" loading="lazy" /></div>
                <div className="flex-1 min-w-0"><h3 className="font-medium text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{rating.name}</h3><p className="text-xs text-neutral-500">{rating.restaurant_name}</p></div>
                <TierBadge tier={rating.tier as TierType} size="sm" showEmoji={false} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Theme */}
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-6">
        <h2 className="font-semibold mb-3 text-sm dark:text-neutral-100">Appearance</h2>
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map(t => (
            <button key={t} onClick={() => setTheme(t)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors capitalize ${theme === t ? 'bg-purple-600 text-white' : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'}`}>{t}</button>
          ))}
        </div>
      </div>
    </div>
  )
}
