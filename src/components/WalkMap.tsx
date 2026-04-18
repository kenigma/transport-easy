'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useJsApiLoader, GoogleMap, Marker, Circle } from '@react-google-maps/api'
import { haversineKm } from '@/lib/tfnsw/vehiclePositions'

interface Props {
  stopLat: number
  stopLng: number
  stopName: string
  userLat: number
  userLng: number
  onClose: () => void
}

export function WalkMap({ stopLat, stopLng, stopName, userLat, userLng, onClose }: Props) {
  const mapRef = useRef<google.maps.Map | null>(null)
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  })

  const walkMins = Math.round(haversineKm(userLat, userLng, stopLat, stopLng) * 12)

  const fitBounds = useCallback(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: stopLat, lng: stopLng })
    bounds.extend({ lat: userLat, lng: userLng })
    map.fitBounds(bounds, 60)
  }, [stopLat, stopLng, userLat, userLng, isLoaded])

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    fitBounds()

    // Draw walking route
    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: '#4285F4', strokeWeight: 4, strokeOpacity: 0.8 },
    })
    renderer.setMap(map)
    directionsRendererRef.current = renderer

    const service = new google.maps.DirectionsService()
    service.route(
      {
        origin: { lat: userLat, lng: userLng },
        destination: { lat: stopLat, lng: stopLng },
        travelMode: google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          renderer.setDirections(result)
        }
        // On failure, just show pins — no polyline
      }
    )
  }, [fitBounds, userLat, userLng, stopLat, stopLng])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Clean up renderer on unmount
  useEffect(() => {
    return () => { directionsRendererRef.current?.setMap(null) }
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full bg-white rounded-t-2xl overflow-hidden flex flex-col"
        style={{ height: '72vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100">
          <span className="text-xl">🚶</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">Walk to {stopName}</p>
            <p className="text-xs text-gray-500">~{walkMins} min walk</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl font-light p-1 leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Map */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80 text-sm text-gray-400">
              Loading map…
            </div>
          )}
          {isLoaded && (
            <GoogleMap
              mapContainerStyle={{ height: '100%', width: '100%' }}
              center={{ lat: (userLat + stopLat) / 2, lng: (userLng + stopLng) / 2 }}
              zoom={15}
              onLoad={handleMapLoad}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                zoomControlOptions: { position: 9 },
              }}
            >
              {/* Stop — blue pin */}
              <Marker
                position={{ lat: stopLat, lng: stopLng }}
                title={stopName}
                icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
              />

              {/* User — blue dot + accuracy circle */}
              <Circle
                center={{ lat: userLat, lng: userLng }}
                radius={8}
                options={{
                  fillColor: '#4285F4',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                  zIndex: 10,
                }}
              />
            </GoogleMap>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#4285F4] border-2 border-white shadow" />
              You
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#1a73e8]" />
              Stop
            </span>
          </div>
          <span>🚶 ~{walkMins} min</span>
        </div>
      </div>
    </div>
  )
}
