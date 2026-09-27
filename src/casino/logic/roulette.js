import { secureRandomInt } from './random.js';

export const WHEEL_ORDER = Object.freeze([0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]);
export const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export const HOUSE_EDGE = 1 / 37;
export const roundCredits = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
export const rouletteColor = (number) => number === 0 ? 'green' : RED_NUMBERS.has(number) ? 'red' : 'black';
export const spinRoulette = () => WHEEL_ORDER[secureRandomInt(WHEEL_ORDER.length)];
export function rouletteOutcomeDetails(number) {
  if (number === 0) return [
    { label: 'Green zero', className: 'green' },
    { label: 'No parity', className: '' },
    { label: 'No range', className: '' },
    { label: 'No dozen', className: '' },
    { label: 'No column', className: '' },
  ];
  const dozenStart = Math.floor((number - 1) / 12) * 12 + 1;
  const dozenEnd = dozenStart + 11;
  return [
    { label: rouletteColor(number) === 'red' ? 'Red' : 'Black', className: rouletteColor(number) },
    { label: number % 2 ? 'Odd' : 'Even', className: '' },
    { label: number <= 18 ? '1 to 18' : '19 to 36', className: '' },
    { label: `${dozenStart} to ${dozenEnd}`, className: '' },
    { label: `Column ${((number - 1) % 3) + 1}`, className: '' },
  ];
}

export const rouletteGroups = Object.freeze([
  { key: 'red', label: 'Red', type: 'color', value: 'red', count: 18 },
  { key: 'black', label: 'Black', type: 'color', value: 'black', count: 18 },
  { key: 'even', label: 'Even', type: 'parity', value: 'even', count: 18 },
  { key: 'odd', label: 'Odd', type: 'parity', value: 'odd', count: 18 },
  { key: 'low', label: '1–18', type: 'range', value: 'low', count: 18 },
  { key: 'high', label: '19–36', type: 'range', value: 'high', count: 18 },
  { key: 'dozen-1', label: '1st dozen', type: 'dozen', value: 1, count: 12 },
  { key: 'dozen-2', label: '2nd dozen', type: 'dozen', value: 2, count: 12 },
  { key: 'dozen-3', label: '3rd dozen', type: 'dozen', value: 3, count: 12 },
  { key: 'column-1', label: 'Column 1', type: 'column', value: 1, count: 12 },
  { key: 'column-2', label: 'Column 2', type: 'column', value: 2, count: 12 },
  { key: 'column-3', label: 'Column 3', type: 'column', value: 3, count: 12 },
]);

export function betWins(bet, number) {
  if (bet.type === 'number') return number === bet.value;
  if (number === 0) return false;
  if (bet.type === 'color') return rouletteColor(number) === bet.value;
  if (bet.type === 'parity') return bet.value === 'even' ? number % 2 === 0 : number % 2 === 1;
  if (bet.type === 'range') return bet.value === 'low' ? number <= 18 : number >= 19;
  if (bet.type === 'dozen') return Math.ceil(number / 12) === bet.value;
  if (bet.type === 'column') return ((number - 1) % 3) + 1 === bet.value;
  return false;
}

export function netOddsForBet(bet) {
  if (bet.type === 'number') return 35;
  if (bet.type === 'dozen' || bet.type === 'column') return 2;
  return 1;
}

export function settleRoulette(bets, number) {
  const stake = roundCredits(bets.reduce((total, bet) => total + bet.amount, 0));
  const winningBets = bets.filter((bet) => betWins(bet, number));
  const returned = roundCredits(winningBets.reduce((total, bet) => total + (bet.amount * (1 + netOddsForBet(bet))), 0));
  return {
    number,
    color: rouletteColor(number),
    stake,
    returned,
    net: roundCredits(returned - stake),
    winningKeys: winningBets.map((bet) => bet.key),
  };
}
