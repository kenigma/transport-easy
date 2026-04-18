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
import { haversineKm } from '@/lib/tfnsw/vehiclePositions'
import { TimetableSheet } from './TimetableSheet'
import { WalkMap } from './WalkMap'

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
  const [showTimetable, setShowTimetable] = useState(false)
  const [showWalkMap, setShowWalkMap] = useState(false)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [orsWalkMins, setOrsWalkMins] = useState<number | null>(null)
  const { state: geoState } = useGeolocation()

  const gpsLat = geoState.status === 'granted' ? geoState.coords.lat : null
  const gpsLng = geoState.status === 'granted' ? geoState.coords.lng : null

  // Immediate haversine estimate (~5 km/h walking) — works without any API
  const haversineWalkMins = gpsLat && gpsLng && trip.lat && trip.lng
    ? Math.round(haversineKm(gpsLat, gpsLng, trip.lat, trip.lng) * 12)
    : null

  // ORS gives a more accurate routed walk time; falls back to haversine if unavailable
  useEffect(() => {
    if (!gpsLat || !gpsLng || !trip.lat || !trip.lng) return
    fetch(`/api/walktime?fromLat=${gpsLat}&fromLng=${gpsLng}&toLat=${trip.lat}&toLng=${trip.lng}`)
      .then(r => r.json())
      .then(d => { if (typeof d.walkMinutes === 'number') setOrsWalkMins(d.walkMinutes) })
      .catch(() => {})
  }, [gpsLat, gpsLng, trip.lat, trip.lng])

  const walkMins = orsWalkMins ?? haversineWalkMins

  // Only apply reachability/urgency logic when walk time is actionable (nearby)
  const actionableWalk = walkMins !== null && walkMins < 30 ? walkMins : 0

  const maxPastMinutes = trip.travelMinutes ?? 1
  const url = `/api/departures?stopId=${encodeURIComponent(trip.stopId)}&maxPastMinutes=${maxPastMinutes}`
  const { data, error, isLoading } = useSWR(url, fetchDepartures, { refreshInterval: 20_000 })

  const allDepartures = (data?.departures ?? []).filter((dep) => dep.mode === trip.mode)

  const reachable = allDepartures.filter((dep) => {
    if (dep.isCancelled) return false
    const mins = minutesUntil(effectiveTime(dep))
    return isReachable(mins, actionableWalk)
  })

  const primary = reachable[0] ?? null
  const secondary = reachable.slice(1, 3)

  const primaryMins = primary ? minutesUntil(effectiveTime(primary)) : null
  const primaryLevel = primaryMins !== null ? urgencyWithWalk(primaryMins, actionableWalk) : 'departed'
  const primaryMessage = primaryMins !== null
    ? (walkMins !== null ? humanMessage(primaryMins, actionableWalk) : formatCountdown(primaryMins))
    : null

  useEffect(() => {
    if (!isLoading && onPrimaryMinsChange) {
      onPrimaryMinsChange(trip.id, primaryMins)
    }
  }, [primaryMins, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer active:bg-gray-50"
        onClick={() => setShowTimetable(true)}
      >
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
              {trip.lat && trip.lng && gpsLat && gpsLng ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowWalkMap(true) }}
                  className="text-base p-1 text-gray-400 active:text-tfnsw-blue"
                  aria-label="Show walk to stop"
                >
                  📍
                </button>
              ) : null}
              {confirmingRemove ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                  onClick={(e) => { e.stopPropagation(); setConfirmingRemove(true) }}
                  className="text-tfnsw-blue text-base p-1"
                  aria-label="Remove from favourites"
                >
                  ★
                </button>
              )}
            </div>
          </div>

          {/* Live walk time */}
          {walkMins !== null && walkMins > 0 && (
            <p className="mt-2 text-xs text-gray-400">🚶 {walkMins} min walk</p>
          )}
        </div>

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
            <p className="pt-3 text-sm text-gray-400">No reachable services right now.</p>
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

          <p className="mt-2 text-xs text-gray-300">Tap for full timetable ›</p>
        </div>
      </div>

      {showTimetable && (
        <TimetableSheet
          stopId={trip.stopId}
          stopName={trip.stopName}
          serviceId={trip.serviceId}
          destination={trip.userDestination ?? trip.destination}
          mode={trip.mode}
          stopLat={trip.lat}
          stopLng={trip.lng}
          gpsLat={gpsLat}
          gpsLng={gpsLng}
          travelMinutes={trip.travelMinutes}
          onClose={() => setShowTimetable(false)}
        />
      )}

      {showWalkMap && gpsLat && gpsLng && trip.lat && trip.lng && (
        <WalkMap
          stopLat={trip.lat}
          stopLng={trip.lng}
          stopName={normalizeStopName(trip.stopName)}
          userLat={gpsLat}
          userLng={gpsLng}
          onClose={() => setShowWalkMap(false)}
        />
      )}
    </>
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
