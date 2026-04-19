import { tfnswFetch } from './client'
import type { Alert, TransportMode } from '../types'

const MODE_MAP: Record<string, TransportMode> = {
  BUS: 'bus',
  TRAIN: 'train',
  METRO: 'metro',
  FERRY: 'ferry',
  LIGHTRAIL: 'lightrail',
  COACH: 'coach',
}

interface RawAlert {
  id?: string
  headerText?: { translation?: Array<{ text?: string }> }
  descriptionText?: { translation?: Array<{ text?: string }> }
  url?: { translation?: Array<{ text?: string }> }
  effect?: string
  informedEntity?: Array<{
    stopId?: string
    routeType?: string
    routeId?: string
  }>
}

function getText(field: RawAlert['headerText']): string {
  return field?.translation?.[0]?.text ?? ''
}

function effectToSeverity(effect: string | undefined): Alert['severity'] {
  if (!effect) return 'info'
  const e = effect.toUpperCase()
  if (e.includes('NO_SERVICE') || e.includes('SIGNIFICANT')) return 'disruption'
  if (e.includes('REDUCED') || e.includes('DETOUR') || e.includes('MODIFIED')) return 'warning'
  return 'info'
}

/**
 * Fetches active service alerts, optionally filtered to the given stop IDs.
 */
export async function getAlerts(stopIds: string[] = []): Promise<Alert[]> {
  const data = await tfnswFetch('/gtfs/alerts/sydneytrains', {}, 'v2') as {
    entity?: Array<{ alert?: RawAlert }>
  }

  const entities = data?.entity ?? []

  return entities
    .map((e): Alert | null => {
      const raw = e.alert
      if (!raw) return null

      const affectedStopIds = (raw.informedEntity ?? [])
        .map((ie) => ie.stopId)
        .filter((id): id is string => !!id)

      // If stopIds filter provided, skip alerts not matching any
      if (stopIds.length > 0 && !affectedStopIds.some((id) => stopIds.includes(id))) {
        return null
      }

      const affectedModes: TransportMode[] = Array.from(new Set(
        (raw.informedEntity ?? [])
          .map((ie) => MODE_MAP[ie.routeType?.toUpperCase() ?? ''] ?? null)
          .filter((m): m is TransportMode => m !== null)
      ))

      return {
        id: raw.id ?? Math.random().toString(36),
        title: getText(raw.headerText),
        description: getText(raw.descriptionText),
        affectedModes,
        affectedStopIds,
        severity: effectToSeverity(raw.effect),
        url: getText(raw.url) || null,
      }
    })
    .filter((a): a is Alert => a !== null && !!a.title)
}
