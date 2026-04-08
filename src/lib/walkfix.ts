import { getWalkSeconds } from './ors'
import type { Journey } from './types'

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
