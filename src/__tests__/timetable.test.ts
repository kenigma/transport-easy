/**
 * Tests for the timetable feature:
 * 1. getDepartures — extended window (futureMinutes param)
 * 2. Departure filtering — serviceId-only, no destination filter
 * 3. On-board GPS detection — haversine < 150m threshold
 * 4. Next departure highlighting — first departure with mins >= 0
 * 5. humanMessage — behaviour with walkMinutes = 0 (at stop)
 *
 * No network access required — tfnswFetch is mocked.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDepartures } from '@/lib/tfnsw/departures'
import { humanMessage, minutesUntil, effectiveTime } from '@/lib/time'
import { haversineKm } from '@/lib/tfnsw/vehiclePositions'
import type { Departure } from '@/lib/types'

vi.mock('@/lib/tfnsw/client', () => ({ tfnswFetch: vi.fn() }))
import { tfnswFetch } from '@/lib/tfnsw/client'
const mockFetch = vi.mocked(tfnswFetch)

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoMinsFromNow(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString()
}

function makeStopEvent(minutesFromNow: number, serviceId = 'T9'): object {
  const t = isoMinsFromNow(minutesFromNow)
  return {
    departureTimePlanned: t,
    departureTimeEstimated: null,
    transportation: {
      disassembledName: serviceId,
      number: serviceId,
      product: { class: 1 },
      destination: { name: 'Wynyard' }, // terminal destination — not "Chatswood"
    },
  }
}

// ── 1. getDepartures: standard window (90 min) ───────────────────────────────

describe('getDepartures — standard window (90 min)', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns departures within the next 90 minutes', async () => {
    mockFetch.mockResolvedValue({
      stopEvents: [
        makeStopEvent(10),
        makeStopEvent(50),
        makeStopEvent(80),
        makeStopEvent(100), // outside 90-min window — should be excluded
      ],
    })
    const deps = await getDepartures('200060', 40, 1)
    expect(deps).toHaveLength(3)
  })

  it('excludes departures more than maxPastMinutes ago', async () => {
    mockFetch.mockResolvedValue({
      stopEvents: [
        makeStopEvent(-5),  // 5 min ago — excluded (maxPastMinutes=1)
        makeStopEvent(-0.5), // 30s ago — included (within 1 min)
        makeStopEvent(10),
      ],
    })
    const deps = await getDepartures('200060', 40, 1)
    expect(deps).toHaveLength(2)
  })
})

// ── 2. getDepartures: extended window (180 min) ──────────────────────────────

describe('getDepartures — extended window (180 min)', () => {
  afterEach(() => vi.clearAllMocks())

  it('includes departures up to 3 hours ahead', async () => {
    mockFetch.mockResolvedValue({
      stopEvents: [
        makeStopEvent(90),
        makeStopEvent(120),
        makeStopEvent(170),
        makeStopEvent(185), // outside 180-min window
      ],
    })
    const deps = await getDepartures('200060', 40, 1, 180)
    expect(deps).toHaveLength(3)
  })

  it('includes past departures up to 60 minutes ago when maxPastMinutes=60', async () => {
    mockFetch.mockResolvedValue({
      stopEvents: [
        makeStopEvent(-55), // 55 min ago — included
        makeStopEvent(-65), // 65 min ago — excluded
        makeStopEvent(30),
      ],
    })
    const deps = await getDepartures('200060', 40, 60, 180)
    expect(deps).toHaveLength(2)
  })

  it('returns departures sorted as provided by API', async () => {
    mockFetch.mockResolvedValue({
      stopEvents: [
        makeStopEvent(-30),
        makeStopEvent(10),
        makeStopEvent(60),
        makeStopEvent(120),
      ],
    })
    const deps = await getDepartures('200060', 40, 60, 180)
    expect(deps).toHaveLength(4)
  })
})

// ── 3. Destination filter — terminal vs leg destination ───────────────────────
//
// The trip planner saves "Chatswood Station" as the trip destination (leg dest).
// The TfNSW Departure Monitor returns the service terminal ("Wynyard", "Central").
// The TimetableSheet now filters by serviceId ONLY — no destination filter.
// This test confirms that getDepartures + serviceId filter alone returns results.

describe('destination mismatch — serviceId-only filtering', () => {
  afterEach(() => vi.clearAllMocks())

  it('returns T9 departures even when terminal destination is not Chatswood', async () => {
    // Simulates Gordon Station — T9 terminal is Wynyard, not Chatswood
    mockFetch.mockResolvedValue({
      stopEvents: [
        {
          departureTimePlanned: isoMinsFromNow(8),
          departureTimeEstimated: null,
          transportation: {
            disassembledName: 'T9',
            number: 'T9',
            product: { class: 1 },
            destination: { name: 'Wynyard' }, // ← terminal, not "Chatswood Station"
          },
        },
        {
          departureTimePlanned: isoMinsFromNow(38),
          departureTimeEstimated: null,
          transportation: {
            disassembledName: 'T9',
            number: 'T9',
            product: { class: 1 },
            destination: { name: 'Central' },
          },
        },
      ],
    })

    const allDeps = await getDepartures('200060', 40, 1)
    // Filter by serviceId only (as TimetableSheet now does — no destination filter)
    const t9 = allDeps.filter((d) => d.serviceId === 'T9')
    expect(t9).toHaveLength(2)

    // Old behaviour (filtering by destination "Chatswood Station") would return 0
    const wrongFilter = allDeps.filter(
      (d) => d.serviceId === 'T9' && d.destination === 'Chatswood Station'
    )
    expect(wrongFilter).toHaveLength(0)
  })
})

// ── 4. Next departure highlighting ───────────────────────────────────────────
//
// The timetable sheet computes nextIdx = first departure with mins >= 0.

describe('next departure index', () => {
  function nextIdx(departures: Departure[]): number {
    return departures.findIndex((d) => minutesUntil(effectiveTime(d)) >= 0)
  }

  function dep(minutesFromNow: number): Departure {
    const t = isoMinsFromNow(minutesFromNow)
    return {
      serviceId: 'T9', lineName: null, destination: 'Wynyard',
      scheduledDepartureTime: t, estimatedDepartureTime: null,
      platformName: null, mode: 'train', isCancelled: false, occupancy: null, tripId: null, terminalStopId: null,
    }
  }

  it('highlights the first upcoming departure', () => {
    const deps = [dep(-20), dep(-5), dep(8), dep(30)]
    expect(nextIdx(deps)).toBe(2)
  })

  it('highlights index 0 if first departure is next', () => {
    const deps = [dep(2), dep(15), dep(30)]
    expect(nextIdx(deps)).toBe(0)
  })

  it('returns -1 when all departures have already departed', () => {
    const deps = [dep(-30), dep(-10), dep(-1)]
    expect(nextIdx(deps)).toBe(-1)
  })

  it('uses live estimated time when available', () => {
    // Scheduled 5 min ago but estimated 3 min from now (running late)
    const delayed: Departure = {
      serviceId: 'T9', lineName: null, destination: 'Wynyard',
      scheduledDepartureTime: isoMinsFromNow(-5),
      estimatedDepartureTime: isoMinsFromNow(3),
      platformName: null, mode: 'train', isCancelled: false, occupancy: null, tripId: null, terminalStopId: null,
    }
    const deps = [delayed]
    // effectiveTime picks estimatedDepartureTime → mins = 3 → nextIdx = 0
    expect(nextIdx(deps)).toBe(0)
  })
})

// ── 5. GPS-based on-board detection ──────────────────────────────────────────
//
// A vehicle within 150m of the user's GPS → user is on board.

describe('on-board GPS detection', () => {
  // Gordon Station coords
  const GORDON = { lat: -33.7522, lng: 151.1496 }

  it('detects on-board when vehicle is within 150m', () => {
    // Vehicle 80m north of user
    const vehicle = { lat: GORDON.lat + 0.00072, lng: GORDON.lng }
    const dist = haversineKm(GORDON.lat, GORDON.lng, vehicle.lat, vehicle.lng)
    expect(dist).toBeLessThan(0.15)
  })

  it('does not detect on-board when vehicle is 300m away', () => {
    // Vehicle 300m north
    const vehicle = { lat: GORDON.lat + 0.0027, lng: GORDON.lng }
    const dist = haversineKm(GORDON.lat, GORDON.lng, vehicle.lat, vehicle.lng)
    expect(dist).toBeGreaterThan(0.15)
  })

  it('does not flag on-board when user is at an unrelated location (no GTFS-RT match)', () => {
    // User at Chatswood, bus 560 runs between West Pymble and Gordon — no vehicle nearby
    const CHATSWOOD = { lat: -33.7969, lng: 151.1818 }
    const bus560NearGordon = { lat: -33.7520, lng: 151.1500 }
    const dist = haversineKm(CHATSWOOD.lat, CHATSWOOD.lng, bus560NearGordon.lat, bus560NearGordon.lng)
    // 4+ km away — no GTFS-RT match, so no on-board detection
    expect(dist).toBeGreaterThan(0.15)
  })

  it('correctly identifies the on-board departure as the most recent past one', () => {
    const isoMins = (m: number) => isoMinsFromNow(m)
    const makeDep = (m: number): Departure => ({
      serviceId: 'T9', lineName: null, destination: 'Wynyard',
      scheduledDepartureTime: isoMins(m), estimatedDepartureTime: null,
      platformName: null, mode: 'train', isCancelled: false, occupancy: null, tripId: null, terminalStopId: null,
    })

    const departures = [makeDep(-40), makeDep(-12), makeDep(8), makeDep(38)]

    // On-board = most recent past departure (highest negative mins)
    const pastDeps = departures
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => minutesUntil(effectiveTime(d)) < 0)
    const onBoardIdx = pastDeps.length > 0 ? pastDeps[pastDeps.length - 1].i : null

    expect(onBoardIdx).toBe(1) // index 1 = -12 min (most recent past)
  })
})

// ── 6. humanMessage with walkMinutes = 0 (at the stop) ───────────────────────
//
// After removing the walkMinutes=0 bypass, being at the stop (walk=0)
// should produce meaningful action messages based on margin = mins - 0.

describe('humanMessage — at the stop (walkMinutes = 0)', () => {
  it('returns Run! when departure has already left (margin < 0)', () => {
    expect(humanMessage(-1, 0)).toBe('Run!')
  })

  it('returns Head out now! when departure is imminent (margin = 0)', () => {
    expect(humanMessage(0, 0)).toBe('Head out now!')
  })

  it('returns Leave in X min for margin 1–4', () => {
    expect(humanMessage(2, 0)).toBe('Leave in 2 min')
    expect(humanMessage(4, 0)).toBe('Leave in 4 min')
  })

  it('returns Relax for margin 5+', () => {
    expect(humanMessage(5, 0)).toBe('Relax, take your time')
    expect(humanMessage(15, 0)).toBe('Relax, take your time')
  })
})
