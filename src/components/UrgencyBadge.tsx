'use client'

import { minutesUntil, urgencyLevel, formatCountdown, effectiveTime } from '@/lib/time'
import type { Departure } from '@/lib/types'
import { useCountdown } from '@/hooks/useCountdown'

const URGENCY_STYLES = {
  urgent:   'bg-red-500 text-white animate-pulse',
  soon:     'bg-orange-400 text-white',
  ok:       'bg-green-500 text-white',
  departed: 'bg-gray-300 text-gray-600',
}

interface Props {
  departure: Departure
}

export function UrgencyBadge({ departure }: Props) {
  useCountdown() // re-render every 10s

  const time = effectiveTime(departure)
  const minutes = minutesUntil(time)
  const level = departure.isCancelled ? 'departed' : urgencyLevel(minutes)
  const label = departure.isCancelled ? 'Cancelled' : formatCountdown(minutes)

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold min-w-[4.5rem] justify-center ${URGENCY_STYLES[level]}`}>
      {label}
    </span>
  )
}
