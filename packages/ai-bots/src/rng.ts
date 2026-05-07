/**
 * Mulberry32 seedable PRNG. Produces a uniform [0, 1) stream that is
 * deterministic for a given 32-bit seed; suitable for reproducible
 * self-play and tests, not for cryptographic use.
 */
export function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
