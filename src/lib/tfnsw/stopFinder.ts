import { tfnswFetch } from './client'
import type { StopInfo, TransportMode } from '../types'

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

// ── /tp/coord response ────────────────────────────────────────────────────────

interface CoordLocation {
  id?: string
  type?: string
  coord?: [number, number]
  productClasses?: number[]
  properties?: {
    distance?: number
    STOP_NAME_WITH_PLACE?: string
    stopId?: string
  }
}

interface CoordResponse {
  locations?: CoordLocation[]
}

// ── /tp/departure_mon coord response (fallback) ───────────────────────────────

interface AssignedStop {
  id: string
  name: string
  coord?: [number, number]
  distance?: number
  modes?: number[]
}

interface DepartureMonCoordResponse {
  locations?: Array<{ assignedStops?: AssignedStop[] }>
}

/**
 * Finds nearby public transport stops using /tp/coord, which returns all stop
 * types (bus, train, metro, ferry, etc.). Falls back to departure_mon coord if
 * /tp/coord returns nothing.
 */
export async function findNearbyStops(
  lat: number,
  lng: number,
  radiusMetres = 500,
  maxStops = 10
): Promise<StopInfo[]> {
  // Try /tp/coord first — supports all transport modes
  try {
    const data = await tfnswFetch('/tp/coord', {
      outputFormat: 'rapidJSON',
      coord: `${lng}:${lat}:EPSG:4326`,
      coordOutputFormat: 'EPSG:4326',
      inclFilter: '1',
      type_1: 'STOP',
      radius_1: String(radiusMetres),
      version: '10.2.2.48',
    }) as CoordResponse

    const locations = data?.locations ?? []

    if (locations.length > 0) {
      const stops: StopInfo[] = locations
        .filter((loc) => loc.id && loc.properties?.STOP_NAME_WITH_PLACE)
        .slice(0, maxStops)
        .map((loc): StopInfo => {
          const classes = loc.productClasses ?? []
          const modes: TransportMode[] = classes.length > 0
            ? Array.from(new Set(classes.map(productClassToMode)))
            : ['unknown']
          return {
            stopId: loc.id!,
            stopName: loc.properties!.STOP_NAME_WITH_PLACE!,
            distance: loc.properties?.distance ?? 0,
            modes,
            lat: loc.coord?.[0] ?? lat,
            lng: loc.coord?.[1] ?? lng,
          }
        })

      stops.sort((a, b) => a.distance - b.distance)
      return stops
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: departure_mon with coord input (bus-stop-biased but reliable)
  const data = await tfnswFetch('/tp/departure_mon', {
    outputFormat: 'rapidJSON',
    type_dm: 'coord',
    name_dm: `${lng}:${lat}:EPSG:4326`,
    coordOutputFormat: 'EPSG:4326',
    departureMonitorMacro: 'true',
    TfNSWDM: 'true',
    version: '10.2.2.48',
  }) as DepartureMonCoordResponse

  const assignedStops: AssignedStop[] = data?.locations?.[0]?.assignedStops ?? []

  const stops: StopInfo[] = assignedStops
    .filter((s) => s.distance == null || s.distance <= radiusMetres)
    .slice(0, maxStops)
    .map((s): StopInfo => {
      const modes: TransportMode[] = (s.modes ?? []).length > 0
        ? Array.from(new Set((s.modes ?? []).map(productClassToMode)))
        : ['unknown']
      return {
        stopId: s.id,
        stopName: s.name,
        distance: s.distance ?? 0,
        modes,
        lat: s.coord?.[0] ?? lat,
        lng: s.coord?.[1] ?? lng,
      }
    })

  stops.sort((a, b) => a.distance - b.distance)
  return stops
}
