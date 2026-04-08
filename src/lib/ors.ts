interface DistanceMatrixResponse {
  rows?: Array<{
    elements?: Array<{
      status?: string
      duration?: { value?: number }
    }>
  }>
}

/**
 * Returns walking duration in seconds between two points using the Google Maps
 * Distance Matrix API, or null on failure.
 *
 * Note: the file is named `ors.ts` for historical reasons (originally used
 * OpenRouteService). It now calls Google Maps exclusively.
 * Shared by `/api/walktime` and `/api/trip` (via fixFirstWalkLeg).
 */
export async function getWalkSeconds(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`
      + `?origins=${fromLat},${fromLng}`
      + `&destinations=${toLat},${toLng}`
      + `&mode=walking`
      + `&key=${apiKey}`

    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null

    const data = await res.json() as DistanceMatrixResponse
    const element = data?.rows?.[0]?.elements?.[0]
    if (element?.status !== 'OK') return null

    return element.duration?.value ?? null
  } catch {
    return null
  }
}
