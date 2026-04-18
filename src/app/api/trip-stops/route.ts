import { NextRequest, NextResponse } from 'next/server'
import { getTripStops } from '@/lib/tfnsw/departures'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { StopOnRoute } from '@/lib/types'

const CACHE_TTL_MS = 60_000 // 60s — stop sequences rarely change mid-trip

export async function GET(req: NextRequest) {
  const boardingStopId = req.nextUrl.searchParams.get('boardingStopId')?.trim()
  const terminalStopId = req.nextUrl.searchParams.get('terminalStopId')?.trim()
  const departureTime = req.nextUrl.searchParams.get('departureTime')?.trim()
  const serviceId = req.nextUrl.searchParams.get('serviceId')?.trim()

  if (!boardingStopId || !terminalStopId || !departureTime || !serviceId) {
    return NextResponse.json(
      { error: 'boardingStopId, terminalStopId, departureTime, serviceId are required' },
      { status: 400 },
    )
  }

  const cacheKey = `trip-stops:${boardingStopId}:${terminalStopId}:${departureTime}`
  const cached = cacheGet<StopOnRoute[]>(cacheKey)
  if (cached) return NextResponse.json({ stops: cached })

  try {
    const stops = await getTripStops(boardingStopId, terminalStopId, departureTime, serviceId)
    cacheSet(cacheKey, stops, CACHE_TTL_MS)
    return NextResponse.json({ stops })
  } catch (err) {
    console.error('[/api/trip-stops]', err)
    return NextResponse.json({ error: 'Could not fetch stop sequence' }, { status: 502 })
  }
}
