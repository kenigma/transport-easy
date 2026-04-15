'use client'

import { useState } from 'react'
import { useNearbyDepartures } from '@/hooks/useNearbyDepartures'
import { useAlerts } from '@/hooks/useAlerts'
import { StopCard } from './StopCard'
import { AlertBanner } from './AlertBanner'
import { TransportTypeFilter } from './TransportTypeFilter'
import { LoadingSkeleton } from './LoadingSkeleton'
import type { TransportMode } from '@/lib/types'

interface Props {
  lat: number
  lng: number
}

export function NearbyDepartures({ lat, lng }: Props) {
  const [modeFilter, setModeFilter] = useState<Set<TransportMode>>(new Set())

  const { data, error, isLoading, refresh } = useNearbyDepartures({ lat, lng })

  const seenRoutes = new Set<string>()
  const stops = (data?.stops ?? [])
    .map((stop) =>
      modeFilter.size > 0
        ? { ...stop, departures: stop.departures.filter((d) => modeFilter.has(d.mode)) }
        : stop
    )
    .filter((stop) => modeFilter.size === 0 || stop.departures.length > 0)
    .map((stop) => ({
      ...stop,
      departures: stop.departures.filter((d) => {
        const key = `${d.serviceId}:${d.destination}`
        if (seenRoutes.has(key)) return false
        seenRoutes.add(key)
        return true
      }),
    }))
    .filter((stop) => stop.departures.length > 0)
  const stopIds = data?.stops.map((s) => s.stopId) ?? []
  const { alerts } = useAlerts(stopIds)

  const fetchedAt = data?.fetchedAt ? new Date(data.fetchedAt) : null
  const timeStr = fetchedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <TransportTypeFilter selected={modeFilter} onChange={setModeFilter} />

      {/* Alerts */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* Offline / error banner */}
      {error && (
        <div className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-sm text-gray-600 flex items-center gap-2">
          <span>📡</span>
          <span>No connection — data may be stale.</span>
          <button onClick={() => refresh()} className="ml-auto text-tfnsw-blue font-semibold">Retry</button>
        </div>
      )}

      {/* Loading state (first load only) */}
      {isLoading && !data && <LoadingSkeleton count={3} />}

      {/* Empty state */}
      {!isLoading && stops.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">🚏</p>
          <p className="text-sm">No stops found nearby.</p>
          <p className="text-xs mt-1">Try increasing the search radius.</p>
        </div>
      )}

      {/* Stop cards */}
      {stops.map((stop) => (
        <StopCard key={stop.stopId} stop={stop} />
      ))}

      {/* Last updated footer */}
      {timeStr && (
        <p className="text-center text-xs text-gray-400 pb-4">
          Updated {timeStr} · auto-refreshes every 20s
        </p>
      )}
    </div>
  )
}
