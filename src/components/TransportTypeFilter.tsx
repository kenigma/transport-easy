'use client'

import type { TransportMode } from '@/lib/types'

const MODES: { mode: TransportMode; label: string; emoji: string }[] = [
  { mode: 'bus',       label: 'Bus',        emoji: '🚌' },
  { mode: 'train',     label: 'Train',      emoji: '🚆' },
  { mode: 'metro',     label: 'Metro',      emoji: '🚇' },
  { mode: 'ferry',     label: 'Ferry',      emoji: '⛴️' },
  { mode: 'lightrail', label: 'Light Rail', emoji: '🚊' },
]

interface Props {
  selected: Set<TransportMode>
  onChange: (modes: Set<TransportMode>) => void
}

export function TransportTypeFilter({ selected, onChange }: Props) {
  const allSelected = selected.size === 0

  const toggle = (mode: TransportMode) => {
    const next = new Set(selected)
    if (next.has(mode)) next.delete(mode)
    else next.add(mode)
    onChange(next)
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      {/* "All" chip */}
      <button
        onClick={() => onChange(new Set())}
        className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          allSelected
            ? 'bg-tfnsw-blue text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        All
      </button>

      {MODES.map(({ mode, label, emoji }) => {
        const active = selected.has(mode)
        return (
          <button
            key={mode}
            onClick={() => toggle(mode)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              active
                ? 'bg-tfnsw-blue text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
