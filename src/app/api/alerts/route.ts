import { NextRequest, NextResponse } from 'next/server'
import { getAlerts } from '@/lib/tfnsw/alerts'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { AlertsResponse } from '@/lib/types'

const CACHE_TTL_MS = 60_000  // Alerts change rarely; 1 minute cache

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const stopIdsParam = searchParams.get('stopIds') ?? ''
  const stopIds = stopIdsParam ? stopIdsParam.split(',').filter(Boolean) : []

  const cacheKey = `alerts:${stopIds.sort().join(',')}`
  const cached = cacheGet<AlertsResponse>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' },
    })
  }

  try {
    const alerts = await getAlerts(stopIds)
    const response: AlertsResponse = {
      alerts,
      fetchedAt: new Date().toISOString(),
    }
    cacheSet(cacheKey, response, CACHE_TTL_MS)
    return NextResponse.json(response, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    // 401 = API key doesn't have GTFS-RT alerts access — return empty silently
    const msg = err instanceof Error ? err.message : ''
    if (msg.includes('401')) {
      const empty: AlertsResponse = { alerts: [], fetchedAt: new Date().toISOString() }
      cacheSet(cacheKey, empty, CACHE_TTL_MS)
      return NextResponse.json(empty)
    }
    console.error('[/api/alerts]', err)
    return NextResponse.json({ error: 'Failed to fetch alerts.' }, { status: 502 })
  }
}
