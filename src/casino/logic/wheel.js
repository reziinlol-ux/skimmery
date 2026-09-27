import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

export const WHEEL_RISKS = Object.freeze({
  low: { label: 'Low', multipliers: [1.1, 1.2, 1.4, 2], counts: [11, 6, 2, 1], misses: 5 },
  medium: { label: 'Medium', multipliers: [1.2, 1.5, 2.2, 4], counts: [9, 3, 2, 1], misses: 10 },
  high: { label: 'High', multipliers: [1.5, 2, 3, 6], counts: [6, 3, 1, 1], misses: 14 },
  risky: { label: 'Risky', multipliers: [2, 3, 4, 15], counts: [1, 1, 1, 1], misses: 21 },
});

export const WHEEL_COLORS = Object.freeze(['#ffc33d', '#39df5d', '#00b8ee', '#ec7750']);
export const WHEEL_SEGMENT_COUNT = 25;

export function wheelSegments(risk = 'low') {
  const { multipliers, counts, misses } = WHEEL_RISKS[risk] || WHEEL_RISKS.low;
  const ordered = Array.from({ length: misses }, () => ({ multiplier: null, color: '#484b55' }));
  multipliers.forEach((multiplier, index) => {
    for (let count = 0; count < counts[index]; count += 1) {
      ordered.push({ multiplier, color: WHEEL_COLORS[index] });
    }
  });
  const distributed = Array(WHEEL_SEGMENT_COUNT);
  ordered.forEach((segment, index) => { distributed[(index * 7) % WHEEL_SEGMENT_COUNT] = segment; });
  return distributed;
}

export const WHEEL_MAX_WINS = 8;
export const wheelExtraLossChance = (wins = 0) => Math.min(.7, Math.max(0, wins) * .08);
export function spinWheel(risk = 'low', wins = 0) {
  const segments = wheelSegments(risk);
  const misses = segments.map((segment, index) => segment.multiplier === null ? index : -1).filter((index) => index >= 0);
  const index = secureRandomInt(10000) < wheelExtraLossChance(wins) * 10000 ? misses[secureRandomInt(misses.length)] : secureRandomInt(segments.length);
  return { index, ...segments[index] };
}

export function multiplyWheelMultiplier(currentMultiplier, landedMultiplier) {
  return roundCredits(currentMultiplier * landedMultiplier);
}

export function wheelCashout(stake, multiplier) {
  return roundCredits(stake * multiplier);
}

export function formatWheelMultiplier(value) {
  return `${Number(Number(value).toFixed(2))}×`;
}
