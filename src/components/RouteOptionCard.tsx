'use client'

import { useState } from 'react'
import useSWR from 'swr'
import type { RouteOption, TimetableResponse, FavouriteTrip } from '@/lib/types'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
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

function todaySydney(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Australia/Sydney' }).format(new Date())
}

function next5Days(): { date: string; label: string }[] {
  const today = todaySydney()
  const result: { date: string; label: string }[] = []
  for (let i = 0; i < 5; i++) {
    const d = new Date(`${today}T12:00:00+11:00`)
    d.setDate(d.getDate() + i)
    const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Australia/Sydney' }).format(d)
    const label = i === 0
      ? 'Today'
      : new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short' }).format(d)
    result.push({ date, label })
  }
  return result
}

async function fetchTimetable(url: string): Promise<TimetableResponse> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch timetable')
  }
  return res.json()
}

interface Props {
  option: RouteOption
  fromLat: number
  fromLng: number
  toLat: number
  toLng: number
}

export function RouteOptionCard({ option, fromLat, fromLng, toLat, toLng }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [expandedEntryIdx, setExpandedEntryIdx] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(() => todaySydney())

  const { isFavourite, toggle } = useFavouriteTrips()

  // Derive favourite trip from the first transit leg of the sample journey
  const firstTransitLeg = option.sampleJourney.legs.find((l) => !l.isWalk) ?? null
  const firstWalkLeg = option.sampleJourney.legs.find((l) => l.isWalk) ?? null
  const walkMinutes = firstWalkLeg
    ? Math.round((firstWalkLeg.walkDurationSeconds ?? firstWalkLeg.durationSeconds) / 60)
    : 0
  const tripId = firstTransitLeg?.stopId
    ? `${firstTransitLeg.stopId}:${firstTransitLeg.serviceId}:${firstTransitLeg.legDestination}`
    : null
  const favouriteTrip: FavouriteTrip | null =
    tripId && firstTransitLeg?.stopId
      ? {
          id: tripId,
          stopId: firstTransitLeg.stopId,
          stopName: firstTransitLeg.originName,
          serviceId: firstTransitLeg.serviceId!,
          lineName: firstTransitLeg.lineName,
          destination: firstTransitLeg.legDestination ?? firstTransitLeg.destinationName,
          mode: firstTransitLeg.mode ?? 'unknown',
          walkMinutes,
          lat: firstTransitLeg.stopLat ?? 0,
          lng: firstTransitLeg.stopLng ?? 0,
          travelMinutes:
            firstTransitLeg.originDeparturePlanned && firstTransitLeg.destinationArrivalPlanned
              ? Math.round(
                  (new Date(firstTransitLeg.destinationArrivalPlanned).getTime() -
                    new Date(firstTransitLeg.originDeparturePlanned).getTime()) /
                    60_000
                )
              : null,
        }
      : null

  const saved = favouriteTrip ? isFavourite(favouriteTrip.id) : false

  const timetableUrl = expanded
    ? `/api/trip-timetable?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}&fingerprint=${encodeURIComponent(option.fingerprint)}&date=${selectedDate}`
    : null

  const { data, error, isLoading } = useSWR<TimetableResponse>(timetableUrl, fetchTimetable)

  const now = Date.now()
  const nextIdx = data
    ? data.entries.findIndex((e) => new Date(e.departurePlanned).getTime() >= now)
    : -1

  const days = next5Days()

  const transferLabel = option.transfers === 0
    ? 'Direct'
    : `${option.transfers} transfer${option.transfers > 1 ? 's' : ''}`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Route summary header */}
      <button
        className="w-full px-4 py-3 text-left"
        onClick={() => { setExpanded((v) => !v); setExpandedEntryIdx(null) }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{option.label}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {transferLabel}
              <span className="mx-1.5 text-gray-300">·</span>
              ~{formatDuration(option.typicalDurationSeconds)}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {favouriteTrip && (
              <button
                onClick={(e) => { e.stopPropagation(); toggle(favouriteTrip) }}
                className={`text-lg leading-none ${saved ? 'text-tfnsw-blue' : 'text-gray-300'}`}
                aria-label={saved ? 'Remove from My Trips' : 'Add to My Trips'}
              >
                {saved ? '★' : '☆'}
              </button>
            )}
            <span className="text-gray-400 text-sm">{expanded ? '▲' : '▾'}</span>
          </div>
        </div>
      </button>

      {/* Timetable */}
      {expanded && (
        <div className="border-t border-gray-50">
          {/* Day picker */}
          <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto">
            {days.map(({ date, label }) => (
              <button
                key={date}
                onClick={() => { setSelectedDate(date); setExpandedEntryIdx(null) }}
                className={`px-3 py-1 text-xs font-medium rounded-full flex-shrink-0 ${
                  selectedDate === date
                    ? 'bg-tfnsw-blue text-white'
                    : 'border border-gray-200 text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-2 px-4 py-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <p className="px-4 py-3 text-sm text-gray-400">{error.message}</p>
          )}

          {data && data.entries.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">No services found for this day.</p>
          )}

          {data && data.entries.length > 0 && (
            <div className="max-h-80 overflow-y-auto">
              {data.entries.map((entry, i) => {
                const isPast = new Date(entry.departurePlanned).getTime() < now
                const isNext = i === nextIdx
                const isEntryExpanded = expandedEntryIdx === i

                return (
                  <div key={i} className={`border-b border-gray-50 last:border-0 ${isPast ? 'opacity-40' : ''}`}>
                    <button
                      className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-2 ${isNext ? 'bg-blue-50' : ''}`}
                      onClick={() => setExpandedEntryIdx(isEntryExpanded ? null : i)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isNext ? 'bg-tfnsw-blue' : 'bg-transparent'}`} />
                        <span className={`text-sm font-medium ${isNext ? 'text-tfnsw-blue' : 'text-gray-800'}`}>
                          {formatTime(entry.departurePlanned)}
                        </span>
                        <span className="text-gray-300 text-xs">→</span>
                        <span className="text-sm text-gray-600">
                          {formatTime(entry.arrivalPlanned)}
                        </span>
                      </div>
                      <span className="text-gray-400 text-xs flex-shrink-0">{isEntryExpanded ? '▲' : '▾'}</span>
                    </button>

                    {isEntryExpanded && (
                      <div className="px-4 pb-3">
                        {entry.journey.legs.map((leg, li) => (
                          <LegRow key={li} leg={leg} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
