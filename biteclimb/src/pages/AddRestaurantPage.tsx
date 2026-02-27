import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  ChevronLeftIcon, MapPinIcon, UtensilsIcon, ImageIcon,
} from 'lucide-react'
import { api } from '../api/client'
import { useLocationStore } from '../stores/locationStore'

const CUISINE_OPTIONS = [
  'Italian', 'Japanese', 'Korean', 'Mexican', 'Thai', 'Indian',
  'Chinese', 'Vietnamese', 'American', 'Mediterranean', 'French',
  'Spanish', 'Middle Eastern', 'Caribbean', 'Other',
]

export function AddRestaurantPage() {
  const navigate = useNavigate()
  const { lat, lng } = useLocationStore()
  const [name, setName] = useState('')
  const [cuisine, setCuisine] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [useMyLocation, setUseMyLocation] = useState(false)

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.restaurants.create>[0]) =>
      api.restaurants.create(data),
    onSuccess: (result) => {
      navigate(`/restaurant/${result.id}`)
    },
  })

  const handleSubmit = () => {
    if (name.trim().length < 2 || !cuisine) return

    createMutation.mutate({
      name: name.trim(),
      cuisine,
      neighborhood: neighborhood.trim() || undefined,
      image_url: imageUrl.trim() || undefined,
      lat: useMyLocation && lat ? lat : undefined,
      lng: useMyLocation && lng ? lng : undefined,
    })
  }

  return (
    <div className="max-w-md mx-auto px-4 py-6 page-enter">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-90 transition-transform"
        >
          <ChevronLeftIcon size={24} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Add Restaurant</h1>
          <p className="text-xs text-neutral-500">Help grow the BiteClimb community</p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <UtensilsIcon size={14} className="inline mr-1" />
            Restaurant Name *
          </label>
          <input
            type="text"
            placeholder="e.g. Olivia"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Cuisine */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Cuisine *
          </label>
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map((c) => (
              <button
                key={c}
                onClick={() => setCuisine(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  cuisine === c
                    ? 'bg-purple-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Neighborhood */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <MapPinIcon size={14} className="inline mr-1" />
            Neighborhood
          </label>
          <input
            type="text"
            placeholder="e.g. South Tampa"
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Image URL */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            <ImageIcon size={14} className="inline mr-1" />
            Image URL (optional)
          </label>
          <input
            type="text"
            placeholder="https://..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="w-full p-3 text-sm border border-neutral-200 dark:border-neutral-700 rounded-xl bg-white dark:bg-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Location */}
        {lat && lng && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={useMyLocation}
              onChange={(e) => setUseMyLocation(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Use my current location</span>
          </label>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={name.trim().length < 2 || !cuisine || createMutation.isPending}
          className="w-full py-3 bg-purple-600 text-white rounded-xl font-medium text-sm hover:bg-purple-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? 'Creating...' : 'Create Restaurant'}
        </button>

        {createMutation.isError && (
          <p className="text-sm text-red-500 text-center">
            {(createMutation.error as Error).message || 'Failed to create restaurant'}
          </p>
        )}
      </div>
    </div>
  )
}
