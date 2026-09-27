import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

export const CROSS_STEPS = 10;
export const CROSS_DIFFICULTIES = Object.freeze({
  easy: { label: 'Easy', survival: 90, maxMultiplier: 1.4 },
  medium: { label: 'Medium', survival: 75, maxMultiplier: 2.8 },
  hard: { label: 'Hard', survival: 60, maxMultiplier: 4.8 },
  expert: { label: 'Expert', survival: 40, maxMultiplier: 8 },
});
export const crossSurvivalChance = (difficulty = 'easy', steps = 0) => Math.max(10, CROSS_DIFFICULTIES[difficulty].survival - Math.min(steps, CROSS_STEPS - 1) * 2.5);
export const crossSurvives = (difficulty = 'easy', steps = 0) => secureRandomInt(10000) < crossSurvivalChance(difficulty, steps) * 100;
export const crossMultiplier = (difficulty, steps) => {
  if (steps === undefined) { steps = difficulty; difficulty = 'expert'; }
  if (!steps) return 1;
  const { maxMultiplier } = CROSS_DIFFICULTIES[difficulty];
  return roundCredits(1 + (maxMultiplier - 1) * (Math.min(steps, CROSS_STEPS) / CROSS_STEPS));
};
export const crossCashout = (stake, steps, difficulty = 'expert') => roundCredits(stake * crossMultiplier(difficulty, steps));

