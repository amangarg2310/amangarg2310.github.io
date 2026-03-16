import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeftIcon, NavigationIcon, XIcon } from 'lucide-react'
import { TierBadge } from '../components/TierBadge'
import { api } from '../api/client'
import { useLocationStore } from '../stores/locationStore'
import type { TierType } from '../data/types'
import type { DishData } from '../api/client'

export function MapViewPage() {
  const navigate = useNavigate()
  const { lat, lng, requestLocation } = useLocationStore()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const [selectedDish, setSelectedDish] = useState<DishData | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const { data: dishes = [] } = useQuery({
    queryKey: ['dishes', 'map', lat, lng],
    queryFn: () => api.dishes.list({ lat: lat ?? undefined, lng: lng ?? undefined, sort: 'nearby' }),
  })

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Import CSS
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)

      const center: [number, number] = [lat || 40.7128, lng || -74.006]
      const map = L.map(mapRef.current!, { zoomControl: false }).setView(center, 13)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map)

      L.control.zoom({ position: 'topright' }).addTo(map)

      mapInstanceRef.current = map
      setMapReady(true)

      return () => {
        map.remove()
        link.remove()
      }
    })
  }, [lat, lng])

  // Add markers when dishes load
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current!

      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) map.removeLayer(layer)
      })

      // Tier colors
      const tierColors: Record<string, string> = { S: '#9333ea', A: '#3b82f6', B: '#14b8a6', C: '#eab308', D: '#f97316', F: '#ef4444' }

      for (const dish of dishes) {
        if (!dish.lat || !dish.lng) continue

        const color = tierColors[dish.tier] || '#6b7280'
        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3)">${dish.tier}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })

        L.marker([dish.lat, dish.lng], { icon })
          .addTo(map)
          .on('click', () => setSelectedDish(dish))
      }

      // User location marker
      if (lat && lng) {
        const userIcon = L.divIcon({
          className: 'user-marker',
          html: '<div style="background:#3b82f6;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px #3b82f6,0 2px 8px rgba(59,130,246,0.4)"></div>',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })
        L.marker([lat, lng], { icon: userIcon }).addTo(map)
      }
    })
  }, [dishes, mapReady, lat, lng])

  return (
    <div className="h-screen relative">
      {/* Map container */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* Back button */}
      <div className="absolute top-4 left-4 z-[1000]">
        <button onClick={() => navigate(-1)} className="bg-white dark:bg-neutral-800 shadow-lg rounded-full p-2.5 active:scale-90 transition-transform">
          <ChevronLeftIcon size={22} className="text-neutral-700 dark:text-neutral-200" />
        </button>
      </div>

      {/* Locate me */}
      <div className="absolute top-4 right-14 z-[1000]">
        <button onClick={requestLocation} className="bg-white dark:bg-neutral-800 shadow-lg rounded-full p-2.5 active:scale-90 transition-transform">
          <NavigationIcon size={20} className="text-blue-500" />
        </button>
      </div>

      {/* Dish count */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="bg-white dark:bg-neutral-800 shadow-lg rounded-full px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200">
          {dishes.length} dishes nearby
        </div>
      </div>

      {/* Selected dish card */}
      {selectedDish && (
        <div className="absolute bottom-6 left-4 right-4 z-[1000] animate-slide-in-right">
          <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg overflow-hidden max-w-md mx-auto">
            <button onClick={() => setSelectedDish(null)} className="absolute top-3 right-3 z-10 bg-black/30 rounded-full p-1 text-white">
              <XIcon size={16} />
            </button>
            <Link to={`/dish/${selectedDish.id}`} className="flex">
              <div className="w-28 h-28 shrink-0">
                <img src={selectedDish.image_url} alt={selectedDish.name} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 p-3 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 line-clamp-1">{selectedDish.name}</h3>
                  <TierBadge tier={selectedDish.tier as TierType} size="sm" showEmoji={false} />
                </div>
                <p className="text-xs text-neutral-500 mb-1">{selectedDish.restaurant}</p>
                <p className="text-xs text-neutral-400">{selectedDish.location}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs font-medium dark:text-neutral-100">{selectedDish.price}</span>
                  {selectedDish.distance !== null && (
                    <span className="text-xs text-blue-600 font-medium">{selectedDish.distance.toFixed(1)} mi</span>
                  )}
                  <span className="text-xs text-neutral-400">{selectedDish.rating_count} ratings</span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}

// Leaflet type for map layers
declare global {
  namespace L {
    interface Map {
      eachLayer(fn: (layer: unknown) => void): void
    }
  }
}
