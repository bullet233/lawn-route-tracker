// UnitField — number input + unit suffix (sq ft, days, mph, $) (DESIGN §3).
// Emits a Number (or null) to onChange, never a raw string.

export function UnitField({ label, value, onChange, unit, min, max, step = 'any', placeholder }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <span className="input-label">{label}</span>}
      <span className="unit-field">
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value
            onChange(v === '' ? null : Number(v))
          }}
        />
        {unit && <span className="unit-field__suffix">{unit}</span>}
      </span>
    </label>
  )
}
