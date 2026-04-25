const BASE_URL = 'https://api.transport.nsw.gov.au/v1'

// Per-call timeout. Vercel Hobby caps the whole function at 10 s, and we fan
// out up to 10 /tp/trip calls in parallel; without a per-call timeout, one
// hung TfNSW request can starve every other call in the batch.
const REQUEST_TIMEOUT_MS = 7_000

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

  const started = Date.now()
  let res: Response
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: `apikey ${apiKey}`,
        Accept: 'application/json',
      },
      // Don't cache at the fetch level — we handle caching ourselves
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const elapsed = Date.now() - started
    const reason = (err as Error)?.name === 'TimeoutError'
      ? `timeout after ${elapsed}ms`
      : (err as Error)?.message ?? String(err)
    throw new Error(`TfNSW ${path} ${reason}`)
  }

  if (!res.ok) {
    throw new Error(`TfNSW API error ${res.status} ${path}: ${await res.text()}`)
  }

  return res.json()
}
