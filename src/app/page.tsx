import { HomeContent } from '@/components/HomeContent'

export default function Home() {
  return (
    <main className="max-w-lg mx-auto px-4 pt-4 pb-20">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Transport Easy</h1>
      </div>

      <HomeContent />
    </main>
  )
}
