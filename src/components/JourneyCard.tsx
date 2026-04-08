'use client'

import { useState } from 'react'
import type { Journey } from '@/lib/types'
import { LegRow } from './LegRow'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Australia/Sydney',
  })
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

interface Props {
  journey: Journey
}

export function JourneyCard({ journey }: Props) {
  const [expanded, setExpanded] = useState(false)

  const transitLegs = journey.legs.filter((l) => !l.isWalk)
  const modeSummary = transitLegs
    .slice(0, 3)
    .map((l) => `${MODE_EMOJI[l.mode ?? 'unknown'] ?? '🚌'} ${l.serviceId ?? ''}`)
    .join(' → ')
  const extraLegs = transitLegs.length > 3 ? ` +${transitLegs.length - 3} more` : ''

  const transferLabel = journey.transfers === 0
    ? 'Direct'
    : `${journey.transfers} transfer${journey.transfers > 1 ? 's' : ''}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Summary row */}
      <button
        className="w-full px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {journey.isAffectedByCancellation && (
          <p className="text-xs text-red-600 font-medium mb-1">⚠️ Service disruption on this journey</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-base font-semibold text-gray-900">
                {formatTime(journey.departurePlanned)}
              </span>
              <span className="text-gray-400 text-sm">→</span>
              <span className="text-base font-semibold text-gray-900">
                {formatTime(journey.arrivalPlanned)}
              </span>
              <span className="text-sm text-gray-500">
                {formatDuration(journey.totalDurationSeconds)}
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-0.5">
              {modeSummary}{extraLegs}
              <span className="ml-2 text-xs text-gray-400">{transferLabel}</span>
            </p>
          </div>
          <span className="text-gray-400 text-sm flex-shrink-0">
            {expanded ? '▲' : '▾'}
          </span>
        </div>
      </button>

      {/* Expanded legs */}
      {expanded && (
        <div className="px-4 pb-3 border-t border-gray-50">
          {journey.legs.map((leg, i) => (
            <LegRow key={i} leg={leg} />
          ))}
        </div>
      )}
    </div>
  )
}
