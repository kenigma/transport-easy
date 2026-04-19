import { transit_realtime } from 'gtfs-realtime-bindings'
import type { Alert, TransportMode } from '../types'

const ALERTS_URL = 'https://api.transport.nsw.gov.au/v2/gtfs/alerts/sydneytrains'

// GTFS route_type → TransportMode
const ROUTE_TYPE_MAP: Record<number, TransportMode> = {
  0: 'lightrail',
  1: 'metro',
  2: 'train',
  3: 'bus',
  4: 'ferry',
}

function effectToSeverity(effect: transit_realtime.Alert.Effect | null | undefined): Alert['severity'] {
  if (!effect) return 'info'
  if (
    effect === transit_realtime.Alert.Effect.NO_SERVICE ||
    effect === transit_realtime.Alert.Effect.SIGNIFICANT_DELAYS
  ) return 'disruption'
  if (
    effect === transit_realtime.Alert.Effect.REDUCED_SERVICE ||
    effect === transit_realtime.Alert.Effect.DETOUR ||
    effect === transit_realtime.Alert.Effect.MODIFIED_SERVICE
  ) return 'warning'
  return 'info'
}

function getTranslation(text: transit_realtime.ITranslatedString | null | undefined): string {
  return text?.translation?.[0]?.text ?? ''
}

/**
 * Fetches active service alerts from the TfNSW GTFS Realtime v2 feed.
 * Response is protobuf binary — parsed with gtfs-realtime-bindings.
 * Optionally filtered to alerts affecting the given stop IDs.
 */
export async function getAlerts(stopIds: string[] = []): Promise<Alert[]> {
  const apiKey = process.env.TFNSW_API_KEY
  if (!apiKey) throw new Error('TFNSW_API_KEY environment variable is not set')

  const res = await fetch(ALERTS_URL, {
    headers: { Authorization: `apikey ${apiKey}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`TfNSW alerts error ${res.status}: ${await res.text()}`)
  }

  const buffer = await res.arrayBuffer()
  const feed = transit_realtime.FeedMessage.decode(new Uint8Array(buffer))

  return (feed.entity ?? [])
    .map((entity): Alert | null => {
      const raw = entity.alert
      if (!raw) return null

      const informed = raw.informedEntity ?? []

      const affectedStopIds = informed
        .map((ie) => ie.stopId)
        .filter((id): id is string => !!id)

      if (stopIds.length > 0 && !affectedStopIds.some((id) => stopIds.includes(id))) {
        return null
      }

      const affectedModes: TransportMode[] = Array.from(new Set(
        informed
          .map((ie) => ROUTE_TYPE_MAP[ie.routeType ?? -1] ?? null)
          .filter((m): m is TransportMode => m !== null)
      ))

      const title = getTranslation(raw.headerText)
      if (!title) return null

      return {
        id: entity.id ?? Math.random().toString(36),
        title,
        description: getTranslation(raw.descriptionText),
        affectedModes,
        affectedStopIds,
        severity: effectToSeverity(raw.effect),
        url: getTranslation(raw.url) || null,
      }
    })
    .filter((a): a is Alert => a !== null)
}
