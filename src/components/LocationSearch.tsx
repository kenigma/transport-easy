'use client'

import { useState, useRef } from 'react'
import type { GeocodeResult } from '@/lib/types'

interface Props {
  onSelect: (result: GeocodeResult) => void
  onUseGPS: () => void
  manualLocation: GeocodeResult | null
}

export function LocationSearch({ onSelect, onUseGPS, manualLocation }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  const search = async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setHighlightedIndex(-1)
      setOpen(true)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    search(query)
  }

  const pick = (result: GeocodeResult) => {
    onSelect(result)
    setQuery('')
    setResults([])
    setOpen(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
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

  return (
    <div className="relative">
      {/* Active manual location pill */}
      {manualLocation && (
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs bg-tfnsw-blue text-white px-2.5 py-1 rounded-full font-medium truncate max-w-[200px]">
            📍 {manualLocation.name}
          </span>
          <button
            onClick={onUseGPS}
            className="text-xs text-gray-500 underline"
          >
            Use my location
          </button>
        </div>
      )}

      {/* Search form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => { setOpen(false); setHighlightedIndex(-1) }, 150)}
            onKeyDown={handleKeyDown}
            placeholder="Search suburb or postcode…"
            className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-tfnsw-blue placeholder-gray-400"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-tfnsw-blue border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-tfnsw-blue text-white text-sm font-medium rounded-xl active:scale-95 transition-transform"
        >
          Go
        </button>
      </form>

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onMouseDown={() => pick(r)}
              onMouseEnter={() => setHighlightedIndex(i)}
              className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 last:border-0 ${
                i === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <span className="text-gray-400 mr-2">📍</span>
              {r.name}
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length >= 2 && (
        <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white rounded-xl shadow-lg border border-gray-100 px-4 py-3 text-sm text-gray-400">
          No results for "{query}"
        </div>
      )}
    </div>
  )
}
