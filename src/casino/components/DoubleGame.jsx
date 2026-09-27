import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './ui.jsx';
import { DOUBLE_OUTCOMES, doublePayout, spinDouble } from '../logic/double.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';

const LANDING_SLOT = 24;
const TILE_STEP = 96;

export function DoubleGame({ credits, locked, startRound, finishRound }) {
  const [stakeText, setStakeText] = useState('10');
  const [pick, setPick] = useState('red');
  const [spinning, setSpinning] = useState(false);
  const [items, setItems] = useState(() => Array.from({ length: 29 }, spinDouble));
  const [offset, setOffset] = useState(0);
  const [stageWidth, setStageWidth] = useState(880);
  const [lastResult, setLastResult] = useState(null);
  const stageRef = useRef(null);
  const timerRef = useRef(null);
  const busy = useRef(false);
  const reduced = useReducedMotion();
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

  const play = async () => {
    if (busy.current || isLocked || !Number.isSafeInteger(stake) || stake < 10 || stake > credits) return;
    busy.current = true;
    const round = await startRound(stake, 'double', { pick });
    if (!round) { busy.current = false; return; }
    const outcome = round.demo ? spinDouble() : round.outcome;
    const next = Array.from({ length: 29 }, spinDouble);
    next[LANDING_SLOT] = outcome;
    setItems(next);
    setLastResult(null);
    setOffset(-(LANDING_SLOT * TILE_STEP + 44 - stageWidth / 2));
    setSpinning(true);
    casinoSound('spin');
    timerRef.current = window.setTimeout(() => {
      setSpinning(false);
      setLastResult(outcome);
      const payout = doublePayout(stake, pick, outcome);
      const won = payout > 0;
      casinoSound(won ? 'win' : 'loss');
      finishRound({ game: 'double', summary: outcome.label, stake, net: payout - stake, won, payout, pick, outcome: outcome.key }, payout);
      busy.current = false;
    }, reduced ? 30 : 5600);
  };

  return <div className="double-game game-side-layout">
    <section className="game-controls side-control-panel double-controls" aria-label="Double controls">
      <div className="game-panel-heading"><span>DOUBLE</span><h2>Pick your color</h2><p>One spin. Four multipliers.</p></div>
      <label className="stake-field"><span>Play amount</span><div className="stake-input-wrap"><input aria-label="Double bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={isLocked} /><span>CR</span></div></label>
      <div className="double-picks" role="group" aria-label="Choose a Double outcome">{DOUBLE_OUTCOMES.map((option) => <button key={option.key} type="button" className={'double-pick double-' + option.key + (pick === option.key ? ' selected' : '')} disabled={isLocked} aria-pressed={pick === option.key} onClick={() => setPick(option.key)}><span className="double-pick-dot" /><strong>{option.label}</strong></button>)}</div>
      <Button variant="primary" className="game-action-button" onClick={play} disabled={isLocked || !Number.isSafeInteger(stake) || stake < 10 || stake > credits}>{spinning ? 'Rolling…' : 'Place bet'}</Button>
      <div className="double-round-status" aria-live="polite">{lastResult ? lastResult.key === pick ? `Won ${formatCredits(doublePayout(stake, pick, lastResult))} credits` : `${lastResult.label} landed` : 'Choose an outcome to play'}</div>
    </section>
    <section className="double-board game-scene-panel" aria-label="Double reel">
      <div className="scene-glow scene-glow-red" /><div className="scene-glow scene-glow-blue" />
      <div className="double-scene-heading"><span>DOUBLE</span><strong>{spinning ? 'Rolling' : lastResult ? `${lastResult.label} landed` : 'Ready when you are'}</strong></div>
      <div ref={stageRef} className="double-reel-stage">
        <div className="double-reel-pointer" aria-hidden="true" />
        <motion.div className="double-reel-track" animate={{ x: spinning ? offset : 0 }} transition={{ x: { duration: reduced ? 0 : spinning ? 5.6 : 0, ease: [.14,.04,.12,1] } }}>
          {items.map((item, index) => <div className="double-reel-tile" style={{ '--tile-color': item.color }} key={`${index}-${item.key}`}><span>{item.label.split(' ')[0]}</span><strong>{item.label.split(' ').slice(1).join(' ')}</strong></div>)}
        </motion.div>
      </div>
      <div className="double-outcome-legend">{DOUBLE_OUTCOMES.map((option) => <span key={option.key} style={{ '--tile-color': option.color }}>{option.label}</span>)}</div>
      {lastResult && <motion.div className="double-result-banner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><i style={{ background: lastResult.color }} />{lastResult.label}{lastResult.key === pick ? ' · WIN' : ' · LOSS'}</motion.div>}
    </section>
  </div>;
}
