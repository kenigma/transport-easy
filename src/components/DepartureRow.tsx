'use client'

import { useState } from 'react'
import type { Departure, FavouriteTrip, StopResult, TripEndpoint } from '@/lib/types'
import { UrgencyBadge } from './UrgencyBadge'
import { TimetableSheet } from './TimetableSheet'
import { VehicleMap } from './VehicleMap'
import { useFavouriteTrips, tripPairId } from '@/hooks/useFavouriteTrips'
import { normalizeStopName } from '@/lib/tfnsw/trip'

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
  const { trips, add, remove } = useFavouriteTrips()

  // Match an existing favourite for this (stop, service, terminal) tuple.
  // Trip pairs are symmetric so either endpoint may be the boarding stop;
  // the other endpoint's name should fuzzy-match the line terminal.
  const normalizedTerminal = normalizeStopName(departure.destination)
  const existing: FavouriteTrip | null = trips.find((t) => {
    if (t.serviceId !== departure.serviceId || t.mode !== departure.mode) return false
    const a = t.endpointA
    const b = t.endpointB
    if (a.stopId === stopId && b && b.stopName.includes(normalizedTerminal)) return true
    if (b?.stopId === stopId && a.stopName.includes(normalizedTerminal)) return true
    return false
  }) ?? null
  const saved = existing !== null

  const emoji = MODE_EMOJI[departure.mode] ?? '🚌'
  const isRealTime = departure.estimatedDepartureTime !== null
  const showPlatform = departure.platformName && departure.platformName !== '0'

  // Resolves the line terminal name to a stop via /api/stop-search so the
  // saved trip can be a real location pair (and auto-orient by GPS).
  // Returns null when no result of the right mode is found — caller saves
  // a one-way favourite as a fallback.
  async function resolveTerminal(): Promise<TripEndpoint | null> {
    try {
      const res = await fetch(`/api/stop-search?q=${encodeURIComponent(normalizedTerminal)}`)
      if (!res.ok) return null
      const data = await res.json() as { results?: StopResult[] }
      const match = (data.results ?? []).find((r) => r.modes.includes(departure.mode))
        ?? (data.results ?? [])[0]
        ?? null
      if (!match) return null
      return {
        stopId: match.stopId,
        stopName: normalizeStopName(match.name),
        lat: match.lat,
        lng: match.lng,
      }
    } catch {
      return null
    }
  }

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (existing) {
      remove(existing.id)
      return
    }
    const endpointA: TripEndpoint = { stopId, stopName, lat: stopLat, lng: stopLng }
    const endpointB = await resolveTerminal()
    add({
      id: tripPairId(endpointA, endpointB, departure.mode, departure.serviceId),
      endpointA,
      endpointB,
      serviceId: departure.serviceId,
      lineName: departure.lineName,
      mode: departure.mode,
      walkMinutes: 0,
      travelMinutes: null,
      // Keep the line terminal as a display label for the case where the
      // stop-search above returned no match (endpointB null) — without it
      // the card has nothing to render on the right side of the arrow.
      terminalLabel: normalizedTerminal,
    })
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
