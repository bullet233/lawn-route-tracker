// Stable id minting. crypto.randomUUID is available in every browser we target
// and in Node 19+ (tests). Kept in one place so a future swap is trivial.

export function newId() {
  return crypto.randomUUID()
}
