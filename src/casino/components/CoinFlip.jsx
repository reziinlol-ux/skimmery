import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Crown, Sparkles } from 'lucide-react';
import { Button } from './ui.jsx';
import { flipCoin, settleCoinFlip } from '../logic/coinflip.js';
import { casinoSound } from '../logic/sound.js';
import { GameModeHeader, AutoRollSettings } from './AutoRoll.jsx';
import { useAutoRoll } from '../useAutoRoll.js';

export function CoinFlip({ credits, locked, startRound, finishRound, active }) {
  const [side, setSide] = useState('heads');
  const [stakeText, setStakeText] = useState('10');
  const [flipping, setFlipping] = useState(false);
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const busy = useRef(false);
  const reduced = useReducedMotion();
  const auto = useAutoRoll({ credits, active });
  const stake = Number(stakeText), isLocked = locked || flipping;

  useEffect(() => { if (!active && !busy.current) { setSide('heads'); setRotation(0); rotationRef.current = 0; } }, [active, flipping]);

  const flip = async (autoBet = null) => {
    const bet = autoBet ?? stake;
    if (busy.current || isLocked || !Number.isFinite(bet) || bet < 10 || bet > credits) return;
    busy.current = true;
    const round = await startRound(bet, 'coin-flip', { side });
    if (!round) { busy.current = false; if (autoBet !== null) auto.stop(); return; }
    const outcome = round.demo ? flipCoin() : round.outcome, settlement = settleCoinFlip(side, outcome, bet);
    const desired = outcome === 'tails' ? 180 : 0;
    rotationRef.current += 360 * 7 + ((desired - rotationRef.current % 360 + 360) % 360);
    setFlipping(true); setRotation(rotationRef.current); casinoSound('spin');
    window.setTimeout(() => {
      setFlipping(false); busy.current = false; casinoSound(settlement.won ? 'win' : 'loss');
      finishRound({ game: 'coin-flip', summary: outcome, stake: bet, net: settlement.net, won: settlement.won, payout: settlement.returned, choice: side, outcome }, settlement.returned);
      auto.finish(settlement.net);
    }, reduced ? 30 : 1900);
  };
  const flipRef = useRef(flip);
  flipRef.current = flip;
  const startAuto = () => auto.start(stakeText, setStakeText, (amount) => flipRef.current(amount));

  return <div className="coinflip-game game-side-layout">
    <div className="game-controls side-control-panel coin-controls">
      <GameModeHeader label="COIN FLIP" mode={auto.mode} onChange={auto.setMode} disabled={isLocked || auto.running} />
      <label className="stake-field"><span>{auto.mode === 'auto' ? 'Bet amount' : 'Play amount'}</span><div className="stake-input-wrap"><input aria-label="Coin Flip bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={isLocked || auto.running} /><span>CR</span></div></label>
      {auto.mode === 'auto' && <AutoRollSettings auto={auto} onStart={startAuto} disabled={auto.running} />}
      <div className="coin-side-picker" role="group" aria-label="Choose heads or tails">{['heads','tails'].map((pick) => <button key={pick} type="button" disabled={isLocked || auto.running} className={side === pick ? 'selected' : ''} onClick={() => { setSide(pick); const angle = pick === 'tails' ? 180 : 0; rotationRef.current += (angle - ((rotationRef.current % 360) + 360) % 360 + 360) % 360; setRotation(rotationRef.current); }} aria-pressed={side === pick}><span className={'coin-choice-icon ' + pick}>{pick === 'heads' ? <Crown size={19} /> : <Sparkles size={19} />}</span>{pick === 'heads' ? 'Heads' : 'Tails'}</button>)}</div>
      {auto.mode === 'manual' && <Button variant="primary" onClick={() => flip()} disabled={isLocked || !Number.isFinite(stake) || stake < 10 || stake > credits}>{flipping ? 'Flipping…' : 'Flip'}</Button>}
    </div>
    <div className="coin-scene game-scene-panel">
    <div className="coin-stage">
      <motion.div className="coin-shadow" animate={{ scale: flipping ? [.85,.55,.85] : 1, opacity: flipping ? [.25,.1,.25] : .25 }} transition={{ duration: reduced ? 0 : 1.8 }} />
      <motion.div className="coin-object" animate={{ rotateY: rotation, y: flipping && !reduced ? [0,-75,0] : 0 }} transition={{ duration: reduced ? 0 : 1.8, ease: [.2,.72,.25,1] }} role="img" aria-label="Heads and tails coin">
        <div className="coin-face coin-heads"><div className="coin-inner"><Crown strokeWidth={1.35} /><b>HEADS</b></div></div>
        <div className="coin-face coin-tails"><div className="coin-inner"><Sparkles strokeWidth={1.35} /><b>TAILS</b></div></div>
      </motion.div>
    </div>
    </div>
  </div>;
}

