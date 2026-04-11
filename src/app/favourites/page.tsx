'use client'

import { useFavouriteTrips } from '@/hooks/useFavouriteTrips'
import { FavouriteTripsView } from '@/components/FavouriteTripsView'
import { LoadingSkeleton } from '@/components/LoadingSkeleton'
import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function FavouritesPage() {
  const { trips, remove, updateWalkTime } = useFavouriteTrips()
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/" className="text-2xl p-1 -ml-1" aria-label="Back">←</Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My trips</h1>
          <p className="text-sm text-gray-500">Your saved routes</p>
        </div>
      </div>

      {!mounted && <LoadingSkeleton count={2} />}

      {mounted && trips.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">★</p>
          <p className="text-sm">No saved trips yet.</p>
          <p className="text-xs mt-1 max-w-[200px] mx-auto">
            Tap the ☆ star on any departure on the home screen to save it here.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm text-tfnsw-blue font-medium">
            Go to home screen →
          </Link>
        </div>
      )}

      {mounted && trips.length > 0 && <FavouriteTripsView trips={trips} onRemove={remove} onUpdateWalkTime={updateWalkTime} />}
    </main>
  )
}
