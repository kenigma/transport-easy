'use client'

import { useState } from 'react'
import type { Departure } from '@/lib/types'
import { UrgencyBadge } from './UrgencyBadge'
import { TimetableSheet } from './TimetableSheet'
import { VehicleMap } from './VehicleMap'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆',
  metro: '🚇',
  bus: '🚌',
  ferry: '⛴️',
  lightrail: '🚊',
  coach: '🚍',
  unknown: '🚌',
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
  const { isFavourite, add, remove } = useFavouriteTrips()

  const tripId = `${stopId}:${departure.destination}`
  const saved = isFavourite(tripId)

  const emoji = MODE_EMOJI[departure.mode] ?? '🚌'
  const isRealTime = departure.estimatedDepartureTime !== null
  const showPlatform = departure.platformName && departure.platformName !== '0'

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (saved) {
      remove(tripId)
    } else {
      add({
        id: tripId,
        stopId,
        stopName,
        serviceId: departure.serviceId,
        lineName: departure.lineName,
        destination: departure.destination,
        mode: departure.mode,
        walkMinutes: 0,
        lat: stopLat,
        lng: stopLng,
        travelMinutes: null,
        userDestination: null,
      })
    }
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
