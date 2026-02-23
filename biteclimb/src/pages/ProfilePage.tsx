import { Link } from 'react-router-dom'
import {
  SettingsIcon, EditIcon, UserIcon, ListIcon,
  FlameIcon, TrophyIcon, CalendarIcon,
} from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { userProfile, userTierLists, dishes } from '../data/mockData'

export function ProfilePage() {
  const recentRatings = dishes.slice(0, 3)
  const dnaEntries = Object.entries(userProfile.tasteDNA).sort(([, a], [, b]) => b - a)
  const maxDna = Math.max(...dnaEntries.map(([, v]) => v))

  const cuisineColors: Record<string, string> = {
    Italian: 'bg-red-400',
    Japanese: 'bg-blue-400',
    Korean: 'bg-orange-400',
    Mexican: 'bg-green-400',
    Thai: 'bg-yellow-400',
    Indian: 'bg-purple-400',
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      <header className="flex justify-between items-center mb-6 animate-fade-in-up">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Profile</h1>
          <p className="text-sm text-neutral-500">biteclimb</p>
        </div>
        <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Settings">
          <SettingsIcon size={20} className="text-neutral-600" />
        </button>
      </header>

      {/* User info */}
      <div className="flex items-center mb-6 animate-fade-in-up stagger-1">
        <div className="relative mr-4 shrink-0">
          <img
            src={userProfile.avatar}
            alt={userProfile.name}
            className="w-20 h-20 rounded-full object-cover ring-2 ring-purple-100"
          />
          <button
            className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-full"
            aria-label="Edit avatar"
          >
            <EditIcon size={14} />
          </button>
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">{userProfile.name}</h2>
          <p className="text-sm text-neutral-600 line-clamp-2">{userProfile.bio}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {userProfile.foodPersonality}
            </span>
            <span className="text-xs text-neutral-400">Since {userProfile.joinedDate}</span>
          </div>
        </div>
      </div>

      {/* Stats + Streak */}
      <div className="grid grid-cols-4 gap-2 mb-6 animate-fade-in-up stagger-2">
        <div className="bg-white rounded-xl shadow-sm p-3 text-center">
          <div className="text-lg font-bold text-neutral-900">{userProfile.stats.tierLists}</div>
          <div className="text-[10px] text-neutral-500">Lists</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 text-center">
          <div className="text-lg font-bold text-neutral-900">{userProfile.stats.dishesRated}</div>
          <div className="text-[10px] text-neutral-500">Rated</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 text-center">
          <div className="text-lg font-bold text-neutral-900">{userProfile.stats.followers}</div>
          <div className="text-[10px] text-neutral-500">Followers</div>
        </div>
        <div className="bg-gradient-to-br from-orange-400 to-red-500 rounded-xl shadow-sm p-3 text-center text-white">
          <div className="text-lg font-bold flex items-center justify-center gap-0.5">
            <FlameIcon size={16} /> {userProfile.streak.current}
          </div>
          <div className="text-[10px] text-white/80">Day Streak</div>
        </div>
      </div>

      {/* Taste DNA */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-3">
        <h2 className="font-semibold mb-3 flex items-center text-sm">
          <span className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mr-2">
            <span className="text-white text-xs">🧬</span>
          </span>
          Your Taste DNA
        </h2>
        <div className="space-y-2.5">
          {dnaEntries.map(([cuisine, count]) => (
            <div key={cuisine} className="flex items-center gap-2">
              <span className="text-xs text-neutral-600 w-20 shrink-0">{cuisine}</span>
              <div className="flex-1 h-3 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${cuisineColors[cuisine] || 'bg-neutral-400'} transition-all duration-500`}
                  style={{ width: `${(count / maxDna) * 100}%` }}
                />
              </div>
              <span className="text-xs text-neutral-400 w-8 text-right">{count}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Achievements / Badges */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-4">
        <h2 className="font-semibold mb-3 flex items-center text-sm">
          <TrophyIcon size={16} className="mr-2 text-yellow-500" />
          Achievements
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {userProfile.badges.map((badge, index) => (
            <div key={index} className="bg-neutral-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{badge.icon}</span>
                <div>
                  <div className="text-sm font-medium">{badge.name}</div>
                  <div className="text-xs text-neutral-500">Level {badge.level}</div>
                </div>
              </div>
              <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                  style={{ width: `${(badge.progress / badge.maxProgress) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                {badge.progress}/{badge.maxProgress} to level {badge.level + 1}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Streak details */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 animate-fade-in-up stagger-5">
        <h2 className="font-semibold mb-3 flex items-center text-sm">
          <CalendarIcon size={16} className="mr-2 text-orange-500" />
          Rating Streak
        </h2>
        <div className="flex items-center justify-between">
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-500">{userProfile.streak.current}</div>
            <div className="text-xs text-neutral-500">Current</div>
          </div>
          <div className="flex-1 mx-4">
            {/* Week visualization */}
            <div className="flex justify-between gap-1">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      i < userProfile.streak.current % 7
                        ? 'bg-orange-400 text-white'
                        : i === userProfile.streak.current % 7
                          ? 'bg-orange-100 text-orange-600 ring-2 ring-orange-300'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {i < userProfile.streak.current % 7 ? '✓' : day}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-neutral-300">{userProfile.streak.best}</div>
            <div className="text-xs text-neutral-500">Best</div>
          </div>
        </div>
        <p className="text-xs text-neutral-500 text-center mt-3">
          Rate a dish today to keep your streak going!
        </p>
      </div>

      {/* Tier Lists */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center text-sm">
            <ListIcon size={16} className="mr-2 text-purple-500" />
            My Tier Lists
          </h2>
          <Link to="/tier-builder" className="text-xs font-medium text-purple-600">
            + Create new
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {userTierLists.map((list) => (
            <Link
              key={list.id}
              to="/"
              className="block bg-white rounded-xl overflow-hidden shadow-sm group"
            >
              <div className="relative h-24">
                <img
                  src={list.imageUrl}
                  alt={list.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <span className="text-xs text-white">{list.count} dishes</span>
                </div>
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium line-clamp-1">{list.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recently Rated */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3 flex items-center text-sm">
          <UserIcon size={16} className="mr-2 text-purple-500" />
          Recently Rated
        </h2>
        <div className="space-y-2">
          {recentRatings.map((dish) => (
            <Link
              key={dish.id}
              to={`/dish/${dish.id}`}
              className="flex items-center bg-white rounded-xl p-2.5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="h-12 w-12 rounded-lg overflow-hidden mr-3 shrink-0">
                <img
                  src={dish.imageUrl}
                  alt={dish.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-neutral-900 line-clamp-1">{dish.name}</h3>
                <p className="text-xs text-neutral-500">{dish.restaurant}</p>
              </div>
              <TierBadge tier={dish.tier} size="sm" showEmoji={false} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
