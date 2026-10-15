/** Format whole minutes as "Xh Ym", "Xh", or "Ym". */
export function formatMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes))
  if (mins === 0) return '0m'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}

/** Format whole minutes as "2 hours", "2 hours 30 minutes", or "30 minutes". */
export function formatMinutesLong(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes))
  if (mins === 0) return '0 minutes'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const hourLabel = hours === 1 ? '1 hour' : `${hours} hours`
  const minuteLabel = minutes === 1 ? '1 minute' : `${minutes} minutes`
  if (hours > 0 && minutes > 0) return `${hourLabel} ${minuteLabel}`
  if (hours > 0) return hourLabel
  return minuteLabel
}

const HOUR_UNIT = /^(?:h|hr|hrs|hour|hours)$/i
const MINUTE_UNIT = /^(?:m|min|mins|minute|minutes)$/i

/**
 * Parse a human duration into whole minutes.
 * Accepts: "2 hours", "2h", "2 hours 30 minutes", "2h 30m", "2:30", "90m", "90".
 * Bare numbers are treated as minutes.
 * Returns null if the input is empty or invalid.
 */
export function parseDurationToMinutes(input: string): number | null {
  const raw = input.trim().toLowerCase()
  if (!raw) return null

  const colon = raw.match(/^(\d+)\s*:\s*(\d{1,2})$/)
  if (colon) {
    const hours = Number(colon[1])
    const minutes = Number(colon[2])
    if (minutes >= 60) return null
    const total = hours * 60 + minutes
    return total > 0 ? total : null
  }

  const bare = raw.match(/^(\d+(?:\.\d+)?)$/)
  if (bare) {
    const value = Number(bare[1])
    if (!Number.isFinite(value) || value <= 0) return null
    return Math.round(value)
  }

  const tokens = raw.match(
    /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)/g,
  )
  if (!tokens || tokens.length === 0) return null

  let total = 0
  let sawHours = false
  let sawMinutes = false

  for (const token of tokens) {
    const parts = token.match(
      /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)$/,
    )
    if (!parts) return null
    const value = Number(parts[1])
    const unit = parts[2]
    if (!Number.isFinite(value) || value < 0) return null

    if (HOUR_UNIT.test(unit)) {
      if (sawHours) return null
      sawHours = true
      total += value * 60
    } else if (MINUTE_UNIT.test(unit)) {
      if (sawMinutes) return null
      sawMinutes = true
      total += value
    } else {
      return null
    }
  }

  const rounded = Math.round(total)
  return rounded > 0 ? rounded : null
}
