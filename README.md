# Transport Easy

Real-time NSW public transport departures for your family. Open the app, see nearby stops, and know if you need to rush.

## Features

- GPS-based nearby stop detection
- Live departure countdowns (red = run, orange = hurry, green = relax)
- Covers buses, trains, metro, ferries, and light rail
- Auto-refreshes every 20 seconds
- Service alert banners
- Favourite stops
- PWA — installable on iPhone home screen
- API key stays server-side (never exposed to the browser)

## Setup

### 1. Get a TfNSW API key (free)

1. Register at https://opendata.transport.nsw.gov.au/
2. Sign in → click your name → **My Applications** → **Add Application**
3. Subscribe to: **Trip Planner APIs** and **GTFS Realtime**
4. Copy your API key

### 2. Configure environment

```bash
cp .env.local.example .env.local
# Edit .env.local and paste your API key
```

### 3. Install and run

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### 4. Install on iPhone

1. Open the app in Safari
2. Tap the Share button → **Add to Home Screen**
3. The app launches in full-screen mode with no Safari chrome

## Deploy to Vercel (free)

```bash
npm install -g vercel
vercel
```

Set `TFNSW_API_KEY` in your Vercel project's Environment Variables.

## Project Structure

```
src/
  app/          # Next.js pages and API routes
  components/   # React UI components
  hooks/        # Client-side React hooks (SWR, geolocation, etc.)
  lib/          # Pure business logic — no Next.js/DOM imports (portable to React Native)
    tfnsw/      # TfNSW API clients
```

## Future: React Native iOS app

The `src/lib/` directory has zero framework dependencies and compiles unchanged in React Native. When building the iOS app:

- Keep `src/lib/tfnsw/` as-is
- Swap `useGeolocation` → `react-native-geolocation-service`
- Swap `useFavourites` localStorage → AsyncStorage
- Point the React Native app at the same Vercel `/api/*` endpoints
