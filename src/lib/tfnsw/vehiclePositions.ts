import { transit_realtime } from 'gtfs-realtime-bindings'
import type { TransportMode, VehiclePosition } from '../types'

const BASE_URL = 'https://api.transport.nsw.gov.au/v1'

// TfNSW GTFS Realtime vehicle positions — only available for modes that
// broadcast GPS positions. Trains use EFA-based realtime (departure_mon),
// not GTFS-R vehicle positions, so 'train' is intentionally absent.
const MODE_TO_PROVIDER: Partial<Record<TransportMode, string>> = {
  bus:       'buses',
  metro:     'metro',
  lightrail: 'lightrail',
  ferry:     'ferries',
  coach:     'coaches',
}

export function providerForMode(mode: TransportMode): string | null {
  return MODE_TO_PROVIDER[mode] ?? null
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Filters a list of all vehicles down to those matching serviceId,
 * sorted by distance to the stop, top 5 closest.
 * TfNSW GTFS route IDs use the format "{operator_code}_{route_number}":
 *   "2509_333"  → route 333
 *   "2509_390X" → route 390X
 *   "_940"      → route 940 (no operator prefix)
 * The route number is always the last segment after splitting on "_".
 */
export function filterAndSortVehicles(
  vehicles: VehiclePosition[],
  serviceId: string,
  stopLat: number,
  stopLng: number,
  limit = 5,
): VehiclePosition[] {
  const sid = serviceId.toUpperCase()
  return vehicles
    .filter((v) => (v.routeId.split('_').pop() ?? '').toUpperCase() === sid)
    .map((v) => ({ v, distKm: haversineKm(v.lat, v.lng, stopLat, stopLng) }))
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, limit)
    .map(({ v }) => v)
}

/**
 * Fetches the full GTFS Realtime vehicle positions feed for a given transport mode.
 * Returns all active vehicles for that provider (e.g. all Sydney buses).
 * Filtering by route/service is done by the caller.
 */
export async function getVehiclePositions(mode: TransportMode): Promise<VehiclePosition[]> {
  const provider = providerForMode(mode)
  if (!provider) return []

  const apiKey = process.env.TFNSW_API_KEY
  if (!apiKey) throw new Error('TFNSW_API_KEY environment variable is not set')

  const url = `${BASE_URL}/gtfs/vehiclepos/${provider}`
  const res = await fetch(url, {
    headers: { Authorization: `apikey ${apiKey}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`TfNSW GTFS Realtime error ${res.status}: ${await res.text()}`)
  }

  const buffer = await res.arrayBuffer()
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer))

  const positions: VehiclePosition[] = []
  for (const entity of feed.entity ?? []) {
    const v = entity.vehicle
    if (!v) continue

    const lat = v.position?.latitude
    const lng = v.position?.longitude
    if (lat == null || lng == null) continue

    const rawTs = v.timestamp
    const timestamp = rawTs
      ? new Date(Number(rawTs) * 1000).toISOString()
      : null

    let currentStatus: VehiclePosition['currentStatus'] = null
    if (v.currentStatus != null) {
      const s = transit_realtime.VehiclePosition.VehicleStopStatus
      if (v.currentStatus === s.INCOMING_AT) currentStatus = 'INCOMING_AT'
      else if (v.currentStatus === s.STOPPED_AT) currentStatus = 'STOPPED_AT'
      else if (v.currentStatus === s.IN_TRANSIT_TO) currentStatus = 'IN_TRANSIT_TO'
    }

    positions.push({
      vehicleId: String(entity.id ?? v.vehicle?.id ?? ''),
      vehicleLabel: v.vehicle?.label ?? null,
      tripId: v.trip?.tripId ?? null,
      routeId: v.trip?.routeId ?? '',
      lat,
      lng,
      bearing: v.position?.bearing ?? null,
      speed: v.position?.speed ?? null,
      currentStatus,
      timestamp,
    })
  }

  return positions
}
