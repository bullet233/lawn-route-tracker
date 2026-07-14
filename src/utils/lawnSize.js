// Parse v1's FREE-TEXT lawn sizes into structured square feet, ONCE, at import
// (SPEC §12). v2 stores lawnSqFt structured and never parses free text again.
//
// The v1 bug this fixes: v1 matched the substring 'ac' anywhere, so a note like
// "back" or "vacant" parsed as acres. Here an acre unit must be a whole word
// token ('ac', 'acre', 'acres'), never a substring inside another word.
//
// Returns { sqFt: number|null, source: 'measured'|'manual', needsReview: bool,
//           raw }. needsReview=true when there's text we couldn't confidently
// parse — SPEC §3 "no silent fallbacks": flag, never zero.

const SQFT_PER_ACRE = 43_560

export function parseLawnSize(raw) {
  const result = { sqFt: null, source: 'manual', needsReview: false, raw }
  if (raw == null) return result

  if (typeof raw === 'number') {
    result.sqFt = raw > 0 ? Math.round(raw) : null
    result.needsReview = raw <= 0
    return result
  }

  const text = String(raw).trim().toLowerCase()
  if (text === '') return result

  // Pull the first number (supports "12,500", "1.5", ".25").
  const numMatch = text.match(/\d[\d,]*(\.\d+)?|\.\d+/)
  if (!numMatch) {
    // Non-numeric free text ("back", "large") — cannot parse. Flag it.
    result.needsReview = true
    return result
  }
  const value = parseFloat(numMatch[0].replace(/,/g, ''))
  if (!(value > 0)) {
    result.needsReview = true
    return result
  }

  // Acre unit only as a standalone word token — the "ac" bug fix.
  const hasAcreUnit = /\b(ac|acre|acres)\b/.test(text)

  if (hasAcreUnit) {
    result.sqFt = Math.round(value * SQFT_PER_ACRE)
  } else if (/\d[\d,]*\s*k\b/.test(text)) {
    result.sqFt = Math.round(value * 1000)
  } else {
    // Bare number: assume square feet (v1's dominant convention).
    result.sqFt = Math.round(value)
    // If it's implausibly small for sqft (<50) it may have meant acres/typo.
    if (result.sqFt < 50) result.needsReview = true
  }

  // Any trailing words we didn't consume beyond the number+unit → review.
  const leftover = text
    .replace(numMatch[0], ' ')
    .replace(/\b(ac|acre|acres|sq\.?\s?ft|sqft|square\s?feet|ft2|ft\^2|k)\b/g, ' ')
    .replace(/[^a-z]/g, ' ')
    .trim()
  if (leftover.length > 0) result.needsReview = true

  return result
}
