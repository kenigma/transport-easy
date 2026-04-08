import { NextRequest, NextResponse } from 'next/server'
import type { GeocodeResult } from '@/lib/types'

interface GoogleGeocodeResult {
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
}

interface GoogleGeocodeResponse {
  status: string
  results: GoogleGeocodeResult[]
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Geocoding not configured' }, { status: 500 })
  }

  const userLat = parseFloat(req.nextUrl.searchParams.get('lat') ?? '')
  const userLng = parseFloat(req.nextUrl.searchParams.get('lng') ?? '')
  const hasLocation = !isNaN(userLat) && !isNaN(userLng)

  try {
    // Fetch without NSW restriction so we get all AU matches, then sort by proximity
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q + ', Australia')}&key=${apiKey}&components=country:AU`
    const res = await fetch(url)
    const data: GoogleGeocodeResponse = await res.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error('[/api/geocode] Google error:', data.status)
      return NextResponse.json({ results: [] })
    }

    let results: GeocodeResult[] = data.results.map((r) => ({
      name: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }))

    // Sort by distance to user's GPS if available
    if (hasLocation) {
      results.sort((a, b) =>
        distanceKm(userLat, userLng, a.lat, a.lng) - distanceKm(userLat, userLng, b.lat, b.lng)
      )
    }

    return NextResponse.json({ results: results.slice(0, 5) })
  } catch (err) {
    console.error('[/api/geocode]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 502 })
  }
}
