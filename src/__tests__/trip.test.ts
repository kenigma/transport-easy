/**
 * Unit tests for src/lib/tfnsw/trip.ts
 *
 * Tests the raw TfNSW API response parsing logic (parseLeg, parseJourney) via
 * the exported getTrip function, with tfnswFetch mocked to return controlled
 * raw API shapes. No network access or API key required.
 *
 * Also tests journeyFingerprint, which is a pure function on Journey objects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getTrip, journeyFingerprint } from '@/lib/tfnsw/trip'
import type { Journey } from '@/lib/types'

vi.mock('@/lib/tfnsw/client', () => ({
  tfnswFetch: vi.fn(),
}))

import { tfnswFetch } from '@/lib/tfnsw/client'
const mockFetch = vi.mocked(tfnswFetch)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal raw transit leg as returned by TfNSW /tp/trip */
function rawTransitLeg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isFootPath: false,
    duration: 1200,
    transportation: {
      disassembledName: 'T4',
      number: 'T4 Eastern Suburbs & Illawarra Line',
      product: { class: 1 },   // 1 = train
      destination: { name: 'Bondi Junction' },
    },
    origin: {
      name: 'Central Station',
      id: '10101100',
      coord: [-33.8837, 151.2055],
      departureTimePlanned: '2026-04-10T08:00:00+10:00',
      departureTimeEstimated: null,
      properties: { platformName: '19' },
    },
    destination: {
      name: 'Bondi Junction',
      arrivalTimePlanned: '2026-04-10T08:20:00+10:00',
    },
    realtimeStatus: [],
    ...overrides,
  }
}

/** Minimal raw walk leg */
function rawWalkLeg(durationSeconds = 300, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    isFootPath: true,
    duration: durationSeconds,
    footPathInfo: [{ duration: durationSeconds }],
    transportation: {},
    origin: {
      name: 'Origin Address',
      coord: [-33.865, 151.209],
      departureTimePlanned: '2026-04-10T07:55:00+10:00',
    },
    destination: {
      name: 'Central Station',
      arrivalTimePlanned: '2026-04-10T08:00:00+10:00',
    },
    realtimeStatus: [],
    ...overrides,
  }
}

/** Wrap raw legs into a TfNSW /tp/trip response shape */
function mockResponse(legs: Record<string, unknown>[]): { journeys: Array<{ legs: unknown[] }> } {
  return { journeys: [{ legs }] }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Prevent "TFNSW_API_KEY not set" from being the failure reason
  process.env.TFNSW_API_KEY = 'test-key'
})

// ── journeyFingerprint ────────────────────────────────────────────────────────

