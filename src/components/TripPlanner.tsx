'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR from 'swr'
import type { StopResult, RouteOptionsResponse } from '@/lib/types'
import { RouteOptionCard } from './RouteOptionCard'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

interface SearchBoxProps {
  placeholder: string
  selected: StopResult | null
  onSelect: (r: StopResult) => void
  onClear: () => void
  autoFocus?: boolean
}

function SearchBox({ placeholder, selected, onSelect, onClear, autoFocus }: SearchBoxProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StopResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setResults([]); setLoading(false); return }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      try {
        const res = await fetch(`/api/stop-search?q=${encodeURIComponent(q)}`, {
          signal: abortRef.current.signal,
        })
        const data = await res.json()
        setResults(data.results ?? [])
        setHighlightedIndex(-1)
        setOpen(true)
      } catch (e: unknown) {
        if (e instanceof Error && e.name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }

  useEffect(() => () => {
    debounceRef.current && clearTimeout(debounceRef.current)
    abortRef.current?.abort()
  }, [])

  const pick = (r: StopResult) => {
    onSelect(r)
    setQuery('')
    setResults([])
    setOpen(false)
    setHighlightedIndex(-1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault()
      pick(results[highlightedIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setHighlightedIndex(-1)
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-sm text-gray-800 flex-1 truncate">
          {selected.modes.length > 0 ? (MODE_EMOJI[selected.modes[0]] ?? '📍') : '📍'} {selected.name}
        </span>
        <button onClick={onClear} className="text-gray-400 text-xs underline flex-shrink-0">Change</button>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value) }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); setHighlightedIndex(-1) }, 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-tfnsw-blue placeholder-gray-400"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-tfnsw-blue border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.stopId}
              onMouseDown={() => pick(r)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400 mr-2">{r.modes.length > 0 ? (MODE_EMOJI[r.modes[0]] ?? '📍') : '📍'}</span>{r.name}
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-sm text-gray-400">
          No stops found for &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}

async function fetchRouteOptions(url: string): Promise<RouteOptionsResponse> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch route options')
  }
  return res.json()
}

interface Props {
  gpsCoords: { lat: number; lng: number }
}

export function TripPlanner({ gpsCoords }: Props) {
  const [fromLocation, setFromLocation] = useState<StopResult | null>(null)
  const [changingFrom, setChangingFrom] = useState(false)
  const [toLocation, setToLocation] = useState<StopResult | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const fromCoords = fromLocation ?? gpsCoords
  const fromName = fromLocation?.name ?? 'Current location'

  // Build URL with optional stop IDs for more accurate routing
  const url = (() => {
    if (!submitted || !toLocation) return null
    const params = new URLSearchParams({
      fromLat: String(fromCoords.lat),
      fromLng: String(fromCoords.lng),
      toLat: String(toLocation.lat),
      toLng: String(toLocation.lng),
      fromName,
      toName: toLocation.name,
    })
    if (fromLocation?.stopId) params.set('fromStopId', fromLocation.stopId)
    if (toLocation?.stopId) params.set('toStopId', toLocation.stopId)
    return `/api/trip-options?${params.toString()}`
  })()

  const { data, error, isLoading, mutate } = useSWR<RouteOptionsResponse>(url, fetchRouteOptions)

  const handleFromSelect = (r: StopResult) => { setFromLocation(r); setChangingFrom(false); setSubmitted(false) }
  const handleToSelect = (r: StopResult) => { setToLocation(r); setSubmitted(false) }

  return (
    <div className="space-y-3">
      {/* Origin / Destination inputs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0 pt-2.5">From</span>
          <div className="flex-1">
            {changingFrom ? (
              <SearchBox
                placeholder="Enter station or stop name…"
                selected={null}
                onSelect={handleFromSelect}
                onClear={() => { setChangingFrom(false) }}
                autoFocus={true}
              />
            ) : fromLocation ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm text-gray-800 flex-1 truncate">
                  {fromLocation.modes.length > 0 ? (MODE_EMOJI[fromLocation.modes[0]] ?? '📍') : '📍'} {fromLocation.name}
                </span>
                <button onClick={() => { setFromLocation(null); setChangingFrom(true); setSubmitted(false) }} className="text-gray-400 text-xs underline flex-shrink-0">Change</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-sm text-gray-500 flex-1">📍 Current location</span>
                <button onClick={() => setChangingFrom(true)} className="text-gray-400 text-xs underline flex-shrink-0">Change</button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-xs text-gray-500 w-8 text-right flex-shrink-0 pt-2.5">To</span>
          <div className="flex-1">
            <SearchBox
              placeholder="Where to? (station or stop name…)"
              selected={toLocation}
              onSelect={handleToSelect}
              onClear={() => { setToLocation(null); setSubmitted(false) }}
            />
          </div>
        </div>

        <button
          onClick={() => setSubmitted(true)}
          disabled={!toLocation}
          className="w-full mt-1 py-2.5 bg-tfnsw-blue text-white text-sm font-semibold rounded-xl disabled:opacity-40 active:scale-95 transition-transform"
        >
          Find options
        </button>
      </div>

      {/* Results */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
          <p className="text-sm text-gray-500 mb-2">{error.message}</p>
          <button onClick={() => mutate()} className="text-sm text-tfnsw-blue font-medium">Try again</button>
        </div>
      )}

      {!isLoading && !error && data && data.options.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-sm">No routes found between these stops.</p>
          <p className="text-xs mt-1">Try a different destination or check service alerts.</p>
        </div>
      )}

      {!isLoading && !error && data && data.options.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-gray-400 text-center">
            {data.originName} → {data.destinationName}
          </p>
          {data.options.map((option) => (
            <RouteOptionCard
              key={option.fingerprint}
              option={option}
              fromLat={fromCoords.lat}
              fromLng={fromCoords.lng}
              toLat={toLocation!.lat}
              toLng={toLocation!.lng}
              fromStopId={fromLocation?.stopId}
              toStopId={toLocation?.stopId}
              toName={toLocation?.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
