'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { FavouriteTrip, Departure } from '@/lib/types'
import {
  minutesUntil, effectiveTime, formatCountdown,
  isReachable, urgencyWithWalk, humanMessage,
} from '@/lib/time'
import { useCountdown } from '@/hooks/useCountdown'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
import { VehicleMap } from './VehicleMap'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

const URGENCY_STYLES = {
  urgent: 'bg-red-500 text-white animate-pulse',
  soon:   'bg-orange-400 text-white',
  ok:     'bg-green-500 text-white',
  departed: 'bg-gray-300 text-gray-600',
}

const WALK_PRESETS = [0, 3, 5, 8, 10, 15, 20]

async function fetchDepartures(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json() as Promise<{ departures: Departure[] }>
}

function WalkTimePicker({ currentMins, onSelect, onClose }: {
  currentMins: number
  onSelect: (mins: number) => void
  onClose: () => void
}) {
  return (
    <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-3">
      <p className="text-xs text-gray-500 mb-2 font-medium">Walk time to stop:</p>
      <div className="flex gap-1.5 flex-wrap">
        {WALK_PRESETS.map((mins) => (
          <button
            key={mins}
            onClick={() => onSelect(mins)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              mins === currentMins
                ? 'bg-tfnsw-blue text-white border-tfnsw-blue'
                : 'bg-white border-gray-200 hover:border-tfnsw-blue hover:text-tfnsw-blue'
            }`}
          >
            {mins === 0 ? 'No walk' : `${mins} min`}
          </button>
        ))}
      </div>
      <button onClick={onClose} className="mt-2 text-xs text-gray-400 underline">Done</button>
    </div>
  )
}

function FavouriteTripCard({ trip }: { trip: FavouriteTrip }) {
  useCountdown(10_000)
  const [editingWalk, setEditingWalk] = useState(false)
  const [showVehicleMap, setShowVehicleMap] = useState(false)
  const { updateWalkTime, remove } = useFavouriteTrips()

  const url = `/api/departures?stopId=${encodeURIComponent(trip.stopId)}&serviceId=${encodeURIComponent(trip.serviceId)}&destination=${encodeURIComponent(trip.destination)}`
  const { data, error, isLoading } = useSWR(url, fetchDepartures, { refreshInterval: 20_000 })

  const walkMins = trip.walkMinutes ?? 0
  const allDepartures = data?.departures ?? []

  const reachable = allDepartures.filter((dep) => {
    if (dep.isCancelled) return false
    const mins = minutesUntil(effectiveTime(dep))
    return isReachable(mins, walkMins)
  })

  const primary = reachable[0] ?? null
  const secondary = reachable.slice(1, 3)

  const primaryMins = primary ? minutesUntil(effectiveTime(primary)) : null
  const primaryLevel = primaryMins !== null ? urgencyWithWalk(primaryMins, walkMins) : 'departed'
  const primaryMessage = primaryMins !== null ? humanMessage(primaryMins, walkMins) : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 truncate">
              {MODE_EMOJI[trip.mode] ?? '🚌'} {trip.stopName}
            </p>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              {trip.serviceId} → {trip.destination}
            </h2>
            {trip.lineName && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{trip.lineName}</p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {primary?.estimatedDepartureTime && !primary.isCancelled && (
              <button
                onClick={() => setShowVehicleMap(true)}
                className="text-base p-1 text-gray-400 active:text-tfnsw-blue"
                aria-label="Show live vehicle location"
              >
                🗺️
              </button>
            )}
            {trip.lat && trip.lng ? (
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(trip.stopName)}&ll=${trip.lat},${trip.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base p-1"
                aria-label="Open in Maps"
                onClick={(e) => e.stopPropagation()}
              >
                📍
              </a>
            ) : null}
            <button
              onClick={() => remove(trip.id)}
              className="text-gray-300 text-base p-1"
              aria-label="Remove from favourites"
            >
              ★
            </button>
          </div>
        </div>

        {/* Walk time chip */}
        <button
          onClick={() => setEditingWalk((v) => !v)}
          className="mt-2 text-xs border border-gray-200 rounded-full px-2.5 py-1 text-gray-500 hover:border-tfnsw-blue hover:text-tfnsw-blue transition-colors"
        >
          🚶 {walkMins === 0 ? 'Add walk time' : `${walkMins} min walk`}
        </button>

        {editingWalk && (
          <WalkTimePicker
            currentMins={walkMins}
            onSelect={(mins) => { updateWalkTime(trip.id, mins); setEditingWalk(false) }}
            onClose={() => setEditingWalk(false)}
          />
        )}
      </div>

      {showVehicleMap && (
        <VehicleMap
          stopLat={trip.lat}
          stopLng={trip.lng}
          stopName={trip.stopName}
          serviceId={trip.serviceId}
          destination={trip.destination}
          mode={trip.mode}
          onClose={() => setShowVehicleMap(false)}
        />
      )}

      {/* Departures */}
      <div className="px-4 pb-3 border-t border-gray-50">
        {isLoading && (
          <div className="space-y-2 pt-3">
            <div className="h-10 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-6 bg-gray-100 rounded-xl animate-pulse w-2/3" />
          </div>
        )}

        {error && (
          <p className="pt-3 text-sm text-gray-400">Could not load departures.</p>
        )}

        {!isLoading && !error && primary === null && (
          <p className="pt-3 text-sm text-gray-400">
            No reachable services right now.
          </p>
        )}

        {primary !== null && (
          <div className="flex items-center gap-3 pt-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold min-w-[5rem] justify-center ${URGENCY_STYLES[primaryLevel]}`}>
              {primaryMessage}
            </span>
            <div className="text-sm text-gray-600">
              Departs in <span className="font-semibold text-gray-900">{formatCountdown(primaryMins!)}</span>
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div className="flex gap-3 mt-2">
            {secondary.map((dep, i) => {
              const mins = minutesUntil(effectiveTime(dep))
              return (
                <span key={`${dep.scheduledDepartureTime}-${i}`} className="text-xs text-gray-400">
                  {i === 0 ? 'Then' : '·'} {formatCountdown(mins)}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  trips: FavouriteTrip[]
}

export function FavouriteTripsView({ trips }: Props) {
  if (trips.length === 0) return null

  return (
    <div className="space-y-4">
      {trips.map((trip) => (
        <FavouriteTripCard key={trip.id} trip={trip} />
      ))}
    </div>
  )
}
