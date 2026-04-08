'use client'

import useSWR from 'swr'
import type { NearbyResponse } from '@/lib/types'

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<NearbyResponse>
  })

interface Options {
  lat: number | null
  lng: number | null
  radius?: number
}

/**
 * SWR hook that fetches nearby stops and departures from /api/nearby.
 * Auto-refreshes every 20 seconds (within TfNSW's ~15 s realtime update window).
 * Passes null coords to suspend fetching until location is known.
 * Retains previous data between refreshes to avoid blank flashes.
 */
export function useNearbyDepartures({ lat, lng, radius = 500 }: Options) {
  const key =
    lat !== null && lng !== null
      ? `/api/nearby?lat=${lat}&lng=${lng}&radius=${radius}`
      : null

  const { data, error, isLoading, mutate } = useSWR<NearbyResponse>(key, fetcher, {
    refreshInterval: 20_000,         // 20s — within TfNSW 15s update window
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 10_000,
    keepPreviousData: true,           // no blank flash between refreshes
  })

  return { data, error, isLoading, refresh: mutate }
}
