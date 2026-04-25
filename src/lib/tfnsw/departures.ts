import { tfnswFetch } from './client'
import { getSydneyItdParams } from '../time'
import type { Departure, StopOnRoute, TransportMode } from '../types'

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
  arrivalTimePlanned?: string
  realtimeStatus?: string[]
  isRealtimeControlled?: boolean
  location?: {
    id?: string
    name?: string
    properties?: { platformName?: string; plannedPlatformName?: string }
  }
  transportation?: {
    id?: string
    disassembledName?: string
    number?: string
    destination?: { name?: string; id?: string }  // id = terminal stop ID
    product?: { class?: number }
    iconId?: number
    properties?: { gtfsId?: string }
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
  maxPastMinutes = 1,
  futureMinutes = 90,
): Promise<Departure[]> {
  const now = new Date()
  // Offset query start time so the API returns departures going back maxPastMinutes
  const queryTime = maxPastMinutes > 1
    ? new Date(now.getTime() - maxPastMinutes * 60_000)
    : now
  const { itdDate, itdTime } = getSydneyItdParams(queryTime)

  // TfNSW defaults to ~40 events. At busy multi-mode stops (Chatswood: 20 bus +
  // 10 metro + 8 train events in a 35-min window), the budget gets exhausted
  // before we have enough of any single service. Request 5× our slice budget,
  // floored at 50, so a caller asking for the full extended window still gets
  // adequate per-service coverage after caller-side filtering.
  const limit = Math.max(50, maxDepartures * 5)

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
    limit: String(limit),
  }) as { stopEvents?: RawStopEvent[] }

  const events = data?.stopEvents ?? []
  const nowMs = now.getTime()

  const departures: Departure[] = events
    .filter((e) => {
      const t = e.departureTimeEstimated ?? e.departureTimePlanned
      if (!t) return false
      const diffMin = (new Date(t).getTime() - nowMs) / 60_000
      return diffMin > -maxPastMinutes && diffMin < futureMinutes
    })
    .slice(0, maxDepartures)
    .map((e): Departure => {
      const transport = e.transportation ?? {}
      const productClass = transport.product?.class ?? transport.iconId ?? 5
      // EFA reports 'TRIP_CANCELLED' (or 'STOP_CANCELLED') as array elements —
      // substring match so we catch both, and any future variants.
      const isCancelled = e.realtimeStatus?.some((s) => s.includes('CANCELLED')) ?? false

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
        tripId: transport.properties?.gtfsId ?? null,
        terminalStopId: transport.destination?.id ?? null,
      }
    })

  return departures
}

interface RawTripLegStop {
  id?: string
  name?: string
  departureTimePlanned?: string
  departureTimeEstimated?: string
  arrivalTimePlanned?: string
  properties?: { platformName?: string }
}

interface RawTripLeg {
  isFootPath?: boolean
  transportation?: { disassembledName?: string }
  origin?: RawTripLegStop
  stopSequence?: RawTripLegStop[]
  realtimeStatus?: string[]
}

/**
 * Fetches the full stop sequence for a specific departure using the TfNSW
 * Trip Planner API. Queries from the boarding stop to the terminal stop at
 * the scheduled departure time, then finds the leg matching the service ID.
 */
export async function getTripStops(
  boardingStopId: string,
  terminalStopId: string,
  scheduledDepartureTime: string,
  serviceId: string,
): Promise<StopOnRoute[]> {
  const depDate = new Date(scheduledDepartureTime)
  const { itdDate, itdTime } = getSydneyItdParams(depDate)
  const depMs = depDate.getTime()

  const data = await tfnswFetch('/tp/trip', {
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    type_origin: 'stop',
    name_origin: boardingStopId,
    isGlobalId: '1',
    type_destination: 'stop',
    name_destination: terminalStopId,
    itdDate,
    itdTime,
    depArrMacro: 'dep',
    calcNumberOfTrips: '5',
    TfNSWTR: 'true',
    version: '10.2.2.48',
  }) as { journeys?: Array<{ legs?: RawTripLeg[] }> }

  for (const journey of data.journeys ?? []) {
    for (const leg of journey.legs ?? []) {
      if (leg.isFootPath) continue
      if (leg.transportation?.disassembledName !== serviceId) continue
      const legDep = leg.origin?.departureTimePlanned
      if (!legDep) continue
      // Match within 10 minutes of the scheduled departure
      if (Math.abs(new Date(legDep).getTime() - depMs) > 10 * 60_000) continue

      // Found — return the stopSequence (includes origin + all intermediate stops + destination)
      return (leg.stopSequence ?? []).map((s): StopOnRoute => ({
        stopId: s.id ?? '',
        stopName: s.name ?? 'Unknown',
        plannedDeparture: s.departureTimePlanned ?? null,
        plannedArrival: s.arrivalTimePlanned ?? null,
        estimatedDeparture: s.departureTimeEstimated ?? null,
        isCancelled: leg.realtimeStatus?.some((s) => s.includes('CANCELLED')) ?? false,
        platformName: s.properties?.platformName && s.properties.platformName !== '0'
          ? s.properties.platformName
          : null,
      }))
    }
  }

  return []
}
