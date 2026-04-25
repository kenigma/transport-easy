import { NextRequest, NextResponse } from 'next/server'
import { getTrip, journeyFingerprint } from '@/lib/tfnsw/trip'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { Journey, TimetableEntry, TimetableResponse } from '@/lib/types'

const NSW_BOUNDS = { minLat: -37.5, maxLat: -28.0, minLng: 140.9, maxLng: 154.0 }
const CACHE_TTL_MS = 60 * 60 * 1000 // 60 min

function inBounds(lat: number, lng: number): boolean {
  return lat >= NSW_BOUNDS.minLat && lat <= NSW_BOUNDS.maxLat
    && lng >= NSW_BOUNDS.minLng && lng <= NSW_BOUNDS.maxLng
}

function sydneyDateAtHour(hour: number, sydneyDateStr?: string): Date {
  const now = new Date()
  const sydStr = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(now)
  const utcNowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
  const sydNowHour = parseInt(sydStr.slice(11, 13))
  const sydNowMin = parseInt(sydStr.slice(14, 16))
  let offsetMin = (sydNowHour * 60 + sydNowMin) - utcNowMin
  if (offsetMin < -720) offsetMin += 1440
  if (offsetMin > 720) offsetMin -= 1440
  const dateStr = sydneyDateStr ?? sydStr.slice(0, 10)
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - offsetMin * 60 * 1000)
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fromLat = parseFloat(searchParams.get('fromLat') ?? '')
  const fromLng = parseFloat(searchParams.get('fromLng') ?? '')
  const toLat = parseFloat(searchParams.get('toLat') ?? '')
  const toLng = parseFloat(searchParams.get('toLng') ?? '')
  const fingerprint = searchParams.get('fingerprint') ?? ''
  const date = searchParams.get('date') ?? undefined

  if ([fromLat, fromLng, toLat, toLng].some(isNaN) || !fingerprint) {
    return NextResponse.json({ error: 'fromLat, fromLng, toLat, toLng, fingerprint are required' }, { status: 400 })
  }
  if (!inBounds(fromLat, fromLng) || !inBounds(toLat, toLng)) {
    return NextResponse.json({ error: 'Coordinates must be within NSW' }, { status: 400 })
  }

  const cacheKey = `timetable:${fromLat.toFixed(3)},${fromLng.toFixed(3)}:${toLat.toFixed(3)},${toLng.toFixed(3)}:${fingerprint}:${date ?? 'today'}`
  const cached = cacheGet<TimetableResponse>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } })

  try {
    // Query 10 time slots across the day in parallel for broad coverage
    const slots = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => sydneyDateAtHour(h, date))
    const results = await Promise.all(
      slots.map((dt) => getTrip(fromLat, fromLng, toLat, toLng, dt, 5).catch(() => [] as Journey[]))
    )
    const allJourneys = results.flat()

    // Filter to matching fingerprint only
    const matching = allJourneys.filter((j) => journeyFingerprint(j) === fingerprint)

    // Deduplicate by departurePlanned
    const seen = new Set<string>()
    const unique = matching.filter((j) => {
      if (seen.has(j.departurePlanned)) return false
      seen.add(j.departurePlanned)
      return true
    })

    // Sort chronologically
    unique.sort((a, b) => a.departurePlanned.localeCompare(b.departurePlanned))

    const entries: TimetableEntry[] = unique.map((j) => ({
      departurePlanned: j.departurePlanned,
      arrivalPlanned: j.arrivalPlanned,
      journey: j,
    }))

    const response: TimetableResponse = {
      entries,
      fingerprint,
      fetchedAt: new Date().toISOString(),
    }
    // Don't cache empty results — likely a transient TfNSW/timeout failure;
    // caching would pin an empty timetable on this instance for an hour.
    if (entries.length > 0) cacheSet(cacheKey, response, CACHE_TTL_MS)
    return NextResponse.json(response, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[/api/trip-timetable]', err)
    return NextResponse.json({ error: 'Could not fetch timetable. Please try again.' }, { status: 502 })
  }
}
