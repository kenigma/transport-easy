'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FavouriteTrip } from '@/lib/types'

const STORAGE_KEY = 'transport-easy:favourite-trips'
const SYNC_EVENT = 'favourite-trips-changed'

function load(): FavouriteTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: FavouriteTrip[] = raw ? JSON.parse(raw) : []
    // Migrate old 3-part IDs (stopId:serviceId:destination) to 2-part (stopId:destination)
    const migrated = parsed.map((t) => {
      const parts = t.id.split(':')
      const newId = parts.length === 3 ? `${parts[0]}:${parts[2]}` : t.id
      return { ...t, id: newId, walkMinutes: t.walkMinutes ?? 0, lat: t.lat ?? 0, lng: t.lng ?? 0, travelMinutes: t.travelMinutes ?? null, userDestination: t.userDestination ?? null }
    })
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