describe('journeyFingerprint', () => {
  function makeJourney(legs: Journey['legs']): Journey {
    return {
      legs,
      totalDurationSeconds: 1200,
      departurePlanned: '2026-04-10T08:00:00+10:00',
      arrivalPlanned: '2026-04-10T08:20:00+10:00',
      transfers: 0,
      isAffectedByCancellation: false,
    }
  }

  it('produces mode:serviceId pairs joined by |', () => {
    const journey = makeJourney([
      { isWalk: false, mode: 'train', serviceId: 'T4', durationSeconds: 1200, walkDurationSeconds: null, lineName: null, isCancelled: false, originName: 'Central', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Bondi Junction', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
    ])
    expect(journeyFingerprint(journey)).toBe('train:Central:Bondi Junction')
  })

  it('joins multiple transit legs with |', () => {
    const journey = makeJourney([
      { isWalk: false, mode: 'train', serviceId: 'T4', durationSeconds: 600, walkDurationSeconds: null, lineName: null, isCancelled: false, originName: 'Central', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Sydenham', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
      { isWalk: true,  mode: null,    serviceId: null, durationSeconds: 120,  walkDurationSeconds: 120, lineName: null, isCancelled: false, originName: 'Sydenham', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Bus Stop', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
      { isWalk: false, mode: 'bus',   serviceId: '380', durationSeconds: 600, walkDurationSeconds: null, lineName: null, isCancelled: false, originName: 'Bus Stop', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Bondi Beach', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
    ])
    expect(journeyFingerprint(journey)).toBe('train:Central:Sydenham|bus:Bus Stop:Bondi Beach')
  })

  it('excludes walk legs from the fingerprint', () => {
    const journey = makeJourney([
      { isWalk: true, mode: null, serviceId: null, durationSeconds: 300, walkDurationSeconds: 300, lineName: null, isCancelled: false, originName: 'Start', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Stop', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
      { isWalk: false, mode: 'metro', serviceId: 'M1', durationSeconds: 900, walkDurationSeconds: null, lineName: null, isCancelled: false, originName: 'Stop', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'Dest', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
    ])
    expect(journeyFingerprint(journey)).toBe('metro:Stop:Dest')
  })

  it('returns empty string for a walk-only journey', () => {
    const journey = makeJourney([
      { isWalk: true, mode: null, serviceId: null, durationSeconds: 600, walkDurationSeconds: 600, lineName: null, isCancelled: false, originName: 'A', originDeparturePlanned: null, originDepartureEstimated: null, platformName: null, destinationName: 'B', destinationArrivalPlanned: null, stopId: null, stopLat: null, stopLng: null, legDestination: null },
    ])
    expect(journeyFingerprint(journey)).toBe('')
  })
})

// ── Leg parsing ───────────────────────────────────────────────────────────────

describe('getTrip — leg parsing', () => {
  it('parses a basic transit leg correctly', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    const leg = journey.legs[0]
    expect(leg.isWalk).toBe(false)
    expect(leg.mode).toBe('train')
    expect(leg.serviceId).toBe('T4')
    expect(leg.durationSeconds).toBe(1200)
    expect(leg.platformName).toBe('19')
    expect(leg.originName).toBe('Central Station')
    expect(leg.destinationName).toBe('Bondi Junction')
  })

  it('sets lineName only when it differs from serviceId', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    // disassembledName='T4', number='T4 Eastern Suburbs & Illawarra Line' → different
    expect(journey.legs[0].lineName).toBe('T4 Eastern Suburbs & Illawarra Line')
  })

  it('sets lineName to null when number === disassembledName', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg({
      transportation: { disassembledName: '380', number: '380', product: { class: 5 }, destination: { name: 'Bondi Beach' } },
    })]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].lineName).toBeNull()
  })

  it('detects walk legs via isFootPath=true', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawWalkLeg(), rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].isWalk).toBe(true)
    expect(journey.legs[0].mode).toBeNull()
    expect(journey.legs[0].serviceId).toBeNull()
  })

  it('detects walk legs via product class 100', async () => {
    const footpathLeg = rawWalkLeg()
    ;(footpathLeg as Record<string, unknown>).isFootPath = false
    ;(footpathLeg as Record<string, unknown>).transportation = { product: { class: 100 } }
    mockFetch.mockResolvedValue(mockResponse([footpathLeg, rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].isWalk).toBe(true)
  })

  it('detects walk legs when transportation has no product class', async () => {
    const noClassLeg = rawWalkLeg()
    ;(noClassLeg as Record<string, unknown>).isFootPath = false
    ;(noClassLeg as Record<string, unknown>).transportation = {}
    mockFetch.mockResolvedValue(mockResponse([noClassLeg, rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].isWalk).toBe(true)
  })

  it('falls back to timestamp diff when leg.duration is 0', async () => {
    const leg = rawTransitLeg({ duration: 0 })
    // origin departs 08:00, destination arrives 08:25 → 1500s
    ;(leg as Record<string, unknown>).origin = {
      ...(leg as Record<string, unknown>).origin as object,
      departureTimePlanned: '2026-04-10T08:00:00+10:00',
    }
    ;(leg as Record<string, unknown>).destination = {
      name: 'Bondi Junction',
      arrivalTimePlanned: '2026-04-10T08:25:00+10:00',
    }
    mockFetch.mockResolvedValue(mockResponse([leg]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].durationSeconds).toBe(1500)
  })

  it('filters out zero-second walk stubs', async () => {
    // TfNSW sometimes emits a walk leg with duration=0, no footPathInfo, and
    // no timestamps — all three conditions needed to trigger the filter.
    const stub: Record<string, unknown> = {
      isFootPath: true,
      duration: 0,
      footPathInfo: [],
      transportation: {},
      // No departureTimePlanned / arrivalTimePlanned → timestamp fallback won't fire
      origin: { name: 'Origin', coord: [-33.865, 151.209] },
      destination: { name: 'Central Station' },
      realtimeStatus: [],
    }
    mockFetch.mockResolvedValue(mockResponse([stub, rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    // The stub should be filtered; only the transit leg remains
    expect(journey.legs).toHaveLength(1)
    expect(journey.legs[0].isWalk).toBe(false)
  })

  it('detects cancellation from realtimeStatus', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg({ realtimeStatus: ['CANCELLED'] })]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].isCancelled).toBe(true)
    expect(journey.isAffectedByCancellation).toBe(true)
  })

  it('strips platform "0" (TfNSW placeholder)', async () => {
    const leg = rawTransitLeg()
    ;((leg as Record<string, unknown>).origin as Record<string, unknown>).properties = { platformName: '0' }
    mockFetch.mockResolvedValue(mockResponse([leg]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].platformName).toBeNull()
  })
})

