import { NextRequest, NextResponse } from 'next/server'
import { getTrip } from '@/lib/tfnsw/trip'
import { fixFirstWalkLeg } from '@/lib/walkfix'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { TripResponse } from '@/lib/types'

const NSW_BOUNDS = { minLat: -37.5, maxLat: -28.0, minLng: 140.9, maxLng: 154.0 }
const CACHE_TTL_MS = 5 * 60 * 1000

function inBounds(lat: number, lng: number): boolean {
  return lat >= NSW_BOUNDS.minLat && lat <= NSW_BOUNDS.maxLat
    && lng >= NSW_BOUNDS.minLng && lng <= NSW_BOUNDS.maxLng
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const fromLat = parseFloat(searchParams.get('fromLat') ?? '')
  const fromLng = parseFloat(searchParams.get('fromLng') ?? '')
  const toLat = parseFloat(searchParams.get('toLat') ?? '')
  const toLng = parseFloat(searchParams.get('toLng') ?? '')
  const fromName = searchParams.get('fromName') ?? 'Current location'
  const toName = searchParams.get('toName') ?? 'Destination'

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return NextResponse.json({ error: 'fromLat, fromLng, toLat, toLng are required' }, { status: 400 })
  }

  if (!inBounds(fromLat, fromLng) || !inBounds(toLat, toLng)) {
    return NextResponse.json({ error: 'Coordinates must be within NSW' }, { status: 400 })
  }

  const cacheKey = `trip:${fromLat.toFixed(3)},${fromLng.toFixed(3)}:${toLat.toFixed(3)},${toLng.toFixed(3)}`
  const cached = cacheGet<TripResponse>(cacheKey)
  if (cached) {
    return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } })
  }

  try {
    const rawJourneys = await getTrip(fromLat, fromLng, toLat, toLng)

    // Fix first walk leg in parallel across all journeys
    const journeys = await Promise.all(
      rawJourneys.map((j) => fixFirstWalkLeg(j, fromLat, fromLng))
    )

    const response: TripResponse = {
      journeys,
      originName: fromName,
      destinationName: toName,
      fetchedAt: new Date().toISOString(),
    }

    cacheSet(cacheKey, response, CACHE_TTL_MS)

    return NextResponse.json(response, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[/api/trip]', err)
    return NextResponse.json({ error: 'Could not fetch trip options. Please try again.' }, { status: 502 })
  }
}
