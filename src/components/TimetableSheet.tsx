'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import type { Departure, TransportMode, VehicleLocationResponse } from '@/lib/types'
import { minutesUntil, formatCountdown, effectiveTime } from '@/lib/time'
import { haversineKm } from '@/lib/tfnsw/vehiclePositions'
import { normalizeStopName } from '@/lib/tfnsw/trip'
import { useCountdown } from '@/hooks/useCountdown'
import { TripStopsSheet } from './TripStopsSheet'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Sydney',
  })
}

async function fetchDepartures(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json() as Promise<{ departures: Departure[] }>
}

async function fetchVehicles(url: string): Promise<VehicleLocationResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch vehicle positions')
  return res.json()
}

interface Props {
  stopId: string
  stopName: string
  serviceId: string
  destination: string
  mode: TransportMode
  stopLat?: number
  stopLng?: number
  gpsLat?: number | null
  gpsLng?: number | null
  travelMinutes?: number | null
  onClose: () => void
}

export function TimetableSheet({
  stopId, stopName, serviceId, destination, mode,
  stopLat, stopLng, gpsLat, gpsLng, travelMinutes, onClose,
}: Props) {
  useCountdown(10_000)
  const sheetRef = useRef<HTMLDivElement>(null)
  const nextRowRef = useRef<HTMLDivElement>(null)
  const [tripStopsDep, setTripStopsDep] = useState<Departure | null>(null)

  // Fetch extended departures: last 60 min + next 3 hrs
  // Note: don't filter by destination — departure monitor terminal may differ from trip leg destination
  const depUrl = `/api/departures?stopId=${encodeURIComponent(stopId)}&serviceId=${encodeURIComponent(serviceId)}&extended=true`
  const { data, error, isLoading } = useSWR(depUrl, fetchDepartures, { refreshInterval: 20_000 })
  const departures = data?.departures ?? []

  // GPS-based vehicle detection: poll every 10s using user's GPS as center
  const vehicleUrl = gpsLat && gpsLng && stopLat && stopLng
    ? `/api/vehicle-location?mode=${mode}&serviceId=${encodeURIComponent(serviceId)}&stopLat=${gpsLat}&stopLng=${gpsLng}`
    : null
  const { data: vehicleData } = useSWR<VehicleLocationResponse>(vehicleUrl, fetchVehicles, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
  })

  // On-board detection: a vehicle for this service is within 150m of user (GTFS-RT)
  // Trains are not in the GTFS-RT feed — no badge shown rather than a wrong one
  const isOnBoard = !!(gpsLat && gpsLng && vehicleData?.vehicles.some(
    (v) => haversineKm(gpsLat, gpsLng, v.lat, v.lng) < 0.15
  ))

  // Find the index of the next upcoming departure
  const nextIdx = departures.findIndex((d) => minutesUntil(effectiveTime(d)) >= 0)

  // Most recent past departure — shown as on-board when detected
  const pastDeps = departures
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => minutesUntil(effectiveTime(d)) < 0)
  const recentPastIdx = pastDeps.length > 0 ? pastDeps[pastDeps.length - 1].i : null

  const onBoardIdx = isOnBoard ? recentPastIdx : null

  // Scroll next departure into view once data loads
  useEffect(() => {
    if (nextRowRef.current) {
      nextRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [departures.length])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/40"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          ref={sheetRef}
          className="w-full max-h-[85vh] bg-white rounded-t-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{normalizeStopName(stopName)}</p>
              <h2 className="text-base font-semibold text-gray-900 leading-snug">
                {serviceId} → {normalizeStopName(destination)}
              </h2>
              {isOnBoard && (
                <p className="text-xs text-green-600 font-medium mt-0.5">🚉 On board</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 text-xl leading-none p-1 flex-shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 px-4 py-2">
            {isLoading && (
              <div className="space-y-2 py-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-gray-400 text-center py-6">
                Could not load timetable. Check your connection.
              </p>
            )}

            {!isLoading && !error && departures.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                No services found for this route.
              </p>
            )}

            {departures.map((dep, i) => {
              const t = effectiveTime(dep)
              const mins = minutesUntil(t)
              const isPast = mins < 0
              const isNext = i === nextIdx
              const isOnBoardDep = i === onBoardIdx
              const hasLive = !!dep.estimatedDepartureTime
              const arrivalIso = travelMinutes
                ? new Date(new Date(t).getTime() + travelMinutes * 60_000).toISOString()
                : null

              return (
                <div
                  key={`${dep.scheduledDepartureTime}-${i}`}
                  ref={isNext ? nextRowRef : undefined}
                  className={`
                    flex items-center justify-between py-3 border-b border-gray-50 last:border-0
                    ${isPast && !isOnBoardDep ? 'opacity-40' : ''}
                    ${isNext ? 'bg-blue-50 -mx-4 px-4' : ''}
                    ${isOnBoardDep ? 'bg-green-50 -mx-4 px-4' : ''}
                    ${dep.terminalStopId ? 'cursor-pointer active:bg-gray-50' : ''}
                  `}
                  onClick={() => { if (dep.terminalStopId) setTripStopsDep(dep) }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {isNext && <span className="w-1.5 h-1.5 rounded-full bg-tfnsw-blue flex-shrink-0" />}
                      {isOnBoardDep && <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                      <p className={`text-sm font-medium ${isNext ? 'text-tfnsw-blue' : isOnBoardDep ? 'text-green-700' : 'text-gray-900'}`}>
                        {formatTime(dep.scheduledDepartureTime)}
                        {hasLive && dep.estimatedDepartureTime !== dep.scheduledDepartureTime && (
                          <span className="ml-2 text-xs text-blue-600 font-normal">
                            {formatTime(dep.estimatedDepartureTime!)} live
                          </span>
                        )}
                      </p>
                    </div>
                    {arrivalIso && (
                      <p className="text-xs text-gray-400 ml-3.5">
                        arr {formatTime(arrivalIso)}
                      </p>
                    )}
                    {dep.platformName && dep.platformName !== '0' && (
                      <p className="text-xs text-gray-400 ml-3.5">Platform {dep.platformName}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isOnBoardDep ? (
                      <span className="text-xs font-semibold text-green-700 bg-green-100 px-2.5 py-1 rounded-full">
                        On board 🚉
                      </span>
                    ) : dep.isCancelled ? (
                      <span className="text-xs font-semibold text-red-600 bg-red-100 px-2.5 py-1 rounded-full">
                        Cancelled
                      </span>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        isPast ? 'text-gray-400 bg-gray-100'
                        : isNext ? 'text-tfnsw-blue bg-blue-100'
                        : 'text-gray-600 bg-gray-100'
                      }`}>
                        {isPast ? 'Departed' : formatCountdown(mins)}
                      </span>
                    )}
                    {dep.terminalStopId && (
                      <span className="text-gray-300 text-xs">›</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 text-center">
              Tap a departure to see all stops · updates every 20s
            </p>
          </div>
        </div>
      </div>

      {tripStopsDep && (
        <TripStopsSheet
          departure={tripStopsDep}
          boardingStopId={stopId}
          serviceId={serviceId}
          destination={destination}
          mode={mode}
          stopLat={stopLat}
          stopLng={stopLng}
          stopName={stopName}
          onClose={() => setTripStopsDep(null)}
        />
      )}
    </>
  )
}
