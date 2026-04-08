'use client'

import { useState, useEffect } from 'react'

/**
 * Ticks every intervalMs to force re-renders, keeping countdown numbers fresh
 * between SWR data refreshes.
 */
export function useCountdown(intervalMs = 10_000) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return tick
}
