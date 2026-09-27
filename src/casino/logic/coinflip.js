import { secureRandomInt } from './random.js';
import { roundCredits } from './roulette.js';

export const COIN_PAYOUT = 1.9;
export const COINFLIP_RETURN = COIN_PAYOUT;
export const flipCoin = () => secureRandomInt(2) === 0 ? 'heads' : 'tails';

export function settleCoinFlip(prediction, outcome, stake) {
  const returned = prediction === outcome ? roundCredits(stake * COIN_PAYOUT) : 0;
  return { prediction, outcome, stake, returned, net: roundCredits(returned - stake), won: returned > 0 };
}
