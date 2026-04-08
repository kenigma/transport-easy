'use client'

import type { StopWithDepartures } from '@/lib/types'
import { DepartureRow } from './DepartureRow'

const MODE_ICON: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}km`
}

interface Props {
  stop: StopWithDepartures
}

export function StopCard({ stop }: Props) {
  const modeIcons = Array.from(new Set(stop.modes)).map((m) => MODE_ICON[m] ?? '🚌').join(' ')
  const mapsUrl = `https://maps.apple.com/?q=${encodeURIComponent(stop.stopName)}&ll=${stop.lat},${stop.lng}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Stop header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 font-medium">{modeIcons} · {formatDistance(stop.distance)} away</p>
          <h2 className="text-base font-semibold text-gray-900 mt-0.5 leading-snug">{stop.stopName}</h2>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xl p-1 -mt-1 flex-shrink-0"
          aria-label="Open in Maps"
          onClick={(e) => e.stopPropagation()}
        >
          📍
        </a>
      </div>

      {/* Departures */}
      <div className="px-4 pb-2 divide-y divide-gray-50">
        {stop.departures.length === 0 ? (
          <p className="py-3 text-sm text-gray-400">No upcoming departures</p>
        ) : (
          stop.departures.map((dep, i) => (
            <DepartureRow
              key={`${dep.serviceId}-${dep.scheduledDepartureTime}-${i}`}
              departure={dep}
              stopId={stop.stopId}
              stopName={stop.stopName}
              stopLat={stop.lat}
              stopLng={stop.lng}
            />
          ))
        )}
      </div>
    </div>
  )
}
