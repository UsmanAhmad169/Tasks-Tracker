import { useState } from 'react'
import { formatMinutes, parseDurationToMinutes } from '../formatTime'

type DurationInputProps = {
  minutes: number
  onCommit: (minutes: number) => void
  className?: string
  id?: string
  'aria-label'?: string
  disabled?: boolean
}

/**
 * Text input for human durations ("2h", "1h 30m", "90"). Commits on blur or
 * Enter; invalid input reverts to the last saved value. Remount with a `key`
 * on `minutes` to pick up external changes.
 */
export default function DurationInput({
  minutes,
  onCommit,
  className,
  id,
  'aria-label': ariaLabel,
  disabled,
}: DurationInputProps) {
  const [draft, setDraft] = useState(() => formatMinutes(minutes))
  const [invalid, setInvalid] = useState(false)

  const commit = () => {
    const parsed = parseDurationToMinutes(draft)
    if (parsed == null) {
      setInvalid(true)
      setDraft(formatMinutes(minutes))
      return
    }
    setInvalid(false)
    setDraft(formatMinutes(parsed))
    if (parsed !== minutes) onCommit(parsed)
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="text"
      className={`duration-input${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      title={invalid ? 'Use a duration like 2h, 1h 30m or 90' : undefined}
      value={draft}
      disabled={disabled}
      onChange={(e) => {
        setDraft(e.target.value)
        setInvalid(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}
