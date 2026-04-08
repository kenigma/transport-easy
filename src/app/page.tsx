import { HomeContent } from '@/components/HomeContent'
import Link from 'next/link'

export default function Home() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transport Easy</h1>
          <p className="text-sm text-gray-500">Nearby departures</p>
        </div>
        <Link
          href="/favourites"
          className="text-2xl p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="Favourites"
        >
          ★
        </Link>
      </div>

      <HomeContent />
    </main>
  )
}
