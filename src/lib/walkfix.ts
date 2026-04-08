import { getWalkSeconds } from './ors'
import type { Journey } from './types'

/**
 * Replaces the duration of the first walk leg in a journey with a Google Maps
 * Distance Matrix result.
 *
 * TfNSW's /tp/trip calculates walk legs from a generic street network and is
 * inaccurate when the origin is a specific street address (vs. a named stop).
 * Google Maps uses the actual footpath network and gives more accurate results.
 *
 * Only patches the first leg when it is a walk leg — subsequent walk legs
 * (e.g. between interchange stops) are left unchanged.
 */
export async function fixFirstWalkLeg(
  journey: Journey,
  fromLat: number,
  fromLng: number,
): Promise<Journey> {
  const firstWalkIdx = journey.legs.findIndex((l) => l.isWalk)
  if (firstWalkIdx !== 0) return journey

  const firstTransit = journey.legs.find((l) => !l.isWalk)
  if (!firstTransit?.stopLat || !firstTransit?.stopLng) return journey

  const orsSeconds = await getWalkSeconds(fromLat, fromLng, firstTransit.stopLat, firstTransit.stopLng)
  if (orsSeconds === null) return journey

  const legs = [...journey.legs]
  legs[0] = { ...legs[0], durationSeconds: orsSeconds, walkDurationSeconds: orsSeconds }
  const totalDurationSeconds = journey.totalDurationSeconds - journey.legs[0].durationSeconds + orsSeconds
  return { ...journey, legs, totalDurationSeconds }
}
