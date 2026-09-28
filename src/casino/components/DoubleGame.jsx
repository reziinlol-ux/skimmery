import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './ui.jsx';
import { DOUBLE_OUTCOMES, doublePayout, spinDouble } from '../logic/double.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';
import { GameModeHeader, AutoRollSettings } from './AutoRoll.jsx';
import { useAutoRoll } from '../useAutoRoll.js';

const LANDING_SLOT = 24;
const TILE_STEP = 96;

export function DoubleGame({ credits, locked, startRound, finishRound, active }) {
  const [stakeText, setStakeText] = useState('10');
  const [pick, setPick] = useState('red');
  const [spinning, setSpinning] = useState(false);
  const [items, setItems] = useState(() => Array.from({ length: 29 }, spinDouble));
  const [offset, setOffset] = useState(0);
  const [spinId, setSpinId] = useState(0);
  const [stageWidth, setStageWidth] = useState(880);
  const [lastResult, setLastResult] = useState(null);
  const stageRef = useRef(null);
  const timerRef = useRef(null);
  const busy = useRef(false);
  const reduced = useReducedMotion();
  const auto = useAutoRoll({ credits, active });
  const stake = Number(stakeText);
  const isLocked = locked || spinning;

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setStageWidth(entry.contentRect.width));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const play = async (autoBet = null) => {
    const bet = autoBet ?? stake;
    if (busy.current || isLocked || !Number.isSafeInteger(bet) || bet < 10 || bet > credits) return;
    busy.current = true;
    const round = await startRound(bet, 'double', { pick });
    if (!round) { busy.current = false; if (autoBet !== null) auto.stop(); return; }
    const outcome = round.demo ? spinDouble() : round.outcome;
    const next = Array.from({ length: 29 }, spinDouble);
    next[LANDING_SLOT] = outcome;
    setItems(next);
    setLastResult(null);
    setOffset(-(LANDING_SLOT * TILE_STEP + 44 - stageWidth / 2));
    setSpinId((id) => id + 1);
    setSpinning(true);
    casinoSound('spin');
    timerRef.current = window.setTimeout(() => {
      setSpinning(false);
      setLastResult(outcome);
      const payout = doublePayout(bet, pick, outcome);
      const won = payout > 0;
      casinoSound(won ? 'win' : 'loss');
      finishRound({ game: 'double', summary: outcome.label, stake: bet, net: payout - bet, won, payout, pick, outcome: outcome.key }, payout);
      auto.finish(payout - bet);
      busy.current = false;
    }, reduced ? 30 : 5600);
  };
  const playRef = useRef(play);
  playRef.current = play;
  const startAuto = () => auto.start(stakeText, setStakeText, (amount) => playRef.current(amount));

  return <div className="double-game game-side-layout">
    <section className="game-controls side-control-panel double-controls" aria-label="Double controls">
      <GameModeHeader label="DOUBLE" mode={auto.mode} onChange={auto.setMode} disabled={isLocked || auto.running} />
      <label className="stake-field"><span>{auto.mode === 'auto' ? 'Bet amount' : 'Play amount'}</span><div className="stake-input-wrap"><input aria-label="Double bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={isLocked || auto.running} /><span>CR</span></div></label>
      {auto.mode === 'auto' && <AutoRollSettings auto={auto} onStart={startAuto} disabled={auto.running} />}
      <div className="double-picks" role="group" aria-label="Choose a Double outcome">{DOUBLE_OUTCOMES.map((option) => <button key={option.key} type="button" className={'double-pick double-' + option.key + (pick === option.key ? ' selected' : '')} disabled={isLocked || auto.running} aria-pressed={pick === option.key} onClick={() => setPick(option.key)}><span className="double-pick-dot" /><strong>{option.label}</strong></button>)}</div>
      {auto.mode === 'manual' && <Button variant="primary" className="game-action-button" onClick={() => play()} disabled={isLocked || !Number.isSafeInteger(stake) || stake < 10 || stake > credits}>{spinning ? 'Rolling…' : 'Place bet'}</Button>}
      <div className="double-round-status" aria-live="polite">{lastResult ? lastResult.key === pick ? `Won ${formatCredits(doublePayout(stake, pick, lastResult))} credits` : `${lastResult.label} landed` : 'Choose an outcome to play'}</div>
    </section>
    <section className="double-board game-scene-panel" aria-label="Double reel">
      <div className="scene-glow scene-glow-red" /><div className="scene-glow scene-glow-blue" />
      <div className="double-scene-heading"><span>DOUBLE</span><strong>{spinning ? 'Rolling' : lastResult ? `${lastResult.label} landed` : 'Ready when you are'}</strong></div>
      <div ref={stageRef} className="double-reel-stage">
        <div className="double-reel-pointer" aria-hidden="true" />
        <motion.div key={spinId} className="double-reel-track" initial={{ x: 0 }} animate={{ x: offset }} transition={{ x: { duration: reduced ? 0 : 5.6, ease: [.14,.04,.12,1] } }}>
          {items.map((item, index) => <div className="double-reel-tile" style={{ '--tile-color': item.color }} key={`${index}-${item.key}`}><span>{item.label.split(' ')[0]}</span><strong>{item.label.split(' ').slice(1).join(' ')}</strong></div>)}
        </motion.div>
      </div>
      <div className="double-outcome-legend">{DOUBLE_OUTCOMES.map((option) => <span key={option.key} style={{ '--tile-color': option.color }}>{option.label}</span>)}</div>
      {lastResult && <motion.div className="double-result-banner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><i style={{ background: lastResult.color }} />{lastResult.label}{lastResult.key === pick ? ' · WIN' : ' · LOSS'}</motion.div>}
    </section>
  </div>;
}
