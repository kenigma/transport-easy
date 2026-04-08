import { NextRequest, NextResponse } from 'next/server'
import { findNearbyStops } from '@/lib/tfnsw/stopFinder'
import { getDepartures } from '@/lib/tfnsw/departures'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { NearbyResponse } from '@/lib/types'

// NSW bounding box for basic validation
const NSW_BOUNDS = { minLat: -37.5, maxLat: -28.0, minLng: 140.9, maxLng: 154.0 }
const CACHE_TTL_MS = 15_000  // 15 seconds — matches TfNSW real-time update frequency

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')
  const radiusStr = searchParams.get('radius') ?? '500'
  const modesParam = searchParams.get('modes') // comma-separated, optional

  // Validate coordinates
  const lat = parseFloat(latStr ?? '')
  const lng = parseFloat(lngStr ?? '')
  if (
    isNaN(lat) || isNaN(lng) ||
    lat < NSW_BOUNDS.minLat || lat > NSW_BOUNDS.maxLat ||
    lng < NSW_BOUNDS.minLng || lng > NSW_BOUNDS.maxLng
  ) {
    return NextResponse.json(
      { error: 'Invalid or missing coordinates. Must be within NSW.' },
      { status: 400 }
    )
  }

  const radius = Math.min(Math.max(parseInt(radiusStr, 10) || 500, 100), 1000)

  // Round to 3 decimal places (~111m) for cache key
  const cacheKey = `nearby:${lat.toFixed(3)},${lng.toFixed(3)},${radius}`
  const cached = cacheGet<NearbyResponse>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' },
    })
  }

  try {
    // Step 1: find nearby stops
    const stops = await findNearbyStops(lat, lng, radius, 10)

    // Step 2: fetch departures for all stops concurrently
    const results = await Promise.allSettled(
      stops.map((stop) => getDepartures(stop.stopId, 5))
    )

    const stopsWithDepartures = stops.map((stop, i) => {
      const result = results[i]
      const departures = result.status === 'fulfilled' ? result.value : []
      return { ...stop, departures }
    })

    const response: NearbyResponse = {
      stops: stopsWithDepartures,
      fetchedAt: new Date().toISOString(),
    }

    cacheSet(cacheKey, response, CACHE_TTL_MS)

    return NextResponse.json(response, {
      headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    console.error('[/api/nearby]', err)
    return NextResponse.json(
      { error: 'Failed to fetch transport data. Please try again.' },
      { status: 502 }
    )
  }
}
