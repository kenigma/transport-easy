'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useJsApiLoader, GoogleMap, Marker, Circle } from '@react-google-maps/api'
import useSWR from 'swr'
import { useGeolocation } from '@/hooks/useGeolocation'
import type { TransportMode, VehicleLocationResponse } from '@/lib/types'

const MODE_EMOJI: Record<string, string> = {
  train: '🚆', metro: '🚇', bus: '🚌', ferry: '⛴️', lightrail: '🚊', coach: '🚍', unknown: '🚌',
}

async function fetchVehicles(url: string): Promise<VehicleLocationResponse> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch vehicle positions')
  return res.json()
}

export interface VehicleMapProps {
  stopLat: number
  stopLng: number
  stopName: string
  serviceId: string
  destination: string
  mode: TransportMode
  onClose: () => void
}

export function VehicleMap({
  stopLat, stopLng, stopName, serviceId, destination, mode, onClose,
}: VehicleMapProps) {
  const emoji = MODE_EMOJI[mode] ?? '🚌'
  const mapRef = useRef<google.maps.Map | null>(null)

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
  })

  const { state: geoState } = useGeolocation()
  const userCoords = geoState.status === 'granted' ? geoState.coords : null

  const url = `/api/vehicle-location?mode=${mode}&serviceId=${encodeURIComponent(serviceId)}&stopLat=${stopLat}&stopLng=${stopLng}`
  const { data, error, isLoading } = useSWR<VehicleLocationResponse>(url, fetchVehicles, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
  })
  const vehicles = data?.vehicles ?? []

  // Fit map bounds to show stop + vehicles + user location
  const fitBounds = useCallback(() => {
    const map = mapRef.current
    if (!map || !isLoaded) return
    const bounds = new google.maps.LatLngBounds()
    bounds.extend({ lat: stopLat, lng: stopLng })
    if (userCoords) bounds.extend({ lat: userCoords.lat, lng: userCoords.lng })
    vehicles.forEach((v) => bounds.extend({ lat: v.lat, lng: v.lng }))
    map.fitBounds(bounds, 60)
  }, [stopLat, stopLng, userCoords, vehicles, isLoaded])

  const handleMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    fitBounds()
  }, [fitBounds])

  // Re-fit when vehicles update
  useEffect(() => {
    if (vehicles.length > 0) fitBounds()
  }, [vehicles.length, fitBounds])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const showNoVehicles = isLoaded && !isLoading && !error && vehicles.length === 0

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end bg-black/40"
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
          <span className="text-xl">{emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {serviceId} → {destination}
            </p>
            <p className="text-xs text-gray-500 truncate">{stopName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 text-xl font-light p-1 leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Map area */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {/* Overlay states */}
          {(!isLoaded || (isLoading && vehicles.length === 0)) && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80 text-sm text-gray-400">
              Loading map…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/90 text-sm text-gray-400">
              Could not load vehicle positions
            </div>
          )}
          {showNoVehicles && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80 text-sm text-gray-400 text-center px-8">
              No live vehicle position available yet — check back shortly
            </div>
          )}

          {isLoaded && (
            <GoogleMap
              mapContainerStyle={{ height: '100%', width: '100%' }}
              center={{ lat: stopLat, lng: stopLng }}
              zoom={15}
              onLoad={handleMapLoad}
              options={{
                fullscreenControl: false,
                streetViewControl: false,
                mapTypeControl: false,
                zoomControlOptions: { position: 9 /* RIGHT_CENTER */ },
              }}
            >
              {/* Stop — blue pin */}
              <Marker
                position={{ lat: stopLat, lng: stopLng }}
                title={stopName}
                icon={{ url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }}
                label={{ text: 'Stop', color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
              />

              {/* Vehicles — red pins with route label */}
              {vehicles.map((v) => (
                <Marker
                  key={v.vehicleId}
                  position={{ lat: v.lat, lng: v.lng }}
                  title={`${serviceId}${v.vehicleLabel ? ' · ' + v.vehicleLabel : ''}`}
                  label={{ text: serviceId, color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                />
              ))}

              {/* User location — blue dot + accuracy circle */}
              {userCoords && (
                <>
                  <Circle
                    center={{ lat: userCoords.lat, lng: userCoords.lng }}
                    radius={8}
                    options={{
                      fillColor: '#4285F4',
                      fillOpacity: 1,
                      strokeColor: '#fff',
                      strokeWeight: 2,
                      zIndex: 10,
                    }}
                  />
                  {userCoords.accuracy > 20 && (
                    <Circle
                      center={{ lat: userCoords.lat, lng: userCoords.lng }}
                      radius={userCoords.accuracy}
                      options={{
                        fillColor: '#4285F4',
                        fillOpacity: 0.1,
                        strokeColor: '#4285F4',
                        strokeOpacity: 0.3,
                        strokeWeight: 1,
                      }}
                    />
                  )}
                </>
              )}
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
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#ea4335]" />
              Vehicle
            </span>
          </div>
          <span>Updates every 10s</span>
        </div>
      </div>
    </div>
  )
}
