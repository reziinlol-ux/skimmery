import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

export const DOUBLE_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'red', label: '2× Red', multiplier: 2, color: '#f34b5b' }),
  Object.freeze({ key: 'black', label: '2× Black', multiplier: 2, color: '#303943' }),
  Object.freeze({ key: 'bait', label: '7× Bait', multiplier: 7, color: '#c8aa70' }),
  Object.freeze({ key: 'green', label: '14× Green', multiplier: 14, color: '#24bd78' }),
]);

const outcomeBands = Object.freeze([
  { outcome: DOUBLE_OUTCOMES[0], end: 4200 },
  { outcome: DOUBLE_OUTCOMES[1], end: 8400 },
  { outcome: DOUBLE_OUTCOMES[2], end: 9500 },
  { outcome: DOUBLE_OUTCOMES[3], end: 10000 },
]);

export function spinDouble() {
  const roll = secureRandomInt(10000);
  return outcomeBands.find((band) => roll < band.end).outcome;
}

export function doublePayout(stake, pick, outcome) {
  return pick === outcome.key ? roundCredits(stake * outcome.multiplier) : 0;
}
