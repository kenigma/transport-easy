'use client'

import { useState } from 'react'
import type { Departure } from '@/lib/types'
import { UrgencyBadge } from './UrgencyBadge'
import { TimetableSheet } from './TimetableSheet'
import { VehicleMap } from './VehicleMap'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
import { useGeolocation } from '@/hooks/useGeolocation'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆',
  metro: '🚇',
  bus: '🚌',
  ferry: '⛴️',
  lightrail: '🚊',
  coach: '🚍',
  unknown: '🚌',
}

const WALK_PRESETS = [0, 3, 5, 8, 10, 15, 20]

function nearestPreset(minutes: number): number {
  return WALK_PRESETS.reduce((a, b) =>
    Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a
  )
}

interface Props {
  departure: Departure
  stopId: string
  stopName: string
  stopLat: number
  stopLng: number
}

export function DepartureRow({ departure, stopId, stopName, stopLat, stopLng }: Props) {
  const [showTimetable, setShowTimetable] = useState(false)
  const [showVehicleMap, setShowVehicleMap] = useState(false)
  const [showWalkPicker, setShowWalkPicker] = useState(false)
  const [walkEstimate, setWalkEstimate] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)
  const { isFavourite, add, remove } = useFavouriteTrips()
  const { state: geoState } = useGeolocation()

  const tripId = `${stopId}:${departure.serviceId}:${departure.destination}`
  const saved = isFavourite(tripId)

  const emoji = MODE_EMOJI[departure.mode] ?? '🚌'
  const isRealTime = departure.estimatedDepartureTime !== null
  const showPlatform = departure.platformName && departure.platformName !== '0'

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (saved) {
      remove(tripId)
      return
    }
    setShowWalkPicker(true)
    setWalkEstimate(null)

    // Auto-estimate walk time if GPS is available
    if (geoState.status === 'granted') {
      setEstimating(true)
      const { lat, lng } = geoState.coords
      fetch(`/api/walktime?fromLat=${lat}&fromLng=${lng}&toLat=${stopLat}&toLng=${stopLng}`)
        .then((r) => r.json())
        .then((d) => {
          if (typeof d.walkMinutes === 'number') {
            setWalkEstimate(nearestPreset(d.walkMinutes))
          }
        })
        .catch(() => {})
        .finally(() => setEstimating(false))
    }
  }

  const handlePickWalkTime = (mins: number) => {
    add({
      id: tripId,
      stopId,
      stopName,
      serviceId: departure.serviceId,
      lineName: departure.lineName,
      destination: departure.destination,
      mode: departure.mode,
      walkMinutes: mins,
      lat: stopLat,
      lng: stopLng,
    })
    setShowWalkPicker(false)
    setWalkEstimate(null)
  }

  return (
    <>
      <div
        className={`flex items-center gap-3 py-3 cursor-pointer active:bg-gray-50 -mx-1 px-1 rounded-lg transition-colors ${departure.isCancelled ? 'opacity-50' : ''}`}
        onClick={() => setShowTimetable(true)}
      >
        {/* Mode + service number */}
        <div className="flex items-center gap-1.5 min-w-[4rem]">
          <span className="text-xl" role="img" aria-label={departure.mode}>{emoji}</span>
          <span className="font-bold text-base text-gray-900 leading-none">{departure.serviceId}</span>
        </div>

        {/* Destination + line name + platform */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{departure.destination}</p>
          <p className="text-xs text-gray-500 truncate">
            {[departure.lineName, showPlatform ? departure.platformName : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {isRealTime && !departure.isCancelled && (
            <span className="inline-block text-xs text-blue-600 font-medium">Live</span>
          )}
        </div>

        {/* Live location button */}
        {isRealTime && !departure.isCancelled && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowVehicleMap(true) }}
            className="text-base p-1 flex-shrink-0 text-gray-400 active:text-tfnsw-blue"
            aria-label="Show live vehicle location"
          >
            🗺️
          </button>
        )}

        {/* Bookmark button */}
        <button
          onClick={handleSave}
          className={`text-lg p-1 flex-shrink-0 ${saved ? 'text-tfnsw-blue' : 'text-gray-300'}`}
          aria-label={saved ? 'Remove from favourites' : 'Save as favourite'}
        >
          {saved ? '★' : '☆'}
        </button>

        {/* Countdown badge */}
        <UrgencyBadge departure={departure} />
      </div>

      {/* Inline walk time picker */}
      {showWalkPicker && (
        <div
          className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-3 -mx-1 mb-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-500 font-medium">Walk time to this stop:</p>
            {estimating && (
              <span className="text-xs text-tfnsw-blue">Estimating…</span>
            )}
            {!estimating && walkEstimate !== null && (
              <span className="text-xs text-tfnsw-blue">~{walkEstimate === 0 ? 'No walk' : `${walkEstimate} min`} estimated</span>
            )}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {WALK_PRESETS.map((mins) => {
              const isEstimated = mins === walkEstimate
              return (
                <button
                  key={mins}
                  onClick={() => handlePickWalkTime(mins)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                    isEstimated
                      ? 'bg-tfnsw-blue text-white border-tfnsw-blue'
                      : 'bg-white border-gray-200 hover:border-tfnsw-blue hover:text-tfnsw-blue'
                  }`}
                >
                  {mins === 0 ? 'No walk' : `${mins} min`}{isEstimated ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
          <button
            onClick={() => { setShowWalkPicker(false); setWalkEstimate(null) }}
            className="mt-2 text-xs text-gray-400 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {showVehicleMap && (
        <VehicleMap
          stopLat={stopLat}
          stopLng={stopLng}
          stopName={stopName}
          serviceId={departure.serviceId}
          destination={departure.destination}
          mode={departure.mode}
          onClose={() => setShowVehicleMap(false)}
        />
      )}

      {showTimetable && (
        <TimetableSheet
          stopId={stopId}
          stopName={stopName}
          serviceId={departure.serviceId}
          destination={departure.destination}
          mode={departure.mode}
          onClose={() => setShowTimetable(false)}
        />
      )}
    </>
  )
}
