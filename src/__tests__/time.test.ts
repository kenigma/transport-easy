/**
 * Unit tests for src/lib/time.ts
 *
 * All functions are pure (or depend only on Date.now), so these tests run
 * without any API keys or network access.
 *
 * Timezone note: formatClockTime and getSydneyItdParams output Sydney local
 * time. These tests use known UTC timestamps:
 *   - 2026-04-10 is after NSW DST end (5 Apr 2026), so Sydney = UTC+10 (AEST).
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  minutesUntil,
  urgencyLevel,
  formatCountdown,
  isReachable,
  urgencyWithWalk,
  humanMessage,
  effectiveTime,
  formatClockTime,
  getSydneyItdParams,
} from '@/lib/time'

// ── minutesUntil ──────────────────────────────────────────────────────────────

describe('minutesUntil', () => {
  afterEach(() => vi.useRealTimers())

  it('returns positive minutes for a future time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    expect(minutesUntil('2026-04-10T00:05:00.000Z')).toBe(5)
  })

  it('floors partial minutes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    expect(minutesUntil('2026-04-10T00:01:59.000Z')).toBe(1)
  })

  it('returns 0 for less than 1 minute ahead', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    expect(minutesUntil('2026-04-10T00:00:30.000Z')).toBe(0)
  })

  it('returns negative minutes for a past time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-10T00:00:00.000Z'))
    expect(minutesUntil('2026-04-09T23:55:00.000Z')).toBe(-5)
  })
})

// ── urgencyLevel ──────────────────────────────────────────────────────────────

describe('urgencyLevel', () => {
  it('returns departed for negative minutes', () => {
    expect(urgencyLevel(-1)).toBe('departed')
    expect(urgencyLevel(-100)).toBe('departed')
  })

  it('returns urgent for 0, 1, and 2 minutes', () => {
    expect(urgencyLevel(0)).toBe('urgent')
    expect(urgencyLevel(1)).toBe('urgent')
    expect(urgencyLevel(2)).toBe('urgent')
  })

  it('returns soon for 3–7 minutes', () => {
    expect(urgencyLevel(3)).toBe('soon')
    expect(urgencyLevel(5)).toBe('soon')
    expect(urgencyLevel(7)).toBe('soon')
  })

  it('returns ok for 8+ minutes', () => {
    expect(urgencyLevel(8)).toBe('ok')
    expect(urgencyLevel(60)).toBe('ok')
  })
})

// ── formatCountdown ───────────────────────────────────────────────────────────

describe('formatCountdown', () => {
  it('returns Departed for negative minutes', () => {
    expect(formatCountdown(-1)).toBe('Departed')
    expect(formatCountdown(-100)).toBe('Departed')
  })

  it('returns Now for 0 minutes', () => {
    expect(formatCountdown(0)).toBe('Now')
  })

  it('returns X min for positive minutes', () => {
    expect(formatCountdown(1)).toBe('1 min')
    expect(formatCountdown(15)).toBe('15 min')
    expect(formatCountdown(90)).toBe('90 min')
  })
})

// ── isReachable ───────────────────────────────────────────────────────────────

describe('isReachable', () => {
  it('is always reachable with no walk time', () => {
    expect(isReachable(0, 0)).toBe(true)
    expect(isReachable(5, 0)).toBe(true)
  })

  it('allows a 2-minute run buffer below walk time', () => {
    expect(isReachable(8, 10)).toBe(true)   // 8 >= 10 - 2
    expect(isReachable(7, 10)).toBe(false)  // 7 < 10 - 2
  })

  it('is not reachable when departure is well past', () => {
    expect(isReachable(0, 5)).toBe(false)
    expect(isReachable(5, 10)).toBe(false)
  })

  it('is reachable at exactly the walk time', () => {
    expect(isReachable(10, 10)).toBe(true)
  })
})

// ── urgencyWithWalk ───────────────────────────────────────────────────────────

describe('urgencyWithWalk', () => {
  it('returns urgent when departure is before walk time (negative margin)', () => {
    expect(urgencyWithWalk(5, 10)).toBe('urgent')
    expect(urgencyWithWalk(0, 5)).toBe('urgent')
  })

  it('returns soon for margin 0–4 minutes', () => {
    expect(urgencyWithWalk(10, 10)).toBe('soon')  // margin = 0
    expect(urgencyWithWalk(14, 10)).toBe('soon')  // margin = 4
  })

  it('returns ok for margin 5+ minutes', () => {
    expect(urgencyWithWalk(15, 10)).toBe('ok')    // margin = 5
    expect(urgencyWithWalk(30, 5)).toBe('ok')     // margin = 25
  })
})

// ── humanMessage ──────────────────────────────────────────────────────────────

describe('humanMessage', () => {
  it('delegates to formatCountdown when walk time is 0', () => {
    expect(humanMessage(5, 0)).toBe('5 min')
    expect(humanMessage(0, 0)).toBe('Now')
    expect(humanMessage(-1, 0)).toBe('Departed')
  })

  it('returns Run! when departure is before walk time', () => {
    expect(humanMessage(5, 10)).toBe('Run!')
    expect(humanMessage(0, 5)).toBe('Run!')
  })

  it('returns Head out now! when margin is exactly 0', () => {
    expect(humanMessage(10, 10)).toBe('Head out now!')
  })

  it('returns Leave in X min when margin is 1–4', () => {
    expect(humanMessage(11, 10)).toBe('Leave in 1 min')
    expect(humanMessage(14, 10)).toBe('Leave in 4 min')
  })

  it('returns Relax when margin is 5+', () => {
    expect(humanMessage(15, 10)).toBe('Relax, take your time')
    expect(humanMessage(30, 5)).toBe('Relax, take your time')
  })
})

// ── effectiveTime ─────────────────────────────────────────────────────────────

describe('effectiveTime', () => {
  it('returns estimated time when available', () => {
    expect(effectiveTime({
      estimatedDepartureTime: '2026-04-10T08:05:00+10:00',
      scheduledDepartureTime: '2026-04-10T08:00:00+10:00',
    })).toBe('2026-04-10T08:05:00+10:00')
  })

  it('falls back to scheduled time when estimated is null', () => {
    expect(effectiveTime({
      estimatedDepartureTime: null,
      scheduledDepartureTime: '2026-04-10T08:00:00+10:00',
    })).toBe('2026-04-10T08:00:00+10:00')
  })
})

// ── formatClockTime ───────────────────────────────────────────────────────────
// Reference: 2026-04-10 is AEST (UTC+10) — DST ended 5 Apr 2026.

describe('formatClockTime', () => {
  it('converts UTC midnight to 10:00 am Sydney time', () => {
    // 2026-04-10T00:00:00Z = 2026-04-10T10:00:00+10:00
    expect(formatClockTime('2026-04-10T00:00:00.000Z')).toBe('10:00 am')
  })

  it('formats midday correctly', () => {
    // 2026-04-10T02:30:00Z = 2026-04-10T12:30:00+10:00
    expect(formatClockTime('2026-04-10T02:30:00.000Z')).toBe('12:30 pm')
  })

  it('formats late evening correctly', () => {
    // 2026-04-10T13:00:00Z = 2026-04-10T23:00:00+10:00
    expect(formatClockTime('2026-04-10T13:00:00.000Z')).toBe('11:00 pm')
  })

  it('formats early morning correctly', () => {
    // 2026-04-09T19:05:00Z = 2026-04-10T05:05:00+10:00
    expect(formatClockTime('2026-04-09T19:05:00.000Z')).toBe('5:05 am')
  })
})

// ── getSydneyItdParams ────────────────────────────────────────────────────────

describe('getSydneyItdParams', () => {
  it('formats date and time in Sydney local time', () => {
    // 2026-04-10T00:00:00Z = 2026-04-10 10:00 AEST
    const { itdDate, itdTime } = getSydneyItdParams(new Date('2026-04-10T00:00:00.000Z'))
    expect(itdDate).toBe('20260410')
    expect(itdTime).toBe('1000')
  })

  it('handles late night close to midnight', () => {
    // 2026-04-10T13:30:00Z = 2026-04-10 23:30 AEST
    const { itdDate, itdTime } = getSydneyItdParams(new Date('2026-04-10T13:30:00.000Z'))
    expect(itdDate).toBe('20260410')
    expect(itdTime).toBe('2330')
  })

  it('rolls over to the next calendar day at Sydney midnight', () => {
    // 2026-04-10T14:01:00Z = 2026-04-11 00:01 AEST
    const { itdDate, itdTime } = getSydneyItdParams(new Date('2026-04-10T14:01:00.000Z'))
    expect(itdDate).toBe('20260411')
    expect(itdTime).toBe('0001')
  })

  it('zero-pads single-digit hours and minutes', () => {
    // 2026-04-09T20:05:00Z = 2026-04-10 06:05 AEST
    const { itdDate, itdTime } = getSydneyItdParams(new Date('2026-04-09T20:05:00.000Z'))
    expect(itdDate).toBe('20260410')
    expect(itdTime).toBe('0605')
  })
})
