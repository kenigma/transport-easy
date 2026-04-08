const BASE_URL = 'https://api.transport.nsw.gov.au/v1'

/**
 * Authenticated fetch wrapper for the TfNSW Open Data API.
 * Always runs server-side — never exposes the API key to the browser.
 *
 * Auth: `Authorization: apikey <key>` header.
 * Rate limits: 5 req/sec, 60,000 req/day.
 * Caching is handled by the caller (see src/lib/cache.ts) — this function
 * always fetches fresh with `cache: 'no-store'`.
 */
export async function tfnswFetch(
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const apiKey = process.env.TFNSW_API_KEY
  if (!apiKey) {
    throw new Error('TFNSW_API_KEY environment variable is not set')
  }

  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `apikey ${apiKey}`,
      Accept: 'application/json',
    },
    // Don't cache at the fetch level — we handle caching ourselves
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`TfNSW API error ${res.status}: ${await res.text()}`)
  }

  return res.json()
}
