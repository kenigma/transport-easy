# Architecture

## Overview

Transport Easy is a Next.js 14 PWA that shows real-time NSW public transport departures and trip planning. It acts as a thin, secure proxy between the browser and the TfNSW Open Data APIs — keeping API keys server-side and adding a caching layer to stay within rate limits.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · SWR · @ducanh2912/next-pwa

**APIs used:**
- [TfNSW Open Data](https://opendata.transport.nsw.gov.au/) — departures, trip planning, GTFS Realtime vehicle positions
- [Google Maps Platform](https://developers.google.com/maps) — Geocoding, Distance Matrix, Maps JavaScript API

---

## Data Flow

```
Browser
  │
  ├─ useNearbyDepartures (SWR, 20s refresh)
  ├─ useFavouriteTrips   (localStorage, no server)
  │
  ▼
Next.js API Routes  (/api/*)
  │  ├─ Validate NSW bounding box
  │  ├─ Check in-memory cache (cache.ts)
  │  └─ If miss → fetch TfNSW / Google APIs
  │
  ├──► TfNSW Open Data API  (TFNSW_API_KEY, server-only)
  │      /tp/coord, /tp/departure_mon, /tp/trip
  │      /gtfs/vehiclepos/{provider}  (GTFS-Realtime protobuf)
  │
  └──► Google Maps APIs  (GOOGLE_MAPS_API_KEY, server-only)
         Geocoding API, Distance Matrix API
```

The browser also loads the **Maps JavaScript API** directly using `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to render the live vehicle map overlay.

---

## API Routes

All routes validate that coordinates fall within NSW (`lat` −37.5 to −28.0, `lng` 140.9 to 154.0) and return `X-Cache: HIT` or `MISS` headers.

| Route | Purpose | Key params | Cache TTL |
|---|---|---|---|
| `GET /api/nearby` | Nearby stops + departures | `lat`, `lng`, `radius` | 15 s |
| `GET /api/departures` | Departures for a specific stop | `stopId`, `serviceId`, `destination` | 15 s |
| `GET /api/alerts` | Service disruption alerts | `stopIds` (comma-separated) | 60 s |
| `GET /api/trip` | Single trip plan (3–5 journeys) | `fromLat`, `fromLng`, `toLat`, `toLng` | 5 min |
| `GET /api/trip-options` | All route patterns (multi time-slot discovery) | `fromLat`, `fromLng`, `toLat`, `toLng` | 60 min |
| `GET /api/trip-timetable` | Full-day timetable for a route fingerprint | `fingerprint`, `fromLat/Lng`, `toLat/Lng`, `date` | 60 min |
| `GET /api/vehicle-location` | Live vehicle GPS positions | `mode`, `serviceId`, `stopLat`, `stopLng` | 10 s |
| `GET /api/geocode` | Address → coordinates (Google) | `q`, `lat`, `lng` (for proximity sort) | none |
| `GET /api/walktime` | Walk duration between two points (Google) | `fromLat`, `fromLng`, `toLat`, `toLng` | none |

---

## Caching Strategy

Two independent caching layers:

### Server-side (in-memory)
Implemented in `src/lib/cache.ts`. A `Map` stored at module level, shared across requests within the same serverless instance (but **not** across multiple Vercel instances).

| Data type | TTL | Reason |
|---|---|---|
| Nearby stops / departures | 15 s | TfNSW realtime updates every ~15 s |
| Vehicle positions | 10 s | GPS feed updates frequently |
| Service alerts | 60 s | Alerts change rarely |
| Trip options (route patterns) | 60 min | Route patterns don't change intraday |
| Trip timetable | 60 min | Timetable is static for the day |

### Client-side
- **SWR** — deduplicates concurrent requests and retains previous data between refreshes (no blank flash)
- **PWA Workbox** — caches `/_next/static/*` for 30 days. API routes use `NetworkOnly` (never serve stale departure data offline)

---

## State Management

| Concern | Mechanism |
|---|---|
| UI state (tabs, filters, open sheets) | React `useState` |
| Server data (departures, trips, alerts) | SWR hooks with auto-refresh |
| User preferences (favourite trips) | `localStorage` (`transport-easy:favourite-trips`) |
| User location | `useGeolocation` hook → passed down as props |

Favourites are per-device. There is no user authentication or shared state between devices.

---

## Key Design Decisions

### `/tp/coord` for nearby stop discovery
`/tp/departure_mon` with coord input is biased toward bus stops and misses train/metro stations. `/tp/coord` returns all stop types. The app tries `/tp/coord` first and falls back to `/tp/departure_mon` only if it returns nothing. See `src/lib/tfnsw/stopFinder.ts`.

### Walk-leg refinement
TfNSW's `/tp/trip` calculates walk legs from a generic street network and is inaccurate for specific street addresses. `fixFirstWalkLeg()` (`src/lib/walkfix.ts`) replaces the first walk leg's duration with the Google Maps Distance Matrix result, which uses the real footpath network.

### Client-side mode filtering
Filtering by transport mode (bus/train/metro/etc.) is done in the browser rather than as an API query parameter. This avoids a cache-key explosion — one cached result per location serves all mode filter states.

### Trip option discovery via time slots
The TfNSW `/tp/trip` endpoint returns journeys for one departure time, which can miss routes that only run at certain times of day. `/api/trip-options` queries five time slots (7 am, 10 am, 1 pm, 4 pm, 7 pm) and deduplicates by route fingerprint. It also runs supplemental queries from nearby mode-specific stops (e.g. a Metro-only station) to force route discovery for modes that `/tp/trip` sometimes omits for certain corridors.

### Journey fingerprint
`journeyFingerprint()` (`src/lib/tfnsw/trip.ts`) produces a stable string like `train:T4|bus:380` from a journey's transit legs. This is used as a cache key for timetables and as a stable identifier for route options — independent of the specific departure time.

### GTFS-Realtime vehicle positions
Vehicle positions are broadcast as Protocol Buffer (protobuf) binary, not JSON. The app decodes them with `gtfs-realtime-bindings`. Only modes that broadcast GTFS-R positions are supported (bus, metro, light rail, ferry, coach). Trains use EFA-based realtime embedded in `/tp/departure_mon` responses instead.

---

## Security

- `TFNSW_API_KEY` and `GOOGLE_MAPS_API_KEY` are **never sent to the browser**. All API calls go through Next.js API routes.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally public — required by the Maps JavaScript library. Restrict it in Google Cloud Console to your production domain.
- All API routes validate coordinate inputs against the NSW bounding box to prevent use as an open proxy.

---

## React Native Portability

`src/lib/` has zero Next.js or DOM imports. It can be copied unchanged into a React Native project. The swap points are:

| Web | React Native |
|---|---|
| `useGeolocation` (Browser Geolocation API) | `react-native-geolocation-service` |
| `useFavouriteTrips` (`localStorage`) | `AsyncStorage` |
| SWR data-fetching hooks | Same pattern with RN-compatible SWR |
| Vercel API routes | Same URLs — point RN app at the deployed Vercel endpoints |
