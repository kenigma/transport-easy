import { NextRequest, NextResponse } from 'next/server'
import { getVehiclePositions, providerForMode, filterAndSortVehicles } from '@/lib/tfnsw/vehiclePositions'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { TransportMode, VehiclePosition, VehicleLocationResponse } from '@/lib/types'

const CACHE_TTL_MS = 10_000 // 10 seconds — real-time data

const VALID_MODES: TransportMode[] = ['bus', 'train', 'metro', 'ferry', 'lightrail', 'coach', 'unknown']

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const mode = searchParams.get('mode') as TransportMode | null
  const serviceId = searchParams.get('serviceId')
  const stopLat = parseFloat(searchParams.get('stopLat') ?? '')
  const stopLng = parseFloat(searchParams.get('stopLng') ?? '')

  if (!mode || !VALID_MODES.includes(mode) || !serviceId || isNaN(stopLat) || isNaN(stopLng)) {
    return NextResponse.json({ error: 'mode, serviceId, stopLat, stopLng are required' }, { status: 400 })
  }

  const provider = providerForMode(mode)
  if (!provider) {
    return NextResponse.json<VehicleLocationResponse>({
      vehicles: [], fetchedAt: new Date().toISOString(), provider: 'none',
    })
  }

  // Cache the entire provider feed (not per-service) — one fetch covers all vehicles
  const cacheKey = `vehiclepos:${provider}`
  let allVehicles = cacheGet<VehiclePosition[]>(cacheKey)

  if (!allVehicles) {
    try {
      allVehicles = await getVehiclePositions(mode)
      cacheSet(cacheKey, allVehicles, CACHE_TTL_MS)
    } catch (err) {
      console.error('[/api/vehicle-location]', err)
      return NextResponse.json({ error: 'Could not fetch vehicle positions' }, { status: 502 })
    }
  }

  const sorted = filterAndSortVehicles(allVehicles, serviceId, stopLat, stopLng)

  return NextResponse.json<VehicleLocationResponse>({
    vehicles: sorted,
    fetchedAt: new Date().toISOString(),
    provider,
  })
}
