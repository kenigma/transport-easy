'use client'

import { useGeolocation } from '@/hooks/useGeolocation'

interface Props {
  children: (coords: { lat: number; lng: number }) => React.ReactNode
}

export function LocationGate({ children }: Props) {
  const { state, retry } = useGeolocation()

  if (state.status === 'granted') {
    return <>{children(state.coords)}</>
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-4">
      {state.status === 'idle' || state.status === 'requesting' ? (
        <>
          <div className="text-5xl">📍</div>
          <h2 className="text-xl font-semibold text-gray-800">Finding your location…</h2>
          <p className="text-gray-500 text-sm max-w-xs">
            Allow location access to see nearby transport departures.
          </p>
          <div className="w-8 h-8 border-4 border-tfnsw-blue border-t-transparent rounded-full animate-spin mt-2" />
        </>
      ) : state.status === 'denied' ? (
        <>
          <div className="text-5xl">🔒</div>
          <h2 className="text-xl font-semibold text-gray-800">Location access denied</h2>
          <p className="text-gray-500 text-sm max-w-xs">{state.message}</p>
          <p className="text-gray-400 text-xs max-w-xs">
            On iPhone: Settings → Safari → Location → Allow While Using App
          </p>
        </>
      ) : (
        <>
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800">Location unavailable</h2>
          <p className="text-gray-500 text-sm max-w-xs">{state.message}</p>
          <button
            onClick={retry}
            className="mt-2 px-6 py-3 bg-tfnsw-blue text-white rounded-full font-semibold text-sm active:scale-95 transition-transform"
          >
            Try again
          </button>
        </>
      )}
    </div>
  )
}
