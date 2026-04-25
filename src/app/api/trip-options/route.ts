import { NextRequest, NextResponse } from 'next/server'
import { getTrip, journeyFingerprint } from '@/lib/tfnsw/trip'
import { findNearbyStops } from '@/lib/tfnsw/stopFinder'
import { fixFirstWalkLeg } from '@/lib/walkfix'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { Journey, RouteOption, RouteOptionsResponse, TransportMode } from '@/lib/types'

const NSW_BOUNDS = { minLat: -37.5, maxLat: -28.0, minLng: 140.9, maxLng: 154.0 }
const CACHE_TTL_MS = 60 * 60 * 1000 // 60 min

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

function inBounds(lat: number, lng: number): boolean {
  return lat >= NSW_BOUNDS.minLat && lat <= NSW_BOUNDS.maxLat
    && lng >= NSW_BOUNDS.minLng && lng <= NSW_BOUNDS.maxLng
}

function sydneyDateAtHour(hour: number): Date {
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
  const [y, m, d] = sydStr.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - offsetMin * 60 * 1000)
}

const MODE_LABEL: Record<string, string> = {
  train: 'Train', metro: 'Metro', bus: 'Bus', ferry: 'Ferry', lightrail: 'Light Rail', coach: 'Coach', unknown: 'Service',
}

