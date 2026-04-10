'use client'

import type { TripLeg } from '@/lib/types'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Australia/Sydney',
  })
}

function formatWalkDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return 'less than a minute'
  return `${mins} min`
}

interface Props {
  leg: TripLeg
}

export function LegRow({ leg }: Props) {
  const { isFavourite, add, remove } = useFavouriteTrips()

  if (leg.isWalk) {
    const dur = leg.walkDurationSeconds ?? leg.durationSeconds
    return (
      <div className="flex items-start gap-3 py-2">
        <div className="flex flex-col items-center w-6 flex-shrink-0">
          <span className="text-sm">🚶</span>
          <div className="w-px flex-1 bg-gray-200 mt-1" />
        </div>
        <p className="text-sm text-gray-500 pt-0.5">
          Walk ~{formatWalkDuration(dur)}
        </p>
      </div>
    )
  }

  const tripId = leg.stopId
    ? `${leg.stopId}:${leg.serviceId}:${leg.legDestination}`
    : null
  const saved = tripId ? isFavourite(tripId) : false
  const emoji = MODE_EMOJI[leg.mode ?? 'unknown'] ?? '🚌'

  const handleSave = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!tripId || !leg.stopId) return
    if (saved) {
      remove(tripId)
    } else {
      const travelMinutes =
        leg.originDeparturePlanned && leg.destinationArrivalPlanned
          ? Math.round(
              (new Date(leg.destinationArrivalPlanned).getTime() -
                new Date(leg.originDeparturePlanned).getTime()) /
                60_000
            )
          : null

      add({
        id: tripId,
        stopId: leg.stopId,
        stopName: leg.originName,
        serviceId: leg.serviceId!,
        lineName: leg.lineName,
        destination: leg.legDestination ?? leg.destinationName,
        mode: leg.mode ?? 'unknown',
        walkMinutes: 0,
        lat: leg.stopLat ?? 0,
        lng: leg.stopLng ?? 0,
        travelMinutes,
      })
    }
  }

  const depPlanned = leg.originDeparturePlanned
  const depEstimated = leg.originDepartureEstimated
  const isLive = depEstimated && depPlanned && depEstimated !== depPlanned

  return (
    <div className={`flex items-start gap-3 py-2 ${leg.isCancelled ? 'opacity-50' : ''}`}>
      {/* Vertical connector */}
      <div className="flex flex-col items-center w-6 flex-shrink-0">
        <span className="text-sm">{emoji}</span>
        <div className="w-px flex-1 bg-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {leg.serviceId}
              {leg.isCancelled && (
                <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-normal">Cancelled</span>
              )}
            </p>
            <p className="text-sm text-gray-700 truncate">{leg.originName}</p>
            {leg.platformName && (
              <p className="text-xs text-gray-400">Platform {leg.platformName}</p>
            )}
            {leg.legDestination && (
              <p className="text-xs text-gray-500">towards {leg.legDestination}</p>
            )}
          </div>

          <div className="text-right flex-shrink-0">
            {depPlanned && (
              <p className={`text-sm font-medium ${isLive ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {formatTime(depPlanned)}
              </p>
            )}
            {isLive && depEstimated && (
              <p className="text-sm font-semibold text-blue-600">
                {formatTime(depEstimated)} <span className="text-xs font-normal">live</span>
              </p>
            )}
          </div>
        </div>

        {/* Arrival at leg destination */}
        {leg.destinationArrivalPlanned && (
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-500">Arrive {leg.destinationName}</p>
            <p className="text-xs text-gray-500">{formatTime(leg.destinationArrivalPlanned)}</p>
          </div>
        )}

        {/* Save button */}
        {tripId && (
          <button
            onClick={handleSave}
            className={`mt-1 text-xs flex items-center gap-1 ${saved ? 'text-tfnsw-blue' : 'text-gray-300'}`}
            aria-label={saved ? 'Remove from favourites' : 'Save as favourite trip'}
          >
            {saved ? '★' : '☆'} {saved ? 'Saved' : 'Save trip'}
          </button>
        )}
      </div>
    </div>
  )
}
