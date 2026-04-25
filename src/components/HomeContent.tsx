'use client'

import { useState } from 'react'
import { LocationGate } from './LocationGate'
import { LocationSearch } from './LocationSearch'
import { NearbyDepartures } from './NearbyDepartures'
import { FavouriteTripsView } from './FavouriteTripsView'
import { TripPlanner } from './TripPlanner'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
import { haversineKm } from '@/lib/tfnsw/vehiclePositions'
import type { GeocodeResult } from '@/lib/types'

type ActiveTab = 'home' | 'plan'

const NEARBY_THRESHOLD_KM = 0.5

function tabClass(active: boolean): string {
  return `flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
    active ? 'bg-tfnsw-blue text-white' : 'bg-gray-100 text-gray-600'
  }`
}

export function HomeContent() {
  const [manualLocation, setManualLocation] = useState<GeocodeResult | null>(null)
  const { trips, remove } = useFavouriteTrips()

  const [activeTab, setActiveTab] = useState<ActiveTab>('home')

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('home')}
          className={tabClass(activeTab === 'home')}
        >
          🏠 Home
        </button>
        <button
          onClick={() => setActiveTab('plan')}
          className={tabClass(activeTab === 'plan')}
        >
          🗺️ Plan
        </button>
      </div>

      {/* Home tab */}
      {activeTab === 'home' && (
        <LocationGate>
          {(gpsCoords) => {
            const coords = manualLocation
              ? { lat: manualLocation.lat, lng: manualLocation.lng }
              : gpsCoords

            // A trip is "nearby" if EITHER endpoint is within walking range —
            // the GPS-aware FavouriteTripCard will auto-orient with the closer
            // one as the source, so both directions need to surface here.
            const isNearby = (t: typeof trips[number]) => {
              const closest = Math.min(
                t.endpointA.lat && t.endpointA.lng
                  ? haversineKm(coords.lat, coords.lng, t.endpointA.lat, t.endpointA.lng)
                  : Infinity,
                t.endpointB?.lat && t.endpointB?.lng
                  ? haversineKm(coords.lat, coords.lng, t.endpointB.lat, t.endpointB.lng)
                  : Infinity
              )
              return closest < NEARBY_THRESHOLD_KM
            }
            const nearbyTrips = trips.filter(isNearby)
            const otherTrips = trips.filter((t) => !isNearby(t))

            return (
              <div className="space-y-5">
                {/* Your trips — nearby saved trips */}
                {nearbyTrips.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Your trips</p>
                    <FavouriteTripsView trips={nearbyTrips} onRemove={remove} />
                  </div>
                )}

                {/* Other saved trips — not nearby */}
                {otherTrips.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Other saved trips</p>
                    <FavouriteTripsView trips={otherTrips} onRemove={remove} />
                  </div>
                )}

                {/* Nearby stops */}
                <div>
                  {trips.length > 0 && (
                    <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Nearby stops</p>
                  )}
                  <LocationSearch
                    manualLocation={manualLocation}
                    onSelect={setManualLocation}
                    onUseGPS={() => setManualLocation(null)}
                  />
                  <NearbyDepartures lat={coords.lat} lng={coords.lng} />
                </div>
              </div>
            )
          }}
        </LocationGate>
      )}

      {/* Plan tab */}
      {activeTab === 'plan' && (
        <LocationGate>
          {(gpsCoords) => {
            const coords = manualLocation
              ? { lat: manualLocation.lat, lng: manualLocation.lng }
              : gpsCoords
            return <TripPlanner gpsCoords={coords} />
          }}
        </LocationGate>
      )}
    </div>
  )
}
