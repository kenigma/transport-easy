'use client'

import { useState } from 'react'
import { LocationGate } from './LocationGate'
import { LocationSearch } from './LocationSearch'
import { NearbyDepartures } from './NearbyDepartures'
import { FavouriteTripsView } from './FavouriteTripsView'
import { TripPlanner } from './TripPlanner'
import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
import type { GeocodeResult } from '@/lib/types'

type ActiveTab = 'mytrips' | 'nearby' | 'plan'

function tabClass(active: boolean): string {
  return `flex-1 py-2 text-sm font-medium rounded-xl transition-colors ${
    active ? 'bg-tfnsw-blue text-white' : 'bg-gray-100 text-gray-600'
  }`
}

export function HomeContent() {
  const [manualLocation, setManualLocation] = useState<GeocodeResult | null>(null)
  const { trips } = useFavouriteTrips()
  const hasFavourites = trips.length > 0

  const [activeTab, setActiveTab] = useState<ActiveTab>(
    hasFavourites ? 'mytrips' : 'nearby'
  )

  return (
    <div className="space-y-4">
      <LocationGate>
        {(gpsCoords) => {
          const coords = manualLocation
            ? { lat: manualLocation.lat, lng: manualLocation.lng }
            : gpsCoords

          return (
            <>
              {/* Tab bar */}
              <div className="flex gap-2">
                {hasFavourites && (
                  <button
                    onClick={() => setActiveTab('mytrips')}
                    className={tabClass(activeTab === 'mytrips')}
                  >
                    ★ My trips
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('nearby')}
                  className={tabClass(activeTab === 'nearby')}
                >
                  📍 Nearby
                </button>
                <button
                  onClick={() => setActiveTab('plan')}
                  className={tabClass(activeTab === 'plan')}
                >
                  🗺️ Plan
                </button>
              </div>

              {/* My Trips */}
              {activeTab === 'mytrips' && hasFavourites && (
                <FavouriteTripsView trips={trips} />
              )}

              {/* Nearby */}
              {activeTab === 'nearby' && (
                <>
                  <LocationSearch
                    manualLocation={manualLocation}
                    onSelect={setManualLocation}
                    onUseGPS={() => setManualLocation(null)}
                  />
                  <NearbyDepartures lat={coords.lat} lng={coords.lng} />
                </>
              )}

              {/* Plan */}
              {activeTab === 'plan' && (
                <TripPlanner gpsCoords={coords} />
              )}
            </>
          )
        }}
      </LocationGate>
    </div>
  )
}
