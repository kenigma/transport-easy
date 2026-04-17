export type UrgencyLevel = 'urgent' | 'soon' | 'ok' | 'departed'

/**
 * Returns minutes until the given ISO 8601 time string.
 * Returns negative numbers for times in the past.
 */
export function minutesUntil(isoTime: string): number {
  const diff = new Date(isoTime).getTime() - Date.now()
  return Math.floor(diff / 60_000)
}

/**
 * Urgency colour logic:
 * - departed / negative  → 'departed'
 * - < 3 min              → 'urgent'  (red — run!)
 * - 3–7 min              → 'soon'    (orange — hurry)
 * - > 7 min              → 'ok'      (green — relax)
 */
export function urgencyLevel(minutes: number): UrgencyLevel {
  if (minutes < 0) return 'departed'
  if (minutes < 3) return 'urgent'
  if (minutes <= 7) return 'soon'
  return 'ok'
}

/**
 * Short display string for a countdown: "Departed", "Now", or "X min".
 * Used in departure rows and urgency badges.
 */
export function formatCountdown(minutes: number): string {
  if (minutes < 0) return 'Departed'
  if (minutes === 0) return 'Now'
  return `${minutes} min`
}

/**
 * Walk-time-aware helpers — used only in My Trips view.
 * The nearby/explore view uses urgencyLevel() as before.
 */

/** True if the user can make this departure (with a 2-min run buffer). */
export function isReachable(mins: number, walkMinutes: number): boolean {
  return mins >= walkMinutes - 2
}

/** Urgency level adjusted for walk time. margin = mins until departure - walk time. */
export function urgencyWithWalk(mins: number, walkMinutes: number): UrgencyLevel {
  const margin = mins - walkMinutes
  if (margin < 0) return 'urgent'
  if (margin < 5) return 'soon'
  return 'ok'
}

/** Human-readable action message for the primary departure in My Trips. */
export function humanMessage(mins: number, walkMinutes: number): string {
  const margin = mins - walkMinutes
  if (margin < 0) return 'Run!'
  if (margin === 0) return 'Head out now!'
  if (margin < 5) return `Leave in ${margin} min`
  return 'Relax, take your time'
}

/**
 * Returns itdDate and itdTime in Sydney local time (AEDT/AEST).
 * The TfNSW API expects local NSW time for these parameters.
 */
export function getSydneyItdParams(now: Date): { itdDate: string; itdTime: string } {
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hour = get('hour').padStart(2, '0').replace('24', '00')
  return {
    itdDate: `${get('year')}${get('month')}${get('day')}`,
    itdTime: `${hour}${get('minute')}`,
  }
}

/**
 * Formats an ISO 8601 time string as a short Sydney local clock time, e.g. "8:32 am".
 */
export function formatClockTime(isoTime: string): string {
  return new Date(isoTime).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Returns the effective departure time for a departure:
 * estimated if available, otherwise scheduled.
 */
export function effectiveTime(departure: {
  estimatedDepartureTime: string | null
  scheduledDepartureTime: string
}): string {
  return departure.estimatedDepartureTime ?? departure.scheduledDepartureTime
}
