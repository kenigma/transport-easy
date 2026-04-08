export type TransportMode = 'bus' | 'train' | 'metro' | 'ferry' | 'lightrail' | 'coach' | 'unknown'

export interface StopInfo {
  stopId: string
  stopName: string
  distance: number // metres from user
  modes: TransportMode[]
  lat: number
  lng: number
}

export interface Departure {
  serviceId: string        // e.g. "380", "T4", "M1"
  lineName: string | null  // e.g. "T4 Eastern Suburbs & Illawarra Line"
  destination: string      // e.g. "Bondi Beach"
  scheduledDepartureTime: string  // ISO 8601
  estimatedDepartureTime: string | null  // null if no real-time data
  platformName: string | null
  mode: TransportMode
  isCancelled: boolean
  occupancy: 'empty' | 'many_seats' | 'few_seats' | 'full' | null
}

export interface GeocodeResult {
  name: string
  lat: number
  lng: number
}

export interface StopWithDepartures extends StopInfo {
  departures: Departure[]
}

export interface Alert {
  id: string
  title: string
  description: string
  affectedModes: TransportMode[]
  affectedStopIds: string[]
  severity: 'info' | 'warning' | 'disruption'
  url: string | null
}

export interface FavouriteTrip {
  id: string           // unique key: `${stopId}:${serviceId}:${destination}`
  stopId: string
  stopName: string
  serviceId: string
  lineName: string | null
  destination: string
  mode: TransportMode
  walkMinutes: number  // minutes to walk to stop; 0 = no preference
  lat: number
  lng: number
}

// ── Trip Planner ──────────────────────────────────────────────────────────────

export interface TripLeg {
  isWalk: boolean
  durationSeconds: number
  walkDurationSeconds: number | null

  // Transit only
  serviceId: string | null
  lineName: string | null
  mode: TransportMode | null
  isCancelled: boolean

  // Stops
  originName: string
  originDeparturePlanned: string | null
  originDepartureEstimated: string | null
  platformName: string | null
  destinationName: string
  destinationArrivalPlanned: string | null

  // For save-as-favourite
  stopId: string | null
  stopLat: number | null
  stopLng: number | null
  legDestination: string | null
}

export interface Journey {
  legs: TripLeg[]
  totalDurationSeconds: number
  departurePlanned: string
  arrivalPlanned: string
  transfers: number
  isAffectedByCancellation: boolean
}

export interface TripResponse {
  journeys: Journey[]
  originName: string
  destinationName: string
  fetchedAt: string
}

export interface RouteOption {
  fingerprint: string
  label: string
  modes: TransportMode[]
  transfers: number
  typicalDurationSeconds: number
  sampleJourney: Journey
}

export interface RouteOptionsResponse {
  options: RouteOption[]
  originName: string
  destinationName: string
  fetchedAt: string
}

export interface TimetableEntry {
  departurePlanned: string
  arrivalPlanned: string
  journey: Journey
}

export interface TimetableResponse {
  entries: TimetableEntry[]
  fingerprint: string
  fetchedAt: string
}

export interface NearbyResponse {
  stops: StopWithDepartures[]
  fetchedAt: string  // ISO 8601
}

export interface AlertsResponse {
  alerts: Alert[]
  fetchedAt: string
}

// ── Vehicle Location ──────────────────────────────────────────────────────────

export interface VehiclePosition {
  vehicleId: string
  vehicleLabel: string | null   // e.g. "2234" (bus fleet number)
  tripId: string | null
  routeId: string               // e.g. "380_b_sydneybus"
  lat: number
  lng: number
  bearing: number | null        // degrees 0–359
  speed: number | null          // m/s
  currentStatus: 'INCOMING_AT' | 'STOPPED_AT' | 'IN_TRANSIT_TO' | null
  timestamp: string | null      // ISO string
}

export interface VehicleLocationResponse {
  vehicles: VehiclePosition[]
  fetchedAt: string
  provider: string
}
