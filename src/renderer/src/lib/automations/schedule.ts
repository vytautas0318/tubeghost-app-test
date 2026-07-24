// Schedule due-computation. Interval-based (no raw cron) — see Schedule in
// shared/automations/types. `isDue` decides whether a scheduled automation
// should fire now given its last run. Kept pure + dependency-free so it's easy
// to reason about and test.

import type { Schedule } from '../../../../shared/automations/types'

// A schedule is "due" when the current local time is at/after its target time
// for the current period AND it hasn't already run this period. We approximate
// the period boundary by comparing lastRun against the most recent target time.
export function isDue(schedule: Schedule, lastRunAt: string | null, now = new Date()): boolean {
  const target = mostRecentTarget(schedule, now)
  if (now < target) return false // target time hasn't arrived yet this period
  if (!lastRunAt) return true // never run and target has passed → fire
  return new Date(lastRunAt) < target // last run predates this period's target
}

// The most recent time the schedule's target occurred at or before `now`.
function mostRecentTarget(schedule: Schedule, now: Date): Date {
  const t = new Date(now)
  if (schedule.kind === 'hourly') {
    t.setMinutes(0, 0, 0)
    return t
  }
  // daily / weekly: today (or the target weekday) at the given hour.
  t.setHours(clampHour(schedule.hour), 0, 0, 0)
  if (schedule.kind === 'daily') {
    if (t > now) t.setDate(t.getDate() - 1) // target hour later today → use yesterday's
    return t
  }
  // weekly: step back to the target weekday.
  const wd = clampWeekday(schedule.weekday)
  let back = (now.getDay() - wd + 7) % 7
  if (back === 0 && t > now) back = 7 // today is the day but the hour hasn't hit → last week
  t.setDate(t.getDate() - back)
  return t
}

const clampHour = (h: number): number => (Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : 9)
const clampWeekday = (d: number): number => (Number.isFinite(d) ? Math.max(0, Math.min(6, d)) : 1)

export function describeSchedule(schedule: Schedule): string {
  const hh = String(clampHour(schedule.hour)).padStart(2, '0')
  if (schedule.kind === 'hourly') return 'Hourly'
  if (schedule.kind === 'daily') return `Daily ${hh}:00`
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return `Weekly ${days[clampWeekday(schedule.weekday)]} ${hh}:00`
}
