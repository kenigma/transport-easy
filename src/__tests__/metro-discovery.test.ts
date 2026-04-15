/**
 * Integration test: Route discovery pipeline for a known CBD → North Shore route.
 *
 * Requires TFNSW_API_KEY in .env.local — skipped otherwise.
 * Run: npm test
 *
 * NOTE: TfNSW's /tp/trip API does NOT return Metro for the CBD→Chatswood corridor
 * regardless of any parameter combination tried:
 *   - Origin coords at Martin Place Metro (200030), Barangaroo Metro (200046)
 *   - type_origin=stop with Metro stop IDs
 *   - Both endpoints as Metro stops
 *   - Pure Metro intermediate stations (Crows Nest, Victoria Cross)
 *   - TfNSWTR=false (standard EFA routing)
 *   - Reverse direction (Chatswood→CBD)
 *
 * The routing engine exclusively returns T1 train or bus for all these queries,
 * even when starting from a Metro-only station. This is a TfNSW API limitation.
 *
 * What this test verifies:
 *   1. The supplemental mode discovery logic correctly identifies Metro stops near the origin
 *   2. The standard time-slot queries return some valid route options
 *   3. The `findNearbyStops` function correctly labels Metro stops with mode='metro'
 */

import { describe, it, expect } from 'vitest'
import { getTrip, journeyFingerprint } from '@/lib/tfnsw/trip'
import { findNearbyStops } from '@/lib/tfnsw/stopFinder'

// 1 Farrer Pl, Sydney CBD (geocoded)
const FROM = { lat: -33.8645, lng: 151.2092 }
// Chatswood Station
const TO = { lat: -33.7976, lng: 151.1808 }

const hasApiKey = !!process.env.TFNSW_API_KEY

/** Build a Date for today at the given hour in Sydney local time. */
function todayAtSydneyHour(hour: number): Date {
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

describe.skipIf(!hasApiKey)('Route discovery pipeline: 1 Farrer Pl Sydney → Chatswood', () => {
  it('finds route options and correctly identifies nearby Metro stops', async () => {
    const { lat: fromLat, lng: fromLng } = FROM
    const { lat: toLat, lng: toLng } = TO

    // ── Step 1: Standard 5-slot discovery queries ─────────────────────────────
    const slotJourneys = (await Promise.all(
      [7, 10, 13, 16, 19].map((h) =>
        getTrip(fromLat, fromLng, toLat, toLng, todayAtSydneyHour(h), 10).catch(() => [])
      )
    )).flat()

    const slotFingerprints = new Set(slotJourneys.map(j => journeyFingerprint(j)).filter(Boolean))
    console.log('Slot fingerprints:', Array.from(slotFingerprints))

    const modesFound = new Set<string>()
    for (const j of slotJourneys) {
      for (const leg of j.legs) {
        if (!leg.isWalk && leg.mode) modesFound.add(leg.mode)
      }
    }
    console.log('Modes from slot queries:', Array.from(modesFound))

    // ── Step 2: Find nearby stops and identify Metro candidates ──────────────
    const nearbyStops = await findNearbyStops(fromLat, fromLng, 1500, 30).catch(() => [])
    const metroStops = nearbyStops.filter(s => s.modes.includes('metro'))
    console.log('Metro stops near origin:', metroStops.map(s =>
      `${s.stopId} "${s.stopName}" [${s.modes}] ${s.distance}m`
    ))

    // ── Assertions ────────────────────────────────────────────────────────────

    // 1. Time-slot queries should return at least some route options
    expect(slotJourneys.length, 'Expected at least some journeys from time-slot queries').toBeGreaterThan(0)
    expect(slotFingerprints.size, 'Expected at least one distinct route fingerprint').toBeGreaterThan(0)

    // 2. A train route should be found (corridor fingerprint no longer includes serviceId)
    const hasTrain = Array.from(slotFingerprints).some(fp => fp.startsWith('train:'))
    expect(hasTrain, 'Expected T1 train to appear as a route option').toBe(true)

    // 3. Nearby stop discovery should find Metro stops (Martin Place, Barangaroo)
    expect(metroStops.length, 'Expected at least one nearby Metro stop to be found').toBeGreaterThan(0)
    const metroStopNames = metroStops.map(s => s.stopName)
    console.log('Metro stop names found:', metroStopNames)

    // 4. Document the TfNSW API limitation: Metro is NOT returned by /tp/trip
    const hasMetroInResults = Array.from(slotFingerprints).some(fp => fp.includes('metro'))
    console.log(
      hasMetroInResults
        ? '✓ Metro appeared in trip results (TfNSW API limitation may be fixed)'
        : '⚠ Metro not in trip results — known TfNSW /tp/trip API limitation for CBD→Chatswood corridor'
    )
    // We do NOT assert hasMetroInResults === true here because TfNSW's routing
    // engine does not return Metro for this corridor under any known parameter
    // combination. The supplemental mode discovery correctly identifies the
    // Metro stops; it's the routing engine that fails to use them.
  })
})
