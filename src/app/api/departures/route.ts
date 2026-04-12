import { NextRequest, NextResponse } from 'next/server'
import { getDepartures } from '@/lib/tfnsw/departures'
import { cacheGet, cacheSet } from '@/lib/cache'
import type { Departure } from '@/lib/types'

const CACHE_TTL_MS = 15_000

interface DeparturesResponse {
  departures: Departure[]
  stopId: string
  fetchedAt: string
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const stopId = searchParams.get('stopId')?.trim()
  const serviceId = searchParams.get('serviceId')?.trim() ?? null
  const destination = searchParams.get('destination')?.trim() ?? null
  const maxPastMinutes = Math.min(Math.max(parseInt(searchParams.get('maxPastMinutes') ?? '1'), 1), 90)

  if (!stopId) {
    return NextResponse.json({ error: 'stopId is required' }, { status: 400 })
  }

  // Cache key includes maxPastMinutes — a wider lookback is a different dataset
  const cacheKey = `departures:${stopId}:past${maxPastMinutes}`
  let departures = cacheGet<Departure[]>(cacheKey)

  if (!departures) {
    try {
      departures = await getDepartures(stopId, 40, maxPastMinutes)
      cacheSet(cacheKey, departures, CACHE_TTL_MS)
    } catch (err) {
      console.error('[/api/departures]', err)
      return NextResponse.json({ error: 'Failed to fetch departures' }, { status: 502 })
    }
  }

  // Apply optional filters
  let filtered = departures
  if (serviceId) filtered = filtered.filter((d) => d.serviceId === serviceId)
  if (destination) filtered = filtered.filter((d) => d.destination === destination)

  const response: DeparturesResponse = {
    departures: filtered,
    stopId,
    fetchedAt: new Date().toISOString(),
  }

  return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } })
}
