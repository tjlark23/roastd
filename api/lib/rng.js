// api/lib/rng.js
// Tiny seeded pseudo-random number generator used by the handwriting engine.
// Deterministic output for a given seed — same roast JSON produces the same image,
// which makes bugs reproducible and the output stable across retries.

export function makeRng(seed = 1) {
  let s = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  if (s === 0) s = 1;
  return () => {
    // Linear congruential generator — good enough for jitter, not for crypto.
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// FNV-1a 32-bit string hash — used to derive a numeric seed from a text field.
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
