'use client'

import { useState, useEffect, useCallback } from 'react'
import type { FavouriteTrip } from '@/lib/types'

const STORAGE_KEY = 'transport-easy:favourite-trips'

function load(): FavouriteTrip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: FavouriteTrip[] = raw ? JSON.parse(raw) : []
    // Migrate old entries that don't have walkMinutes
    return parsed.map((t) => ({ ...t, walkMinutes: t.walkMinutes ?? 0, lat: t.lat ?? 0, lng: t.lng ?? 0, travelMinutes: t.travelMinutes ?? null, userDestination: t.userDestination ?? null }))
  } catch {
    return []
  }
}

function persist(trips: FavouriteTrip[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips))
  } catch {
    // ignore
  }
}

/**
 * Manages the user's saved trips in localStorage.
 *
 * Storage key: `transport-easy:favourite-trips`
 * Data is per-device — not shared across browsers or users.
 *
 * Handles migration for older entries that pre-date the `walkMinutes` and
 * `lat`/`lng` fields (defaults to 0 if absent).
 */
export function useFavouriteTrips() {
  const [trips, setTrips] = useState<FavouriteTrip[]>([])

  useEffect(() => {
    setTrips(load())
  }, [])

  const save = useCallback((next: FavouriteTrip[]) => {
    setTrips(next)
    persist(next)
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

  return { trips, add, remove, toggle, isFavourite, save, updateWalkTime }
}
