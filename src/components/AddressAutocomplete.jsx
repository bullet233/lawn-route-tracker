// Address input with Google Places suggestions. Controlled like a plain input
// (value/onChange) plus an optional onSelect(description, placeId) fired when a
// suggestion is picked. Debounced; closes on blur/Escape; arrow-key navigable.
// If Places is unavailable it silently behaves as a normal text field.

import { useEffect, useRef, useState } from 'react'
import { fetchAddressSuggestions, newSessionToken } from '../maps/placesAutocomplete.js'

export function AddressAutocomplete({ value, onChange, onSelect, placeholder, autoFocus }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const disabledRef = useRef(false) // Places errored → stop trying, plain field
  const tokenRef = useRef(undefined)
  const timerRef = useRef(null)
  const boxRef = useRef(null)

  // close when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function query(text) {
    clearTimeout(timerRef.current)
    if (disabledRef.current || text.trim().length < 3) {
      setSuggestions([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      try {
        if (!tokenRef.current) tokenRef.current = await newSessionToken()
        const list = await fetchAddressSuggestions(text, tokenRef.current)
        setSuggestions(list)
        setActive(-1)
        setOpen(list.length > 0)
      } catch {
        disabledRef.current = true // e.g. Places not enabled — degrade quietly
        setSuggestions([])
        setOpen(false)
      }
    }, 250)
  }

  function handleChange(e) {
    const text = e.target.value
    onChange(text)
    query(text)
  }

  function choose(s) {
    onChange(s.description)
    onSelect?.(s.description, s.placeId)
    setOpen(false)
    setSuggestions([])
    tokenRef.current = undefined // a selection ends the billing session
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      choose(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="addr-ac" ref={boxRef}>
      <input
        className="input-field"
        value={value || ''}
        autoFocus={autoFocus}
        placeholder={placeholder}
        autoComplete="off"
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 && (
        <ul className="addr-ac__list" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.placeId || s.description}
              role="option"
              aria-selected={i === active}
              className={'addr-ac__item' + (i === active ? ' addr-ac__item--active' : '')}
              // mousedown (not click) so it fires before the input blur closes us
              onMouseDown={(e) => {
                e.preventDefault()
                choose(s)
              }}
              onMouseEnter={() => setActive(i)}
            >
              📍 {s.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
