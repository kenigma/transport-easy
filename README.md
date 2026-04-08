# Transport Easy

Real-time NSW public transport departures for your family. Open the app, see nearby stops, and know if you need to rush.

## Features

- GPS-based nearby stop detection
- Live departure countdowns (red = run, orange = hurry, green = relax)
- Covers buses, trains, metro, ferries, light rail, and coaches
- Auto-refreshes every 20 seconds
- Service alert banners
- Mode filter (All / Bus / Train / Metro / Ferry / Light Rail)
- Favourite trips — save a transit leg with walk-time estimation; shows "Run!", "Leave in X min", or "Relax" based on your actual walk time
- Trip Planner — enter an origin and destination (address or suburb), get journey options with legs, times, and platform info
- Live vehicle map — see real-time GPS positions of buses, metro, ferry, and light rail
- PWA — installable on iPhone home screen
- API keys stay server-side (never exposed to the browser)

## Setup

### 1. Get a TfNSW API key (free)

1. Register at https://opendata.transport.nsw.gov.au/
2. Sign in → click your name → **My Applications** → **Add Application**
3. Subscribe to: **Trip Planner APIs** and **GTFS Realtime**
4. Copy your API key

### 2. Get a Google Maps API key

1. Go to https://console.cloud.google.com/ and create a project
2. Enable these three APIs:
   - **Geocoding API** — resolves addresses/suburbs to coordinates
   - **Distance Matrix API** — calculates walking time to stops
   - **Maps JavaScript API** — renders the live vehicle map in the browser
3. Create an API key under **Credentials**

### 3. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local and fill in your keys
```

```bash
# .env.local
TFNSW_API_KEY=your_tfnsw_key

# Used server-side for Geocoding API and Distance Matrix API
GOOGLE_MAPS_API_KEY=your_google_key

# Used client-side for the Maps JavaScript API (safe to be public)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_key
```

> Note: `TFNSW_API_KEY` and `GOOGLE_MAPS_API_KEY` are server-only and never sent to the browser. `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally public — it's required by the Google Maps JavaScript library running in the browser.

### 4. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### 5. Install on iPhone

1. Open the app in Safari
2. Tap the Share button → **Add to Home Screen**
3. The app launches in full-screen mode with no Safari chrome

## Deploy to Vercel (free)

1. Push your code to GitHub
2. Import the repo at https://vercel.com
3. Add all three environment variables in Vercel's **Settings → Environment Variables**:
   - `TFNSW_API_KEY`
   - `GOOGLE_MAPS_API_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
4. Deploy

## Testing

```bash
npm test          # run once
npm run test:watch  # watch mode
```

Integration tests (e.g. `metro-discovery.test.ts`, `vehicle-location.test.ts`) make live calls to the TfNSW API and require `TFNSW_API_KEY` to be set. Unit tests run without any keys.

## Project Structure

```
src/
  app/
    api/          # Next.js API routes (server-side — all TfNSW/Google calls go through here)
    page.tsx      # Home: Nearby / My Trips / Plan tabs
    layout.tsx    # Root layout with PWA metadata
  components/     # React UI components ('use client')
  hooks/          # Client-side React hooks (SWR, geolocation, favourites)
  lib/
    tfnsw/        # TfNSW API clients (portable — no Next.js/DOM imports)
    cache.ts      # In-memory server-side cache
    time.ts       # Time utilities and urgency logic
    ors.ts        # Google Maps Distance Matrix wrapper (walk time)
    walkfix.ts    # Replaces TfNSW walk estimates with Google Maps durations
    types.ts      # Shared TypeScript types
```

## Future: React Native iOS app

The `src/lib/` directory has zero framework dependencies and compiles unchanged in React Native. When building the iOS app:

- Keep `src/lib/tfnsw/` as-is
- Swap `useGeolocation` → `react-native-geolocation-service`
- Swap `useFavouriteTrips` localStorage → AsyncStorage
- Point the React Native app at the same Vercel `/api/*` endpoints
