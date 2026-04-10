/**
 * Tests for the live vehicle location feature.
 *
 * Unit tests (always run): providerForMode, haversineKm, filterAndSortVehicles
 * Integration tests (require TFNSW_API_KEY): live TfNSW GTFS Realtime API call
 *
 * Run: npm test
 */

import { describe, it, expect } from 'vitest'
import {
  providerForMode,
  haversineKm,
  filterAndSortVehicles,
  getVehiclePositions,
} from '@/lib/tfnsw/vehiclePositions'
import type { VehiclePosition } from '@/lib/types'

const hasApiKey = !!process.env.TFNSW_API_KEY

// ── Unit tests (no API key required) ─────────────────────────────────────────

describe('providerForMode', () => {
  it.each([
    ['bus',       'buses'],
    ['metro',     'metro'],
    ['ferry',     'ferries'],
    ['lightrail', 'lightrail'],
    ['coach',     'coaches'],
  ] as const)('%s → %s', (mode, expected) => {
    expect(providerForMode(mode)).toBe(expected)
  })

  it('returns null for train (uses EFA realtime, not GTFS-R vehicle positions)', () => {
    expect(providerForMode('train')).toBeNull()
  })

  it('returns null for unknown mode', () => {
    expect(providerForMode('unknown')).toBeNull()
  })
})

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.8688, 151.2093, -33.8688, 151.2093)).toBe(0)
  })

  it('Sydney CBD → Parramatta is ~19–20 km', () => {
    const d = haversineKm(-33.8688, 151.2093, -33.8151, 151.0011)
    expect(d).toBeGreaterThan(18)
    expect(d).toBeLessThan(21)
  })

  it('Sydney → Melbourne is ~700 km', () => {
    const d = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(d).toBeGreaterThan(690)
    expect(d).toBeLessThan(730)
  })
})

describe('filterAndSortVehicles', () => {
  const stop = { lat: -33.8688, lng: 151.2093 }

  const makeVehicle = (id: string, routeId: string, lat: number, lng: number): VehiclePosition => ({
    vehicleId: id,
    vehicleLabel: null,
    tripId: null,
    routeId,
    lat,
    lng,
    bearing: null,
    speed: null,
    currentStatus: null,
    timestamp: null,
  })

  // Real TfNSW format: "{operator_code}_{route_number}"
  const vehicles: VehiclePosition[] = [
    makeVehicle('v1', '2509_380',  -33.87,   151.21),   // matches, ~1.5 km
    makeVehicle('v2', '2509_333',  -33.86,   151.20),   // wrong route
    makeVehicle('v3', '2509_380',  -33.89,   151.22),   // matches, ~2.5 km
    makeVehicle('v4', '2509_380X', -33.87,   151.21),   // wrong — 380X ≠ 380
    makeVehicle('v5', '_380',      -33.8690, 151.2095), // matches (no-operator format), ~0.02 km (closest)
  ]

  it('filters to matching route number only', () => {
    const result = filterAndSortVehicles(vehicles, '380', stop.lat, stop.lng)
    expect(result.map(v => v.vehicleId)).not.toContain('v2')
    expect(result.map(v => v.vehicleId)).not.toContain('v4')
    expect(result.every(v => v.routeId.split('_').pop() === '380')).toBe(true)
  })

  it('sorts by distance to stop (closest first)', () => {
    const result = filterAndSortVehicles(vehicles, '380', stop.lat, stop.lng)
    expect(result[0].vehicleId).toBe('v5')  // ~0.02 km from stop — clearly closest
  })

  it('returns at most 5 vehicles', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      makeVehicle(`x${i}`, '99_b_sydneybus', -33.87 + i * 0.01, 151.21)
    )
    const result = filterAndSortVehicles(many, '99', stop.lat, stop.lng)
    expect(result.length).toBeLessThanOrEqual(5)
  })

  it('returns empty array when no vehicles match the route', () => {
    const result = filterAndSortVehicles(vehicles, '999', stop.lat, stop.lng)
    expect(result).toHaveLength(0)
  })

  it('matching is case-insensitive for alphabetic route IDs', () => {
    const mixedCaseVehicles: VehiclePosition[] = [
      makeVehicle('a1', 'sydneytrains_T4', -33.87, 151.21),
      makeVehicle('a2', 'sydneytrains_t4', -33.88, 151.22),  // lowercase variant
    ]
    const upper = filterAndSortVehicles(mixedCaseVehicles, 'T4', stop.lat, stop.lng)
    const lower = filterAndSortVehicles(mixedCaseVehicles, 't4', stop.lat, stop.lng)
    expect(upper.length).toBe(lower.length)
    expect(upper.length).toBeGreaterThan(0)
  })

  it('treats "T1" route IDs correctly (train route format)', () => {
    const trainVehicles: VehiclePosition[] = [
      makeVehicle('t1', 'sydneytrains_T1', -33.87, 151.21),
      makeVehicle('t2', 'sydneytrains_T10', -33.87, 151.21),  // T10 ≠ T1
    ]
    const result = filterAndSortVehicles(trainVehicles, 'T1', stop.lat, stop.lng)
    expect(result).toHaveLength(1)
    expect(result[0].vehicleId).toBe('t1')
  })
})

// ── Integration tests (require TFNSW_API_KEY) ─────────────────────────────────

describe.skipIf(!hasApiKey)('TfNSW GTFS Realtime — live vehicle positions', () => {
  it('fetches bus positions and returns valid data', async () => {
    const vehicles = await getVehiclePositions('bus')
    console.log(`Bus feed: ${vehicles.length} vehicles`)

    // Must return at least some vehicles during operating hours
    expect(vehicles.length).toBeGreaterThan(0)

    // Spot-check first 10: all must be in NSW geographic bounds
    for (const v of vehicles.slice(0, 10)) {
      expect(v.lat).toBeGreaterThan(-38)
      expect(v.lat).toBeLessThan(-28)
      expect(v.lng).toBeGreaterThan(140)
      expect(v.lng).toBeLessThan(155)
      expect(v.routeId).toBeTruthy()
      expect(v.vehicleId).toBeTruthy()
    }

    // Log a sample of route ID formats so we can see what format TfNSW actually uses
    const sampleRouteIds = [...new Set(vehicles.slice(0, 20).map(v => v.routeId))]
    console.log('Sample bus route IDs:', sampleRouteIds)
  }, 30_000)

  it('returns empty array for train (no GTFS-R vehicle positions feed)', async () => {
    // Trains use TfNSW EFA-based realtime (departure_mon estimated times),
    // not GTFS-R GPS vehicle positions.
    const vehicles = await getVehiclePositions('train')
    expect(vehicles).toEqual([])
  })

  it('returns empty array for unknown mode without throwing', async () => {
    const vehicles = await getVehiclePositions('unknown')
    expect(vehicles).toEqual([])
  })

  it('can find vehicles for a known high-frequency route (bus 380)', async () => {
    const all = await getVehiclePositions('bus')
    const stop = { lat: -33.8915, lng: 151.2767 } // near Bondi Junction
    const route380 = filterAndSortVehicles(all, '380', stop.lat, stop.lng)
    console.log(`Route 380 vehicles near Bondi Junction: ${route380.length}`)
    console.log(route380.map(v => `${v.vehicleId} (${v.routeId}) @ ${v.lat.toFixed(4)},${v.lng.toFixed(4)}`))
    // Don't assert a count — depends on time of day — but log so we can see what we get
  }, 30_000)
})
