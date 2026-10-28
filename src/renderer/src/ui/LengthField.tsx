/**
 * A length you can read and type in the chosen system (metric or imperial). Shows
 * "1.83 m" or "6′ 0″"; takes "6'", "6 ft 2", "74in", "1.8 m", "180cm" or a bare number.
 * Commits on Enter or when you leave the field, so a change is one undo step.
 */
import { useEffect, useState } from 'react'
import { formatLength, parseLength, type LengthKind } from '../model/units'
import { useUnits } from '../state/prefs'

export function LengthField({
  label,
  value,
  onCommit,
  kind = 'length',
  min = -Infinity,
  max = Infinity,
  title,
  disabled
}: {
  label: string
  /** Metres; null when several things with different values are selected. */
  value: number | null
  onCommit: (metres: number) => void
  kind?: LengthKind
  min?: number
  max?: number
  title?: string
  disabled?: boolean
}) {
  const units = useUnits()
  const shown = value === null ? '' : formatLength(value, kind, units)
  const [draft, setDraft] = useState(shown)
  useEffect(() => setDraft(shown), [shown])
  const commit = () => {
    if (draft === shown) return
    const m = parseLength(draft, kind, units)
    if (m === null) return setDraft(shown)
    onCommit(Math.max(min, Math.min(max, m)))
  }
  return (
    <label className="field" title={title ?? (units === 'imperial' ? 'Type feet and inches (6\' 2"), or metres (1.9 m)' : 'Type metres (1.9), centimetres (190 cm), or feet and inches (6\' 2")')}>
      <span className="label">{label}</span>
      <input
        className="length-input"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={value === null ? 'Mixed' : ''}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(shown)
        }}
      />
    </label>
  )
}
