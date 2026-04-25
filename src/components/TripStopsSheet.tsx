'use client'

import { useEffect } from 'react'
import useSWR from 'swr'
import type { Departure, StopOnRoute, TransportMode } from '@/lib/types'
import { normalizeStopName } from '@/lib/tfnsw/trip'
import { useCountdown } from '@/hooks/useCountdown'
import { VehicleMap } from './VehicleMap'
import { useState } from 'react'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Sydney',
  })
}

async function fetchStops(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch stop sequence')
  return res.json() as Promise<{ stops: StopOnRoute[] }>
}

interface Props {
  departure: Departure
  boardingStopId: string   // highlight the stop where user boards
  serviceId: string
  destination: string
  mode: TransportMode
  stopLat?: number
  stopLng?: number
  stopName: string
  onClose: () => void
}

export function TripStopsSheet({
  departure, boardingStopId, serviceId, destination, mode,
  stopLat, stopLng, stopName, onClose,
}: Props) {
  // Tick every 10s so the live "next stop" cursor advances without re-fetching
  useCountdown(10_000)
  const [showVehicleMap, setShowVehicleMap] = useState(false)

  const url = departure.terminalStopId
    ? `/api/trip-stops?boardingStopId=${encodeURIComponent(boardingStopId)}&terminalStopId=${encodeURIComponent(departure.terminalStopId)}&departureTime=${encodeURIComponent(departure.scheduledDepartureTime)}&serviceId=${encodeURIComponent(serviceId)}`
    : null

  const { data, error, isLoading } = useSWR(url, fetchStops)
  const stops = data?.stops ?? []

  // Find boarding stop index to highlight it
  const boardingIdx = stops.findIndex((s) => s.stopId === boardingStopId)

  // Live "next stop" cursor: first non-cancelled stop whose arrival time is
  // still in the future. EFA returns estimated arrivals when realtime is
  // available, so this advances naturally as the train progresses. Falls back
  // through arrival → departure (planned/estimated) so we still get a cursor
  // for terminal/origin stops where one of the two is null.
  const nowMs = Date.now()
  const tickTime = (s: StopOnRoute): number | null => {
    const t = s.estimatedArrival ?? s.plannedArrival ?? s.estimatedDeparture ?? s.plannedDeparture
    return t ? new Date(t).getTime() : null
  }
  const nextIdx = stops.findIndex((s) => {
    if (s.isCancelled) return false
    const t = tickTime(s)
    return t != null && t > nowMs
  })

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Departure time from origin
  const depTime = departure.estimatedDepartureTime ?? departure.scheduledDepartureTime

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-end bg-black/50"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          className="w-full max-h-[90vh] bg-white rounded-t-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">
                {serviceId} · departs {formatTime(depTime)}
              </p>
              <h2 className="text-base font-semibold text-gray-900 leading-snug truncate">
                → {normalizeStopName(destination)}
              </h2>
              {stops.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">{stops.length} stops</p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {departure.estimatedDepartureTime && stopLat && stopLng && (
                <button
                  onClick={() => setShowVehicleMap(true)}
                  className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-full font-medium"
                >
                  Live map
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 text-xl leading-none p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stop list */}
          <div className="overflow-y-auto flex-1 py-2">
            {!departure.tripId && (
              <p className="text-sm text-gray-400 text-center py-6">
                No trip data available for this departure.
              </p>
            )}

            {isLoading && (
              <div className="space-y-2 px-4 py-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-gray-400 text-center py-6">
                Could not load stop sequence.
              </p>
            )}

            {!isLoading && !error && stops.length > 0 && (
              <div className="relative">
                {stops.map((stop, i) => {
                  const isBoarding = i === boardingIdx
                  // Time-based: stops the train has already passed (cursor at nextIdx)
                  const isPast = nextIdx >= 0 ? i < nextIdx : true
                  const isNext = i === nextIdx
                  const time = stop.estimatedDeparture ?? stop.plannedDeparture ?? stop.plannedArrival
                  const hasLive = !!stop.estimatedDeparture
                  const isLast = i === stops.length - 1

                  // Dot/track styling: live "next stop" trumps boarding only
                  // for the dot's pulse — boarding still wins on track colour
                  // for users who want to see where they're getting on.
                  const dotClass = isBoarding
                    ? 'border-blue-600 bg-blue-600'
                    : isNext
                      ? 'border-blue-500 bg-blue-500 animate-pulse'
                      : isPast
                        ? 'border-gray-300 bg-gray-300'
                        : 'border-blue-400 bg-white'

                  return (
                    <div
                      key={`${stop.stopId}-${i}`}
                      className={`flex items-stretch gap-3 px-4 ${isBoarding ? 'bg-blue-50' : isNext ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Timeline column */}
                      <div className="flex flex-col items-center w-5 flex-shrink-0">
                        <div className={`w-px flex-1 ${i === 0 ? 'bg-transparent' : isPast ? 'bg-gray-200' : 'bg-blue-300'}`} />
                        <div className={`w-2.5 h-2.5 rounded-full border-2 flex-shrink-0 my-0.5 ${dotClass}`} />
                        <div className={`w-px flex-1 ${isLast ? 'bg-transparent' : isPast ? 'bg-gray-200' : 'bg-blue-300'}`} />
                      </div>

                      {/* Stop info */}
                      <div className={`flex-1 py-2.5 border-b border-gray-50 last:border-0 flex items-center justify-between min-w-0 ${isBoarding ? 'border-blue-100' : ''}`}>
                        <div className="min-w-0">
                          <p className={`text-sm truncate ${
                            isBoarding ? 'font-semibold text-blue-700'
                            : isNext ? 'font-semibold text-blue-700'
                            : isPast ? 'text-gray-400'
                            : 'text-gray-900'
                          }`}>
                            {normalizeStopName(stop.stopName)}
                            {(isBoarding || isNext) && (
                              <span className="ml-1.5 text-xs font-normal text-blue-500">
                                {isBoarding && 'Board here'}
                                {isBoarding && isNext && ' · '}
                                {isNext && 'Next'}
                              </span>
                            )}
                          </p>
                          {stop.platformName && (
                            <p className={`text-xs ${isPast ? 'text-gray-300' : 'text-gray-400'}`}>
                              Platform {stop.platformName}
                            </p>
                          )}
                          {stop.isCancelled && (
                            <p className="text-xs text-red-500">Cancelled</p>
                          )}
                        </div>
                        {time && (
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className={`text-sm tabular-nums ${
                              isBoarding ? 'font-semibold text-blue-700'
                              : isNext ? 'font-semibold text-blue-700'
                              : isPast ? 'text-gray-400'
                              : 'text-gray-700'
                            }`}>
                              {formatTime(time)}
                            </p>
                            {hasLive && stop.plannedDeparture && stop.estimatedDeparture !== stop.plannedDeparture && (
                              <p className="text-xs text-blue-500 tabular-nums">
                                live
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Stop sequence from TfNSW · subject to change
            </p>
          </div>
        </div>
      </div>

      {showVehicleMap && stopLat && stopLng && (
        <VehicleMap
          stopLat={stopLat}
          stopLng={stopLng}
          stopName={stopName}
          serviceId={serviceId}
          destination={destination}
          mode={mode}
          onClose={() => setShowVehicleMap(false)}
        />
      )}
    </>
  )
}
