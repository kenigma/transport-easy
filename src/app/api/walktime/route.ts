import { NextRequest, NextResponse } from 'next/server'
import { getWalkSeconds } from '@/lib/ors'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const fromLat = parseFloat(searchParams.get('fromLat') ?? '')
  const fromLng = parseFloat(searchParams.get('fromLng') ?? '')
  const toLat = parseFloat(searchParams.get('toLat') ?? '')
  const toLng = parseFloat(searchParams.get('toLng') ?? '')

  if ([fromLat, fromLng, toLat, toLng].some(isNaN)) {
    return NextResponse.json({ error: 'fromLat, fromLng, toLat, toLng are required' }, { status: 400 })
  }

  if (!process.env.ORS_API_KEY) {
    return NextResponse.json({ error: 'ORS_API_KEY not configured' }, { status: 503 })
  }

  const durationSeconds = await getWalkSeconds(fromLat, fromLng, toLat, toLng)
  if (durationSeconds === null) {
    return NextResponse.json({ error: 'Walk time estimation failed' }, { status: 502 })
  }

  return NextResponse.json({ walkMinutes: Math.round(durationSeconds / 60) })
}
