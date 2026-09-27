import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

// A capped, secure crash-point sample; multiplier movement stays deterministic once a round starts.
export function sampleCrashPoint() {
  if (secureRandomInt(100) < 2) return 1;
  const sample = (secureRandomInt(1_000_000) + 1) / 1_000_001;
  return roundCredits(Math.min(100, Math.max(1.01, 0.98 / (1 - sample))));
}

export function crashMultiplier(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  return roundCredits(Math.exp(elapsed / 11000));
}

export function crashPayout(stake, multiplier) {
  return roundCredits(stake * multiplier);
}
