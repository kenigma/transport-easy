import { NextRequest, NextResponse } from 'next/server'
import { tfnswFetch } from '@/lib/tfnsw/client'
import type { StopResult, TransportMode } from '@/lib/types'

const PRODUCT_CLASS_MAP: Record<number, TransportMode> = {
  1: 'train',
  2: 'metro',
  4: 'lightrail',
  5: 'bus',
  7: 'coach',
  9: 'ferry',
}

interface RawLocation {
  id?: string
  disassembledName?: string
  name?: string
  coord?: [number, number]
  productClasses?: number[]
  type?: string
}

interface RawStopFinderResponse {
  locations?: RawLocation[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim()

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  try {
    const data = await tfnswFetch('/tp/stop_finder', {
      outputFormat: 'rapidJSON',
      type_sf: 'any',
      name_sf: q,
      coordOutputFormat: 'EPSG:4326',
      TfNSWSF: 'true',
    }) as RawStopFinderResponse

    const locations = data?.locations ?? []

    const results: StopResult[] = locations
      .filter((loc) => loc.id && (loc.type === 'stop' || loc.type === 'platform') && loc.coord)
      .slice(0, 8)
      .map((loc): StopResult => {
        const [lat, lng] = loc.coord!
        const modes: TransportMode[] = (loc.productClasses ?? [])
          .map((cls) => PRODUCT_CLASS_MAP[cls])
          .filter((m): m is TransportMode => m !== undefined)
        return {
          stopId: loc.id!,
          name: loc.disassembledName ?? loc.name ?? loc.id!,
          lat,
          lng,
          modes,
        }
      })

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[/api/stop-search]', err)
    return NextResponse.json({ error: 'Failed to search stops' }, { status: 502 })
  }
}
