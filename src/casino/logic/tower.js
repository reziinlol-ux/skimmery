import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

export const TOWER_FLOORS = 8;
export const TOWER_DIFFICULTIES = Object.freeze({
  easy: { label: 'Easy', bombs: 1, safe: 3, maxMultiplier: 1.8 },
  medium: { label: 'Medium', bombs: 2, safe: 2, maxMultiplier: 2.7 },
  hard: { label: 'Hard', bombs: 3, safe: 1, maxMultiplier: 3.8 },
});

export function towerMultiplier(difficulty, floorsCleared = 1) {
  const { maxMultiplier } = TOWER_DIFFICULTIES[difficulty];
  return maxMultiplier ** (Math.min(floorsCleared, TOWER_FLOORS) / TOWER_FLOORS);
}

export function createTower(difficulty) {
  const { bombs } = TOWER_DIFFICULTIES[difficulty];
  return Array.from({ length: TOWER_FLOORS }, () => {
    const bombTiles = new Set();
    while (bombTiles.size < bombs) bombTiles.add(secureRandomInt(4));
    return { bombTiles: [...bombTiles], picked: null, safe: null };
  });
}

export function revealTowerPick(floor, tile) {
  return { ...floor, picked: tile, safe: !floor.bombTiles.includes(tile) };
}

export function towerCashout(stake, clearedFloors, difficulty) {
  return roundCredits(stake * towerMultiplier(difficulty, clearedFloors));
}
