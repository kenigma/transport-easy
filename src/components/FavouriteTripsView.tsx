'use client'

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import type { FavouriteTrip, Departure } from '@/lib/types'
import { normalizeStopName } from '@/lib/tfnsw/trip'
import {
  minutesUntil, effectiveTime, formatCountdown, formatClockTime,
  isReachable, urgencyWithWalk, humanMessage,
} from '@/lib/time'
import { useCountdown } from '@/hooks/useCountdown'
import { useGeolocation } from '@/hooks/useGeolocation'
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

async function fetchDepartures(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json() as Promise<{ departures: Departure[] }>
}

function FavouriteTripCard({ trip, onRemove, onPrimaryMinsChange }: {
  trip: FavouriteTrip
  onRemove: (id: string) => void
  onPrimaryMinsChange?: (id: string, mins: number | null) => void
}) {
  useCountdown(10_000)
  const [showVehicleMap, setShowVehicleMap] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [walkMins, setWalkMins] = useState(trip.walkMinutes ?? 0)
  const { state: geoState } = useGeolocation()

  // Compute live walk time from GPS to stop
  const gpsLat = geoState.status === 'granted' ? geoState.coords.lat : null
  const gpsLng = geoState.status === 'granted' ? geoState.coords.lng : null

  useEffect(() => {
    if (!gpsLat || !gpsLng || !trip.lat || !trip.lng) return
    fetch(`/api/walktime?fromLat=${gpsLat}&fromLng=${gpsLng}&toLat=${trip.lat}&toLng=${trip.lng}`)
      .then(r => r.json())
      .then(d => { if (typeof d.walkMinutes === 'number') setWalkMins(d.walkMinutes) })
      .catch(() => {})
  }, [gpsLat, gpsLng, trip.lat, trip.lng])

  const maxPastMinutes = trip.travelMinutes ?? 1
  const url = `/api/departures?stopId=${encodeURIComponent(trip.stopId)}&maxPastMinutes=${maxPastMinutes}`
  const { data, error, isLoading } = useSWR(url, fetchDepartures, { refreshInterval: 20_000 })

  const allDepartures = (data?.departures ?? []).filter((dep) => dep.mode === trip.mode)

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

  const onBoard = (() => {
    if (!trip.travelMinutes) return null
    const candidates = allDepartures.filter((dep) => {
      if (dep.isCancelled) return false
      const mins = minutesUntil(effectiveTime(dep))
      return mins < 0 && Math.abs(mins) < trip.travelMinutes!
    })
    if (candidates.length === 0) return null
    candidates.sort((a, b) => minutesUntil(effectiveTime(b)) - minutesUntil(effectiveTime(a)))
    return candidates[0]
  })()

  const onBoardArrival = onBoard
    ? new Date(new Date(effectiveTime(onBoard)).getTime() + trip.travelMinutes! * 60_000).toISOString()
    : null

  useEffect(() => {
    if (!isLoading && onPrimaryMinsChange) {
      onPrimaryMinsChange(trip.id, primaryMins)
    }
  }, [primaryMins, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-500 truncate">
              {MODE_EMOJI[trip.mode] ?? '🚌'} {normalizeStopName(trip.stopName)}
            </p>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              → {normalizeStopName(trip.userDestination ?? trip.destination)}
            </h2>
            {trip.lineName && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{trip.lineName}</p>
            )}
            {trip.userDestination && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">via {trip.destination} service</p>
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
                href={`https://maps.apple.com/?q=${encodeURIComponent(normalizeStopName(trip.stopName))}&ll=${trip.lat},${trip.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base p-1"
                aria-label="Open in Maps"
                onClick={(e) => e.stopPropagation()}
              >
                📍
              </a>
            ) : null}
            {confirmingRemove ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onRemove(trip.id)}
                  className="text-xs font-medium text-white bg-red-500 rounded-full px-2 py-0.5"
                >
                  Remove
                </button>
                <button
                  onClick={() => setConfirmingRemove(false)}
                  className="text-xs text-gray-400 px-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingRemove(true)}
                className="text-tfnsw-blue text-base p-1"
                aria-label="Remove from favourites"
              >
                ★
              </button>
            )}
          </div>
        </div>

        {/* Live walk time */}
        {walkMins > 0 && (
          <p className="mt-2 text-xs text-gray-400">🚶 {walkMins} min walk</p>
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

        {!isLoading && !error && primary === null && onBoard === null && (
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
              <span className="font-semibold text-gray-900">{primary.serviceId} · {formatCountdown(primaryMins!)}</span>
              <span className="text-gray-400 ml-1">· {formatClockTime(effectiveTime(primary))}</span>
              {trip.travelMinutes != null && (
                <span className="text-gray-400 ml-1">
                  → {formatClockTime(new Date(new Date(effectiveTime(primary)).getTime() + trip.travelMinutes * 60_000).toISOString())}
                </span>
              )}
            </div>
          </div>
        )}

        {secondary.length > 0 && (
          <div className="flex gap-3 mt-2">
            {secondary.map((dep, i) => {
              const mins = minutesUntil(effectiveTime(dep))
              return (
                <span key={`${dep.scheduledDepartureTime}-${i}`} className="text-xs text-gray-400">
                  {i === 0 ? 'Then' : '·'} {dep.serviceId} {formatCountdown(mins)} · {formatClockTime(effectiveTime(dep))}
                </span>
              )
            })}
          </div>
        )}

        {onBoard && onBoardArrival && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-base">🚉</span>
            <p className="text-sm text-blue-700 font-medium">
              On board · arrives {normalizeStopName(trip.userDestination ?? trip.destination)} {formatClockTime(onBoardArrival)}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  trips: FavouriteTrip[]
  onRemove: (id: string) => void
}

export function FavouriteTripsView({ trips, onRemove }: Props) {
  const [sortKeys, setSortKeys] = useState<Record<string, number>>({})

  const handlePrimaryMins = useCallback((id: string, mins: number | null) => {
    setSortKeys((prev) => ({ ...prev, [id]: mins ?? Infinity }))
  }, [])

  if (trips.length === 0) return null

  const sorted = [...trips].sort((a, b) => {
    return (sortKeys[a.id] ?? Infinity) - (sortKeys[b.id] ?? Infinity)
  })

  return (
    <div className="space-y-4">
      {sorted.map((trip) => (
        <FavouriteTripCard key={trip.id} trip={trip} onRemove={onRemove} onPrimaryMinsChange={handlePrimaryMins} />
      ))}
    </div>
  )
}
