'use client'

import useSWR from 'swr'
import type { AlertsResponse } from '@/lib/types'

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json() as Promise<AlertsResponse>
  })

export function useAlerts(stopIds: string[]) {
  const key = stopIds.length > 0
    ? `/api/alerts?stopIds=${stopIds.join(',')}`
    : null

  const { data, error } = useSWR<AlertsResponse>(key, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  })

  return {
    alerts: data?.alerts ?? [],
    error,
  }
}
