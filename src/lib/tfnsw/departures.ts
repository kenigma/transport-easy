import { tfnswFetch } from './client'
import { getSydneyItdParams } from '../time'
import type { Departure, TransportMode } from '../types'

const PRODUCT_CLASS_MAP: Record<number, TransportMode> = {
  1: 'train',
  2: 'metro',
  4: 'lightrail',
  5: 'bus',
  7: 'coach',
  9: 'ferry',
}

function productClassToMode(productClass: number): TransportMode {
  return PRODUCT_CLASS_MAP[productClass] ?? 'unknown'
}

type OccupancyStatus = Departure['occupancy']

function parseOccupancy(raw: string | undefined): OccupancyStatus {
  switch (raw) {
    case 'EMPTY': return 'empty'
    case 'MANY_SEATS_AVAILABLE': return 'many_seats'
    case 'FEW_SEATS_AVAILABLE': return 'few_seats'
    case 'STANDING_ROOM_ONLY':
    case 'FULL': return 'full'
    default: return null
  }
}


interface RawStopEvent {
  departureTimePlanned?: string
  departureTimeEstimated?: string
  realtimeStatus?: string[]
  isRealtimeControlled?: boolean
  location?: {
    properties?: { platformName?: string; plannedPlatformName?: string }
  }
  transportation?: {
    disassembledName?: string
    number?: string
    destination?: { name?: string }
    product?: { class?: number }
    iconId?: number
  }
  properties?: { OccupancyStatus?: string }
}

/**
 * Gets upcoming departures from a stop using the TfNSW Departure Monitor API.
 * Returns departures in the next 90 minutes, excluding those that departed
 * more than 1 minute ago. Results are limited to `maxDepartures`.
 *
 * Uses Sydney local time for itdDate/itdTime (TfNSW API is timezone-sensitive).
 */
export async function getDepartures(
  stopId: string,
  maxDepartures = 5,
  maxPastMinutes = 1
): Promise<Departure[]> {
  const now = new Date()
  const { itdDate, itdTime } = getSydneyItdParams(now)

  const data = await tfnswFetch('/tp/departure_mon', {
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    mode: 'direct',
    type_dm: 'stop',
    name_dm: stopId,
    isGlobalId: '1',
    depArrMacro: 'dep',
    itdDate,
    itdTime,
    TfNSWDM: 'true',
    version: '10.2.2.48',
  }) as { stopEvents?: RawStopEvent[] }

  const events = data?.stopEvents ?? []
  const nowMs = now.getTime()

  const departures: Departure[] = events
    .filter((e) => {
      const t = e.departureTimeEstimated ?? e.departureTimePlanned
      if (!t) return false
      const diffMin = (new Date(t).getTime() - nowMs) / 60_000
      return diffMin > -maxPastMinutes && diffMin < 90
    })
    .slice(0, maxDepartures)
    .map((e): Departure => {
      const transport = e.transportation ?? {}
      const productClass = transport.product?.class ?? transport.iconId ?? 5
      const isCancelled = e.realtimeStatus?.includes('CANCELLED') ?? false

      // Use disassembledName (e.g. "T4", "M1", "380") — falls back to number
      const serviceId = transport.disassembledName ?? transport.number ?? '?'

      // Platform from location.properties
      const platformName = e.location?.properties?.platformName ?? null

      // Full line name (e.g. "T4 Eastern Suburbs & Illawarra Line") — null if same as serviceId
      const fullName = transport.number ?? null
      const lineName = fullName && fullName !== serviceId ? fullName : null

      return {
        serviceId,
        lineName,
        destination: transport.destination?.name ?? 'Unknown',
        scheduledDepartureTime: e.departureTimePlanned ?? '',
        estimatedDepartureTime: e.departureTimeEstimated ?? null,
        platformName,
        mode: productClassToMode(productClass),
        isCancelled,
        occupancy: parseOccupancy(e.properties?.OccupancyStatus),
      }
    })

  return departures
}
