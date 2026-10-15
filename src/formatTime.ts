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
