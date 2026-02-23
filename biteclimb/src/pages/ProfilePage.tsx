import { Link } from 'react-router-dom'
import { SettingsIcon, EditIcon, UserIcon, ListIcon, StarIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { userProfile, userTierLists, dishes } from '../data/mockData'

export function ProfilePage() {
  const recentRatings = dishes.slice(0, 3)

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Profile</h1>
          <p className="text-sm text-neutral-500">BiteClimb</p>
        </div>
        <button className="p-2 rounded-full hover:bg-neutral-100" aria-label="Settings">
          <SettingsIcon size={20} className="text-neutral-600" />
        </button>
      </header>

      {/* User info */}
      <div className="flex items-center mb-6">
        <div className="relative mr-4">
          <img
            src={userProfile.avatar}
            alt={userProfile.name}
            className="w-20 h-20 rounded-full object-cover"
          />
          <button
            className="absolute bottom-0 right-0 bg-purple-600 text-white p-1 rounded-full"
            aria-label="Edit avatar"
          >
            <EditIcon size={14} />
          </button>
        </div>
        <div>
          <h2 className="text-xl font-semibold">{userProfile.name}</h2>
          <p className="text-sm text-neutral-600">{userProfile.bio}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex justify-between bg-white rounded-xl shadow-sm p-4 mb-6">
        <div className="text-center">
          <div className="text-xl font-bold text-neutral-900">{userProfile.stats.tierLists}</div>
          <div className="text-xs text-neutral-500">Tier Lists</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-neutral-900">{userProfile.stats.dishesRated}</div>
          <div className="text-xs text-neutral-500">Dishes Rated</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-neutral-900">{userProfile.stats.followers}</div>
          <div className="text-xs text-neutral-500">Followers</div>
        </div>
      </div>

      {/* Badges */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center">
          <StarIcon size={18} className="mr-2 text-yellow-500" />
          Earned Badges
        </h2>
        <div className="flex justify-between">
          {userProfile.badges.map((badge, index) => (
            <div key={index} className="flex flex-col items-center">
              <div className="text-3xl mb-1">{badge.icon}</div>
              <div className="text-sm font-medium">{badge.name}</div>
              <div className="text-xs text-neutral-500">Level {badge.level}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tier Lists */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center">
            <ListIcon size={18} className="mr-2 text-purple-500" />
            My Tier Lists
          </h2>
          <Link to="/tier-builder" className="text-sm font-medium text-purple-600">
            Create new
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {userTierLists.map((list) => (
            <Link
              key={list.id}
              to="/"
              className="block bg-white rounded-xl overflow-hidden shadow-sm"
            >
              <div className="relative h-24">
                <img
                  src={list.imageUrl}
                  alt={list.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <span className="text-xs text-white">{list.count} dishes</span>
                </div>
              </div>
              <div className="p-2">
                <h3 className="text-sm font-medium line-clamp-2">{list.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recently Rated */}
      <div className="mb-6">
        <h2 className="font-semibold mb-3 flex items-center">
          <UserIcon size={18} className="mr-2 text-purple-500" />
          Recently Rated
        </h2>
        <div className="space-y-3">
          {recentRatings.map((dish) => (
            <Link
              key={dish.id}
              to={`/dish/${dish.id}`}
              className="flex items-center bg-white rounded-lg p-2 shadow-sm"
            >
              <div className="h-14 w-14 rounded-md overflow-hidden mr-3 shrink-0">
                <img
                  src={dish.imageUrl}
                  alt={dish.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-neutral-900 line-clamp-1">{dish.name}</h3>
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
