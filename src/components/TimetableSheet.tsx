'use client'

import { useEffect, useRef } from 'react'
import useSWR from 'swr'
import type { Departure } from '@/lib/types'
import { minutesUntil, formatCountdown, urgencyLevel, effectiveTime } from '@/lib/time'
import { useCountdown } from '@/hooks/useCountdown'

const URGENCY_CLASSES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  soon: 'bg-orange-100 text-orange-700',
  ok: 'bg-green-100 text-green-700',
  departed: 'bg-gray-100 text-gray-400',
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Australia/Sydney',
  })
}

interface Props {
  stopId: string
  stopName: string
  serviceId: string
  destination: string
  mode: string
  onClose: () => void
}

async function fetchDepartures(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json() as Promise<{ departures: Departure[] }>
}

export function TimetableSheet({ stopId, stopName, serviceId, destination, mode, onClose }: Props) {
  useCountdown(10_000)
  const sheetRef = useRef<HTMLDivElement>(null)

  const url = `/api/departures?stopId=${encodeURIComponent(stopId)}&serviceId=${encodeURIComponent(serviceId)}&destination=${encodeURIComponent(destination)}`
  const { data, error, isLoading } = useSWR(url, fetchDepartures, { refreshInterval: 20_000 })

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const departures = data?.departures ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className="w-full max-h-[80vh] bg-white rounded-t-2xl overflow-hidden flex flex-col"
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-gray-500 truncate">{stopName}</p>
            <h2 className="text-base font-semibold text-gray-900 leading-snug">
              {serviceId} → {destination}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl leading-none p-1 flex-shrink-0"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {isLoading && (
            <div className="space-y-2 py-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-gray-400 text-center py-6">
              Could not load timetable. Check your connection.
            </p>
          )}

          {!isLoading && !error && departures.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No upcoming services for this route.
            </p>
          )}

          {departures.map((dep, i) => {
            const t = effectiveTime(dep)
            const mins = minutesUntil(t)
            const level = dep.isCancelled ? 'departed' : urgencyLevel(mins)
            const badgeClass = URGENCY_CLASSES[level]

            return (
              <div
                key={`${dep.scheduledDepartureTime}-${i}`}
                className={`flex items-center justify-between py-3 border-b border-gray-50 last:border-0 ${dep.isCancelled ? 'opacity-50' : ''}`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {formatTime(dep.scheduledDepartureTime)}
                    {dep.estimatedDepartureTime && dep.estimatedDepartureTime !== dep.scheduledDepartureTime && (
                      <span className="ml-2 text-xs text-blue-600">
                        {formatTime(dep.estimatedDepartureTime)} live
                      </span>
                    )}
                  </p>
                  {dep.platformName && dep.platformName !== '0' && (
                    <p className="text-xs text-gray-500">Platform {dep.platformName}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badgeClass}`}>
                  {dep.isCancelled ? 'Cancelled' : formatCountdown(mins)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer with mode info */}
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 text-center">
            {mode} service · updates every 20s
          </p>
        </div>
      </div>
    </div>
  )
}