// ── Journey parsing ───────────────────────────────────────────────────────────

describe('getTrip — journey parsing', () => {
  it('counts transfers as transit legs minus 1', async () => {
    const bus = rawTransitLeg({
      transportation: { disassembledName: '380', number: '380', product: { class: 5 }, destination: { name: 'Bondi Junction' } },
      origin: { name: 'Bondi Junction Bus Stop', id: '200111', coord: [-33.891, 151.247], departureTimePlanned: '2026-04-10T08:21:00+10:00', properties: {} },
      destination: { name: 'Bondi Beach', arrivalTimePlanned: '2026-04-10T08:30:00+10:00' },
    })
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg(), bus]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.transfers).toBe(1)
  })

  it('reports 0 transfers for a direct journey', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.transfers).toBe(0)
  })

  it('uses first transit leg departure time for departurePlanned', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawWalkLeg(), rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.departurePlanned).toBe('2026-04-10T08:00:00+10:00')
  })

  it('uses last leg arrival time for arrivalPlanned', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg()]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.arrivalPlanned).toBe('2026-04-10T08:20:00+10:00')
  })

  it('filters out journeys with no departure or arrival time', async () => {
    const leg = rawTransitLeg()
    ;((leg as Record<string, unknown>).origin as Record<string, unknown>).departureTimePlanned = undefined
    ;((leg as Record<string, unknown>).destination as Record<string, unknown>).arrivalTimePlanned = undefined
    mockFetch.mockResolvedValue(mockResponse([leg]))
    const journeys = await getTrip(0, 0, 0, 0)
    expect(journeys).toHaveLength(0)
  })

  it('returns empty array when API returns no journeys', async () => {
    mockFetch.mockResolvedValue({ journeys: [] })
    const journeys = await getTrip(0, 0, 0, 0)
    expect(journeys).toHaveLength(0)
  })

  it('sums leg durations for totalDurationSeconds', async () => {
    mockFetch.mockResolvedValue(mockResponse([rawWalkLeg(300), rawTransitLeg({ duration: 1200 })]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.totalDurationSeconds).toBe(1500)
  })
})

// ── Mode mapping ──────────────────────────────────────────────────────────────

describe('getTrip — product class → mode mapping', () => {
  it.each([
    [1, 'train'],
    [2, 'metro'],
    [4, 'lightrail'],
    [5, 'bus'],
    [7, 'coach'],
    [9, 'ferry'],
  ] as const)('class %i maps to %s', async (cls, mode) => {
    mockFetch.mockResolvedValue(mockResponse([rawTransitLeg({
      transportation: {
        disassembledName: 'X',
        number: 'X',
        product: { class: cls },
        destination: { name: 'Dest' },
      },
    })]))
    const [journey] = await getTrip(0, 0, 0, 0)
    expect(journey.legs[0].mode).toBe(mode)
  })
})