function buildRouteLabel(journey: Journey, serviceIdsByLegIdx: Map<number, string[]>): string {
  const transitLegs = journey.legs.filter((l) => !l.isWalk)
  const seen = new Set<string>()
  return transitLegs
    .filter((l) => { const key = l.mode ?? 'unknown'; if (seen.has(key)) return false; seen.add(key); return true })
    .map((l, i) => {
      const emoji = MODE_EMOJI[l.mode ?? 'unknown'] ?? '🚌'
      const ids = serviceIdsByLegIdx.get(i)
      const suffix = ids && ids.length > 0 ? ids.sort().join(' · ') : (MODE_LABEL[l.mode ?? 'unknown'] ?? 'Service')
      return `${emoji} ${suffix}`
    })
    .join(' → ')
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fromLat = parseFloat(searchParams.get('fromLat') ?? '')
  const fromLng = parseFloat(searchParams.get('fromLng') ?? '')
  const toLat = parseFloat(searchParams.get('toLat') ?? '')
  const toLng = parseFloat(searchParams.get('toLng') ?? '')
  const fromName = searchParams.get('fromName') ?? 'Current location'
  const toName = searchParams.get('toName') ?? 'Destination'
  const fromStopId = searchParams.get('fromStopId') ?? null
  const toStopId = searchParams.get('toStopId') ?? null

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return NextResponse.json({ error: 'fromLat, fromLng, toLat, toLng are required' }, { status: 400 })
  }
  if (!inBounds(fromLat, fromLng) || !inBounds(toLat, toLng)) {
    return NextResponse.json({ error: 'Coordinates must be within NSW' }, { status: 400 })
  }

  // Build stop-based extra params for getTrip when stop IDs are available
  const stopExtraParams: Record<string, string> = {}
  if (fromStopId) {
    stopExtraParams.type_origin = 'stop'
    stopExtraParams.name_origin = fromStopId
    stopExtraParams.isGlobalId = '1'
  }
  if (toStopId) {
    stopExtraParams.type_destination = 'stop'
    stopExtraParams.name_destination = toStopId
  }

  const cacheKey = `trip-options:${fromStopId ?? `${fromLat.toFixed(3)},${fromLng.toFixed(3)}`}:${toStopId ?? `${toLat.toFixed(3)},${toLng.toFixed(3)}`}`
  const cached = cacheGet<RouteOptionsResponse>(cacheKey)
  if (cached) return NextResponse.json(cached, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } })

  try {
    // Run in parallel: 5 time-slot queries + nearby stops lookup
    const slots = [7, 10, 13, 16, 19].map((h) => sydneyDateAtHour(h))
    const [slotResults, nearbyStops] = await Promise.all([
      Promise.all(
        slots.map((dt, i) =>
          getTrip(fromLat, fromLng, toLat, toLng, dt, 10, Object.keys(stopExtraParams).length ? stopExtraParams : undefined).catch((err) => {
            console.warn(`[/api/trip-options] slot ${i} (${dt.toISOString()}) failed:`, err?.message ?? err)
            return [] as Journey[]
          })
        )
      ),
      findNearbyStops(fromLat, fromLng, 1500, 30).catch((err) => {
        console.warn('[/api/trip-options] findNearbyStops failed:', err?.message ?? err)
        return []
      }),
    ])
    const allJourneys: Journey[] = slotResults.flat()

    // Find which modes are already represented in results
    const modesFound = new Set<string>()
    for (const j of allJourneys) {
      for (const leg of j.legs) {
        if (!leg.isWalk && leg.mode) modesFound.add(leg.mode)
      }
    }

    // For modes present in nearby stops but missing from results, query from
    // the closest PURE stop of that mode (e.g. Barangaroo Metro-only beats
    // Martin Place train+metro — querying from a combined stop lets TfNSW
    // still pick the other mode, defeating the purpose).
    const modesToSupplement = new Map<string, { lat: number; lng: number; isPure: boolean }>()
    for (const stop of nearbyStops) {
      const effectiveModes = stop.modes.filter((m) => m !== 'unknown')
      const isPure = effectiveModes.length === 1
      for (const mode of effectiveModes) {
        if (!modesFound.has(mode)) {
          const existing = modesToSupplement.get(mode)
          // Prefer pure stops (only this mode) over combined stops
          if (!existing || (!existing.isPure && isPure)) {
            modesToSupplement.set(mode, { lat: stop.lat, lng: stop.lng, isPure })
          }
        }
      }
    }

    if (modesToSupplement.size > 0) {
      // Query from the closest pure-mode stop for each missing mode.
      // A pure stop (e.g. Barangaroo Metro-only) forces TfNSW to route via
      // that mode; a combined stop (e.g. Martin Place train+metro) lets TfNSW
      // still pick train, defeating the purpose.
      const supplementalResults = await Promise.all(
        Array.from(modesToSupplement.entries()).map(([mode, stop]) => {
          console.log(`[trip-options] supplemental ${mode} from "${stop.isPure ? 'pure' : 'combined'}" stop (${stop.lat}, ${stop.lng})`)
          return getTrip(stop.lat, stop.lng, toLat, toLng, sydneyDateAtHour(8), 5)
            .catch((err) => {
              console.warn(`[/api/trip-options] supplemental ${mode} failed:`, err?.message ?? err)
              return [] as Journey[]
            })
        })
      )
      const supplementalJourneys = supplementalResults.flat()
      console.log('[trip-options] supplemental fingerprints:', supplementalJourneys.map(j => journeyFingerprint(j)))
      allJourneys.push(...supplementalJourneys)
    }

    // Group by fingerprint — keep the first (earliest time) journey per pattern
    // and collect all distinct serviceIds per transit-leg index across journeys
    const grouped = new Map<string, { journey: Journey; serviceIdsByLegIdx: Map<number, Set<string>> }>()
    for (const j of allJourneys) {
      const fp = journeyFingerprint(j)
      if (!fp) continue
      const transitLegs = j.legs.filter((l) => !l.isWalk)
      if (!grouped.has(fp)) {
        const serviceIdsByLegIdx = new Map<number, Set<string>>()
        transitLegs.forEach((l, i) => { if (l.serviceId) serviceIdsByLegIdx.set(i, new Set([l.serviceId])) })
        grouped.set(fp, { journey: j, serviceIdsByLegIdx })
      } else {
        const entry = grouped.get(fp)!
        transitLegs.forEach((l, i) => {
          if (!l.serviceId) return
          if (!entry.serviceIdsByLegIdx.has(i)) entry.serviceIdsByLegIdx.set(i, new Set())
          entry.serviceIdsByLegIdx.get(i)!.add(l.serviceId)
        })
      }
    }
    console.log('[trip-options] distinct fingerprints:', Array.from(grouped.keys()))

    // Fix walk legs and build RouteOption for each pattern
    const options: RouteOption[] = await Promise.all(
      Array.from(grouped.entries()).map(async ([fingerprint, { journey, serviceIdsByLegIdx }]) => {
        const fixed = await fixFirstWalkLeg(journey, fromLat, fromLng)
        const serviceIdArraysByLegIdx = new Map(Array.from(serviceIdsByLegIdx.entries()).map(([i, s]) => [i, Array.from(s)]))
        const transitLegs = fixed.legs.filter((l) => !l.isWalk)
        const modeSet = new Set(
          transitLegs.map((l) => l.mode).filter((m): m is TransportMode => m !== null)
        )
        const modes = Array.from(modeSet)
        return {
          fingerprint,
          label: buildRouteLabel(fixed, serviceIdArraysByLegIdx),
          modes,
          transfers: fixed.transfers,
          typicalDurationSeconds: fixed.totalDurationSeconds,
          sampleJourney: fixed,
        }
      })
    )

    // Sort: fewest transfers first, then shortest typical duration
    options.sort((a, b) =>
      a.transfers !== b.transfers
        ? a.transfers - b.transfers
        : a.typicalDurationSeconds - b.typicalDurationSeconds
    )

    const response: RouteOptionsResponse = {
      options,
      originName: fromName,
      destinationName: toName,
      fetchedAt: new Date().toISOString(),
    }
    // Don't cache empty results — likely a transient TfNSW/timeout failure;
    // caching would pin an empty options list on this instance for an hour.
    if (options.length > 0) cacheSet(cacheKey, response, CACHE_TTL_MS)
    return NextResponse.json(response, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[/api/trip-options]', err)
    return NextResponse.json({ error: 'Could not fetch route options. Please try again.' }, { status: 502 })
  }
}
