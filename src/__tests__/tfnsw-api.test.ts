/**
 * TfNSW API integration tests — hits the real API.
 *
 * Tests every endpoint the app depends on, across all vehicle types:
 *   v1/tp/departure_mon  — Departure Monitor (stop + trip planner)
 *   v1/tp/trip           — Trip Planner
 *   v1/gtfs/vehiclepos   — GTFS-RT vehicle positions (buses, metro, lightrail, ferries, coaches)
 *   v2/gtfs/alerts       — GTFS-RT service alerts (protobuf)
 *
 * Skipped automatically if TFNSW_API_KEY is not set (e.g. in CI without secrets).
 * Run manually: npx vitest run src/__tests__/tfnsw-api.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { transit_realtime } from 'gtfs-realtime-bindings'
import { getDepartures, getTripStops } from '@/lib/tfnsw/departures'
import { getVehiclePositions } from '@/lib/tfnsw/vehiclePositions'
import { getAlerts } from '@/lib/tfnsw/alerts'

// ── Test constants ────────────────────────────────────────────────────────────

// Gordon Station (T9 line) — used for departure monitor tests
const GORDON_STOP_ID = '207210'

// Central Station — used as trip planner destination for T9
const CENTRAL_STOP_ID = '10101100'

// API key presence check — skip all if not configured
const API_KEY = process.env.TFNSW_API_KEY
const skipIf = !API_KEY

// ── Helpers ───────────────────────────────────────────────────────────────────

function describeApi(name: string, fn: () => void) {
  if (skipIf) {
    describe.skip(`[NO API KEY] ${name}`, fn)
  } else {
    describe(name, fn)
  }
}

// ── Departure Monitor (v1/tp/departure_mon) ───────────────────────────────────

describeApi('Departure Monitor — v1/tp/departure_mon', () => {
  it('returns departures for Gordon Station (train)', async () => {
    const deps = await getDepartures(GORDON_STOP_ID, 10, 1, 90)
    expect(deps.length).toBeGreaterThan(0)

    const dep = deps[0]
    expect(dep.serviceId).toBeTruthy()
    expect(dep.destination).toBeTruthy()
    expect(dep.scheduledDepartureTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(['train', 'bus', 'metro', 'lightrail', 'ferry', 'coach', 'unknown']).toContain(dep.mode)
  })

  it('captures terminalStopId from departure event', async () => {
    const deps = await getDepartures(GORDON_STOP_ID, 10, 1, 90)
    const withTerminal = deps.filter((d) => d.terminalStopId !== null)
    expect(withTerminal.length).toBeGreaterThan(0)
    // Terminal stop ID should be a numeric TfNSW stop ID
    expect(withTerminal[0].terminalStopId).toMatch(/^\d+$/)
  })

  it('captures gtfsId (tripId) for train departures', async () => {
    const deps = await getDepartures(GORDON_STOP_ID, 10, 1, 90)
    const trains = deps.filter((d) => d.mode === 'train')
    expect(trains.length).toBeGreaterThan(0)
    // Not all trains have gtfsId but most should
    const withGtfs = trains.filter((d) => d.tripId !== null)
    expect(withGtfs.length).toBeGreaterThan(0)
    expect(withGtfs[0].tripId).toMatch(/^\d+\./)
  })

  it('returns extended window (past 60min + next 3hrs)', async () => {
    const deps = await getDepartures(GORDON_STOP_ID, 40, 60, 180)
    // Should return more departures than a standard 90-min window
    expect(deps.length).toBeGreaterThan(0)
  })
})

// ── Trip Planner — stop sequence (v1/tp/trip) ─────────────────────────────────

describeApi('Trip Planner stop sequence — v1/tp/trip', () => {
  it('returns stop sequence for a T9 departure from Gordon to Central', async () => {
    // Get a live T9 departure first
    const deps = await getDepartures(GORDON_STOP_ID, 20, 1, 120)
    const t9 = deps.find((d) => d.serviceId === 'T9' && d.terminalStopId)
    expect(t9).toBeDefined()
    if (!t9 || !t9.terminalStopId) return

    const stops = await getTripStops(
      GORDON_STOP_ID,
      t9.terminalStopId,
      t9.scheduledDepartureTime,
      'T9',
    )

    // T9 from Gordon → Central has ~14 stops
    expect(stops.length).toBeGreaterThan(5)

    const first = stops[0]
    expect(first.stopId).toBeTruthy()
    expect(first.stopName).toContain('Gordon')
    expect(first.plannedDeparture).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns stop sequence for a T1 departure from Gordon to Hornsby', async () => {
    const deps = await getDepartures(GORDON_STOP_ID, 20, 1, 120)
    const t1 = deps.find((d) => d.serviceId === 'T1' && d.terminalStopId)
    if (!t1 || !t1.terminalStopId) {
      console.log('No T1 departure found — skipping')
      return
    }

    const stops = await getTripStops(
      GORDON_STOP_ID,
      t1.terminalStopId,
      t1.scheduledDepartureTime,
      'T1',
    )
    expect(stops.length).toBeGreaterThan(3)
    expect(stops[0].stopName).toContain('Gordon')
  })

  it('returns empty array for unknown serviceId', async () => {
    // Use a real departure time but wrong serviceId so it won't match
    const stops = await getTripStops(
      GORDON_STOP_ID,
      CENTRAL_STOP_ID,
      new Date(Date.now() + 15 * 60_000).toISOString(),
      'ZZ999',
    )
    expect(stops).toEqual([])
  })
})

// ── GTFS-RT Vehicle Positions (v1/gtfs/vehiclepos) ───────────────────────────

describeApi('GTFS-RT Vehicle Positions — v1/gtfs/vehiclepos', () => {
  it('buses — returns vehicle positions', async () => {
    const vehicles = await getVehiclePositions('bus')
    expect(vehicles.length).toBeGreaterThan(0)
    const v = vehicles[0]
    expect(v.vehicleId).toBeTruthy()
    expect(v.lat).toBeGreaterThan(-35)
    expect(v.lat).toBeLessThan(-33)
    expect(v.lng).toBeGreaterThan(150)
    expect(v.lng).toBeLessThan(152)
  })

  it('metro — returns vehicle positions', async () => {
    const vehicles = await getVehiclePositions('metro')
    // Metro may have no vehicles late at night
    expect(Array.isArray(vehicles)).toBe(true)
    if (vehicles.length > 0) {
      expect(vehicles[0].lat).toBeGreaterThan(-35)
      expect(vehicles[0].lng).toBeGreaterThan(150)
    }
  })

  it('lightrail — returns vehicle positions', async () => {
    const vehicles = await getVehiclePositions('lightrail')
    expect(Array.isArray(vehicles)).toBe(true)
    if (vehicles.length > 0) {
      expect(vehicles[0].vehicleId).toBeTruthy()
    }
  })

  it('trains — returns vehicle positions (nswtrains feed)', async () => {
    const vehicles = await getVehiclePositions('train')
    expect(Array.isArray(vehicles)).toBe(true)
    if (vehicles.length > 0) {
      expect(vehicles[0].vehicleId).toBeTruthy()
      expect(vehicles[0].lat).toBeGreaterThan(-35)
    }
  })

  it('ferry — returns empty (feed not accessible with current key)', async () => {
    const vehicles = await getVehiclePositions('ferry')
    expect(vehicles).toEqual([])
  })

  it('coach — returns empty (feed not accessible with current key)', async () => {
    const vehicles = await getVehiclePositions('coach')
    expect(vehicles).toEqual([])
  })
})

// ── GTFS-RT Alerts (v2/gtfs/alerts/sydneytrains) ─────────────────────────────

describeApi('GTFS-RT Alerts — v2/gtfs/alerts/sydneytrains', () => {
  it('fetches and parses the protobuf feed without error', async () => {
    const alerts = await getAlerts()
    expect(Array.isArray(alerts)).toBe(true)
    // There may be 0 alerts on a quiet day — that's fine
  })

  it('each alert has required fields', async () => {
    const alerts = await getAlerts()
    for (const a of alerts) {
      expect(a.id).toBeTruthy()
      expect(a.title).toBeTruthy()
      expect(['info', 'warning', 'disruption']).toContain(a.severity)
      expect(Array.isArray(a.affectedModes)).toBe(true)
      expect(Array.isArray(a.affectedStopIds)).toBe(true)
    }
  })

  it('stop ID filter — returns subset of all alerts', async () => {
    const all = await getAlerts()
    if (all.length === 0) {
      console.log('No active alerts — skipping filter test')
      return
    }
    // Pick a stop ID that appears in at least one alert
    const stopId = all.find((a) => a.affectedStopIds.length > 0)?.affectedStopIds[0]
    if (!stopId) return

    const filtered = await getAlerts([stopId])
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.length).toBeLessThanOrEqual(all.length)
    expect(filtered.every((a) => a.affectedStopIds.includes(stopId))).toBe(true)
  })
})

// ── Protobuf binary integrity check ──────────────────────────────────────────

describeApi('Protobuf feed integrity', () => {
  it('vehicle positions feed decodes as valid FeedMessage', async () => {
    const apiKey = process.env.TFNSW_API_KEY!
    const res = await fetch('https://api.transport.nsw.gov.au/v1/gtfs/vehiclepos/buses', {
      headers: { Authorization: `apikey ${apiKey}` },
    })
    expect(res.ok).toBe(true)
    const buffer = await res.arrayBuffer()
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer))
    expect(feed.header).toBeDefined()
    expect(feed.header.gtfsRealtimeVersion).toBeTruthy()
    expect(Array.isArray(feed.entity)).toBe(true)
  })

  it('alerts feed decodes as valid FeedMessage', async () => {
    const apiKey = process.env.TFNSW_API_KEY!
    const res = await fetch('https://api.transport.nsw.gov.au/v2/gtfs/alerts/sydneytrains', {
      headers: { Authorization: `apikey ${apiKey}` },
    })
    expect(res.ok).toBe(true)
    const buffer = await res.arrayBuffer()
    const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer))
    expect(feed.header).toBeDefined()
    expect(Array.isArray(feed.entity)).toBe(true)
  })
})
