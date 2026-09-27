import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ChevronUp } from 'lucide-react';
import { Button } from './ui.jsx';
import { Chicken, Car, Roadblock } from './GameArt.jsx';
import { CROSS_STEPS, CROSS_DIFFICULTIES, crossSurvives, crossMultiplier, crossCashout } from '../logic/chicken.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';

export function ChickenCross({ credits, locked, startRound, finishRound, gameAction, active }) {
  const [stakeText, setStakeText] = useState('10');
  const [difficulty, setDifficulty] = useState('easy');
  const [phase, setPhase] = useState('ready');
  const [steps, setSteps] = useState(0);
  const [visualStep, setVisualStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hitLane, setHitLane] = useState(-1);
  const [difficultyOpen, setDifficultyOpen] = useState(false);
  const difficultyRef = useRef(null);
  const roadViewportRef = useRef(null);
  const busyRef = useRef(false);
  const roundStake = useRef(10);
  const roundDifficulty = useRef('easy');
  const reduced = useReducedMotion();
  const stake = Number(stakeText);
  const currentPayout = crossCashout(roundStake.current, steps, roundDifficulty.current);

  useEffect(() => {
    if (!active && (phase === 'busted' || phase === 'cashed')) { setPhase('ready'); setSteps(0); setVisualStep(0); setHitLane(-1); roadViewportRef.current?.scrollTo({ left: 0 }); }
  }, [active, phase]);

  useEffect(() => {
    const closeOnOutside = (event) => { if (!difficultyRef.current?.contains(event.target)) setDifficultyOpen(false); };
    const closeOnEscape = (event) => { if (event.key === 'Escape') setDifficultyOpen(false); };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOnOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, []);

  useEffect(() => {
    if (visualStep > 2 && roadViewportRef.current) {
      const viewport = roadViewportRef.current;
      const target = Math.max(0, 140 + visualStep * 150 - viewport.clientWidth * .65);
      viewport.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
    }
  }, [visualStep, reduced]);

  const start = async () => {
    if (locked || busyRef.current || !Number.isFinite(stake) || stake < 10 || stake > credits) return;
    busyRef.current = true;
    const round = await startRound(stake, 'chicken-cross', { difficulty });
    busyRef.current = false;
    if (!round) return;
    roundStake.current = stake;
    roundDifficulty.current = difficulty;
    setPhase('playing'); setSteps(0); setVisualStep(0); setHitLane(-1); setBusy(false);
  };
  const finish = (won, count = steps) => {
    const payout = won ? crossCashout(roundStake.current, count, roundDifficulty.current) : 0;
    setPhase(won ? 'cashed' : 'busted'); busyRef.current = false; setBusy(false);
    casinoSound(won ? 'win' : 'loss');
    finishRound({ game: 'chicken-cross', summary: String(count), stake: roundStake.current, net: payout - roundStake.current, won, payout, steps: count }, payout);
  };
  const cross = async () => {
    if (phase !== 'playing' || busyRef.current || steps >= CROSS_STEPS) return;
    busyRef.current = true; setBusy(true);
    const outcome = await gameAction('cross');
    if (!outcome) { busyRef.current = false; setBusy(false); return; }
    const survives = outcome.demo ? crossSurvives(roundDifficulty.current, steps) : outcome.outcome.survives, next = steps + 1;
    setVisualStep(next);
    casinoSound('click');
    const travelTime = reduced ? 0 : 300;
    const settleTime = reduced ? 0 : 100;
    window.setTimeout(() => {
      if (!survives) {
        setHitLane(steps);
        window.setTimeout(() => finish(false), reduced ? 0 : 320);
        return;
      }
      setSteps(next);
      if (next === CROSS_STEPS) finish(true, next);
      else { busyRef.current = false; setBusy(false); }
    }, travelTime + settleTime);
  };
  const cashout = async () => {
    if (phase !== 'playing' || busyRef.current || !steps) return;
    busyRef.current = true; setBusy(true);
    const outcome = await gameAction('cashout');
    if (!outcome) { busyRef.current = false; setBusy(false); return; }
    finish(true);
  };

  return <div className="chicken-game game-side-layout">
    <div className="game-controls side-control-panel chicken-controls">
      <div className="game-panel-heading"><span>CHICKEN CROSS</span><h2>One lane at a time</h2><p>Cross carefully, then cash out.</p></div>
      <div className="cross-difficulty-wrap" ref={difficultyRef}>
        <button type="button" className="cross-difficulty-trigger" aria-label={`Difficulty: ${CROSS_DIFFICULTIES[difficulty].label}`} aria-expanded={difficultyOpen} aria-haspopup="listbox" disabled={phase === 'playing' || busy || locked} onClick={() => setDifficultyOpen((open) => !open)}>
          <span><small>Difficulty</small><strong>{CROSS_DIFFICULTIES[difficulty].label}</strong></span><ChevronUp size={16} />
        </button>
        {difficultyOpen && <div className="cross-difficulty-menu" role="listbox" aria-label="Choose Chicken Cross difficulty">{Object.entries(CROSS_DIFFICULTIES).map(([key, option]) => <button key={key} type="button" role="option" aria-selected={difficulty === key} className={difficulty === key ? 'selected' : ''} disabled={phase === 'playing' || busy || locked} onClick={() => { setDifficulty(key); setDifficultyOpen(false); }}><span>{option.label}</span></button>)}</div>}
      </div>
      <label className="stake-field"><span>Play amount</span><div className="stake-input-wrap"><input aria-label="Chicken Cross bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={locked || busy} /><span>CR</span></div></label>
      {phase === 'playing' ? <><Button variant="secondary" onClick={cashout} disabled={busy || !steps}>Cash out <span>{formatCredits(currentPayout)} CR</span></Button><Button variant="primary" onClick={cross} disabled={busy}>Cross <ArrowRight size={17} /></Button></> : <Button variant="primary" onClick={start} disabled={locked || busy || !Number.isFinite(stake) || stake < 10 || stake > credits}>Bet</Button>}
      <span className="cross-current-multiplier">{crossMultiplier(phase === 'playing' ? roundDifficulty.current : difficulty, steps).toFixed(2)}×</span>
    </div>
    <div ref={roadViewportRef} className={'road-viewport game-scene-panel' + (active ? '' : ' road-paused')}>
      <div className="road-scene-sky" aria-hidden="true"><i /><i /><i /></div>
      <motion.div className="road-world" initial={false}>
        <div className="road-pavement"><div className="pavement-bricks" /><div className="road-lamp"><i /><b /></div><div className="road-tree"><i /><i /><i /></div><div className="road-curb" /></div>
        {Array.from({ length: CROSS_STEPS }, (_, index) => {
          const multiplier = crossMultiplier(difficulty, index + 1);
          const cleared = index < steps, current = phase === 'playing' && index === steps;
          return <div className={'road-lane' + (cleared ? ' cleared' : '') + (hitLane === index ? ' hit' : '')} key={index}>
            <button type="button" className={'lane-marker' + (current ? ' next' : '') + (cleared ? ' cleared' : '')} disabled={!current || busy} onClick={cross} aria-label={'Cross to ' + multiplier.toFixed(2) + ' times'}><span>{multiplier.toFixed(2)}×</span></button>
            {cleared && <motion.div className="roadblock" initial={{ opacity: 0, y: reduced ? 0 : -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}><Roadblock /></motion.div>}
            {hitLane === index && <div className="lane-car car-hit"><Car color={index % 3 ? 'blue' : 'gold'} /></div>}
          </div>;
        })}
        <motion.div className={'road-chicken' + (phase === 'busted' ? ' dead' : '')} initial={false} animate={{ x: visualStep * 150, y: busy && !reduced ? [0,-16,0] : 0, opacity: phase === 'busted' ? 0 : 1, scaleY: 1 }} transition={{ x: { duration: reduced ? 0 : .34, ease: [.25,.8,.2,1] }, y: { duration: reduced ? 0 : .34 }, opacity: { duration: phase === 'busted' ? 0 : .18 }, scaleY: { duration: .24 } }}><Chicken /></motion.div>
      </motion.div>
    </div>
  </div>;
}

