import { tfnswFetch } from './client'
import { getSydneyItdParams } from '../time'
import type { Journey, TripLeg, TransportMode } from '../types'

const PRODUCT_CLASS_MAP: Record<number, TransportMode> = {
  1: 'train',
  2: 'metro',
  4: 'lightrail',
  5: 'bus',
  7: 'coach',
  9: 'ferry',
}

function productClassToMode(cls: number): TransportMode {
  return PRODUCT_CLASS_MAP[cls] ?? 'unknown'
}

// ── Raw API types ─────────────────────────────────────────────────────────────

interface RawLegStop {
  name?: string
  id?: string
  coord?: [number, number]
  departureTimePlanned?: string
  departureTimeEstimated?: string
  arrivalTimePlanned?: string
  properties?: { platformName?: string; plannedPlatformName?: string }
}

interface RawTransportation {
  disassembledName?: string
  number?: string
  description?: string
  product?: { class?: number; iconId?: number }
  destination?: { name?: string }
}

interface RawLeg {
  isFootPath?: boolean
  footPathInfo?: Array<{ duration?: number }>
  duration?: number
  transportation?: RawTransportation
  origin?: RawLegStop
  destination?: RawLegStop
  realtimeStatus?: string[]
}

interface RawTripResponse {
  journeys?: Array<{ legs?: RawLeg[] }>
}

// ── Parsing ───────────────────────────────────────────────────────────────────

function isWalkLeg(leg: RawLeg): boolean {
  const cls = leg.transportation?.product?.class
  // class 100 = footpath in TfNSW API; 0/undefined = no transport
  return leg.isFootPath === true || !cls || cls === 100
}

function parseLeg(leg: RawLeg): TripLeg {
  const walk = isWalkLeg(leg)
  const walkDuration = leg.footPathInfo?.[0]?.duration ?? null
  const rawDuration = leg.duration ?? 0

  // Compute duration from times if leg.duration is 0
  let durationSeconds = rawDuration
  if (durationSeconds === 0 && leg.origin?.departureTimePlanned && leg.destination?.arrivalTimePlanned) {
    durationSeconds = (
      new Date(leg.destination.arrivalTimePlanned).getTime() -
      new Date(leg.origin.departureTimePlanned).getTime()
    ) / 1000
  }

  const transport = leg.transportation ?? {}
  const productClass = transport.product?.class ?? 0
  const isCancelled = leg.realtimeStatus?.some((s) => s.includes('CANCELLED')) ?? false

  const serviceId = transport.disassembledName ?? transport.number ?? null
  const fullName = transport.number ?? null
  const lineName = fullName && fullName !== serviceId ? fullName : null

  const platform = leg.origin?.properties?.platformName ?? null

  // Coords: TfNSW returns [lat, lng] with EPSG:4326
  const coord = leg.origin?.coord
  const stopLat = coord ? coord[0] : null
  const stopLng = coord ? coord[1] : null

  return {
    isWalk: walk,
    durationSeconds,
    walkDurationSeconds: walk ? (walkDuration ?? (rawDuration || null)) : null,

    serviceId: walk ? null : serviceId,
    lineName: walk ? null : lineName,
    mode: walk ? null : (productClass ? productClassToMode(productClass) : null),
    isCancelled,

    originName: leg.origin?.name ?? 'Unknown',
    originDeparturePlanned: leg.origin?.departureTimePlanned ?? null,
    originDepartureEstimated: leg.origin?.departureTimeEstimated ?? null,
    platformName: platform && platform !== '0' ? platform : null,
    destinationName: leg.destination?.name ?? 'Unknown',
    destinationArrivalPlanned: leg.destination?.arrivalTimePlanned ?? null,

    stopId: walk ? null : (leg.origin?.id ?? null),
    stopLat: walk ? null : stopLat,
    stopLng: walk ? null : stopLng,
    legDestination: walk ? null : (transport.destination?.name ?? null),
  }
}

function parseJourney(raw: { legs?: RawLeg[] }): Journey | null {
  const rawLegs = raw.legs ?? []

  // Parse all legs, filter out 0-second walk stubs
  const legs: TripLeg[] = rawLegs
    .map(parseLeg)
    .filter((leg) => !(leg.isWalk && leg.durationSeconds === 0 && leg.walkDurationSeconds === null))

  if (legs.length === 0) return null

  // Use first non-walk leg for departure time (first leg is often a walk from GPS)
  const firstTransit = legs.find((l) => !l.isWalk)
  const departurePlanned = firstTransit?.originDeparturePlanned ?? legs[0].originDeparturePlanned
  const arrivalPlanned = legs[legs.length - 1].destinationArrivalPlanned ?? legs[legs.length - 1].originDeparturePlanned

  if (!departurePlanned || !arrivalPlanned) return null

  const transitLegs = legs.filter((l) => !l.isWalk)
  const transfers = Math.max(0, transitLegs.length - 1)
  const totalDurationSeconds = legs.reduce((sum, l) => sum + l.durationSeconds, 0)
  const isAffectedByCancellation = legs.some((l) => l.isCancelled)

  return {
    legs,
    totalDurationSeconds,
    departurePlanned,
    arrivalPlanned,
    transfers,
    isAffectedByCancellation,
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function journeyFingerprint(journey: Journey): string {
  return journey.legs
    .filter((l) => !l.isWalk)
    .map((l) => `${l.mode}:${l.serviceId}`)
    .join('|')
}

export async function getTrip(
  originLat: number,
  originLng: number,
  destinationLat: number,
  destinationLng: number,
  dateTime?: Date,
  numTrips = 5,
  extraParams?: Record<string, string>,
): Promise<Journey[]> {
  const { itdDate, itdTime } = getSydneyItdParams(dateTime ?? new Date())

  const data = await tfnswFetch('/tp/trip', {
    outputFormat: 'rapidJSON',
    coordOutputFormat: 'EPSG:4326',
    // extraParams may override type_origin/name_origin (e.g. for stop-ID-based routing)
    type_origin: 'coord',
    name_origin: `${originLng}:${originLat}:EPSG:4326`,
    type_destination: 'coord',
    name_destination: `${destinationLng}:${destinationLat}:EPSG:4326`,
    itdDate,
    itdTime,
    calcNumberOfTrips: String(numTrips),
    depArrMacro: 'dep',
    TfNSWTR: 'true',
    version: '10.2.2.48',
    ...extraParams,  // spread last so type_origin/name_origin can be overridden
  }) as RawTripResponse

  const rawJourneys = data?.journeys ?? []
  return rawJourneys
    .map(parseJourney)
    .filter((j): j is Journey => j !== null)
}
