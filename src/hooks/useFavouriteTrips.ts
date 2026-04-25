'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FavouriteTrip, TripEndpoint, TransportMode } from '@/lib/types'

const STORAGE_KEY = 'transport-easy:favourite-trips'
const SYNC_EVENT = 'favourite-trips-changed'

// The legacy single-stop shape we migrate from. Fields kept loose intentionally —
// localStorage may carry partial data from any historical version.
interface LegacyFavouriteTrip {
  id?: string
  stopId?: string
  stopName?: string
  lat?: number
  lng?: number
  serviceId?: string
  lineName?: string | null
  destination?: string
  mode?: TransportMode
  walkMinutes?: number
  travelMinutes?: number | null
  // Already-migrated entries carry the new pair shape:
  endpointA?: TripEndpoint
  endpointB?: TripEndpoint | null
  terminalLabel?: string | null
}

/**
 * Builds the canonical id for a trip pair. When both endpoints are known we
 * sort the stopIds so A↔B and B↔A collapse to the same record. The mode +
 * serviceId variant lets the same endpoint pair coexist as distinct favourites
 * across modes (e.g. T1 train vs M1 metro between Chatswood and Town Hall).
 * When only one endpoint is known (legacy/unresolved Home-tab saves) we fall
 * back to the single-stop variant.
 */
export function tripPairId(
  a: TripEndpoint,
  b: TripEndpoint | null,
  mode: TransportMode,
  serviceId: string,
): string {
  const pair = b ? [a.stopId, b.stopId].sort().join(':') : a.stopId
  return `${pair}:${mode}:${serviceId}`
}

function migrate(t: LegacyFavouriteTrip): FavouriteTrip | null {
  // Already-new shape: trust endpointA, normalise endpointB undefined → null.
  if (t.endpointA) {
    const endpointA = t.endpointA
    const endpointB = t.endpointB ?? null
    const mode = (t.mode ?? 'unknown') as TransportMode
    const serviceId = t.serviceId ?? ''
    return {
      id: tripPairId(endpointA, endpointB, mode, serviceId),
      endpointA,
      endpointB,
      serviceId,
      lineName: t.lineName ?? null,
      mode,
      walkMinutes: t.walkMinutes ?? 0,
      travelMinutes: t.travelMinutes ?? null,
      terminalLabel: t.terminalLabel ?? null,
    }
  }
  // Legacy single-stop shape — promote the boarding stop to endpointA, leave
  // endpointB null. Auto-orient is disabled for this trip until the user
  // re-saves it via the Plan tab (which captures both endpoints) or via the
  // updated Home-tab save flow that resolves the terminal name.
  if (!t.stopId || !t.stopName) return null
  const endpointA: TripEndpoint = {
    stopId: t.stopId,
    stopName: t.stopName,
    lat: t.lat ?? 0,
    lng: t.lng ?? 0,
  }
  const mode = (t.mode ?? 'unknown') as TransportMode
  const serviceId = t.serviceId ?? ''
  return {
    id: tripPairId(endpointA, null, mode, serviceId),
    endpointA,
    endpointB: null,
    serviceId,
    lineName: t.lineName ?? null,
    mode,
    walkMinutes: t.walkMinutes ?? 0,
    travelMinutes: t.travelMinutes ?? null,
    // Preserve the original line-terminal name for display, since legacy
    // entries didn't store endpointB coords and reverse-orient is disabled.
    terminalLabel: t.destination ?? null,
  }
}

function load(): FavouriteTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: LegacyFavouriteTrip[] = raw ? JSON.parse(raw) : []
    const migrated = parsed
      .map(migrate)
      .filter((t): t is FavouriteTrip => t !== null)
    // Deduplicate by id (keep first occurrence)
    const seen = new Set<string>()
    return migrated.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true })
  } catch {
    return []
  }
}

function persist(trips: FavouriteTrip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
    // Notify all other hook instances on this page to reload
    window.dispatchEvent(new CustomEvent(SYNC_EVENT))
  } catch {
    // ignore
  }
}

/**
 * Manages the user's saved trips in localStorage.
 *
 * All instances of this hook on the same page share state via a custom DOM
 * event. When any instance writes to localStorage, all others reload.
 *
 * Storage key: `transport-easy:favourite-trips`
 */
export function useFavouriteTrips() {
  const [trips, setTrips] = useState<FavouriteTrip[]>([])

  useEffect(() => {
    setTrips(load())
    const handler = () => setTrips(load())
    window.addEventListener(SYNC_EVENT, handler)
    return () => window.removeEventListener(SYNC_EVENT, handler)
  }, [])

  const add = useCallback((trip: FavouriteTrip) => {
    setTrips((prev) => {
      if (prev.some((t) => t.id === trip.id)) return prev
      const next = [...prev, trip]
      persist(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setTrips((prev) => {
      const next = prev.filter((t) => t.id !== id)
      persist(next)
      return next
    })
  }, [])

  const toggle = useCallback((trip: FavouriteTrip) => {
    setTrips((prev) => {
      const exists = prev.some((t) => t.id === trip.id)
      const next = exists ? prev.filter((t) => t.id !== trip.id) : [...prev, trip]
      persist(next)
      return next
    })
  }, [])

  const updateWalkTime = useCallback((id: string, walkMinutes: number) => {
    setTrips((prev) => {
      const next = prev.map((t) => t.id === id ? { ...t, walkMinutes } : t)
      persist(next)
      return next
    })
  }, [])

  const isFavourite = useCallback((id: string) => trips.some((t) => t.id === id), [trips])

  return { trips, add, remove, toggle, isFavourite, updateWalkTime }
}
