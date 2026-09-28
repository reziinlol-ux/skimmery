import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './ui.jsx';
import { crashMultiplier, crashPayout, sampleCrashPoint } from '../logic/crash.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';
import { GameModeHeader, AutoRollSettings } from './AutoRoll.jsx';
import { useAutoRoll } from '../useAutoRoll.js';

const multiplierText = (value) => `${Number(value || 1).toFixed(2)}×`;

export function CrashGame({ credits, locked, startRound, finishRound, gameAction, active }) {
  const [stakeText, setStakeText] = useState('10');
  const [autoCashoutText, setAutoCashoutText] = useState('');
  const [phase, setPhase] = useState('ready');
  const [multiplier, setMultiplier] = useState(1);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resultText, setResultText] = useState('Place a bet to start');
  const [plotKey, setPlotKey] = useState(0);
  const stake = Number(stakeText);
  const autoCashout = autoCashoutText.trim() ? Number(autoCashoutText) : null;
  const autoCashoutValid = autoCashout === null || (Number.isFinite(autoCashout) && autoCashout >= 1.5 && autoCashout <= 100);
  const reduced = useReducedMotion();
  const stakeRef = useRef(10);
  const startTime = useRef(0);
  const crashAt = useRef(1);
  const actionPending = useRef(false);
  const finished = useRef(false);
  const serverRoundActive = useRef(false);
  const lastTick = useRef(0);
  const activeRef = useRef(active);
  const auto = useAutoRoll({ credits, active });
  const roundAutoCashout = useRef(null);
  activeRef.current = active;

  useEffect(() => {
    if (!active && (phase === 'crashed' || phase === 'cashed')) {
      setPhase('ready'); setMultiplier(1); setElapsedMs(0); setResultText('Place a bet to start');
    }
  }, [active, phase]);

  const settle = (won, at, automatic = false) => {
    if (finished.current) return;
    finished.current = true;
    setPhase(won ? 'cashed' : 'crashed');
    setBusy(false); actionPending.current = false;
    const payout = won ? crashPayout(stakeRef.current, at) : 0;
    setMultiplier(at);
    setResultText(won ? `${automatic ? 'Auto cashed out' : 'Cashed out'} at ${multiplierText(at)}` : `Crashed at ${multiplierText(at)}`);
    casinoSound(won ? 'win' : 'loss');
    finishRound({ game: 'crash', summary: won ? `${automatic ? 'Auto · ' : ''}${multiplierText(at)}` : `Crashed ${multiplierText(at)}`, stake: stakeRef.current, net: payout - stakeRef.current, won, payout, multiplier: at, autoCashout: automatic }, payout);
    auto.finish(payout - stakeRef.current);
  };

  useEffect(() => {
    if (phase !== 'running') return undefined;
    let frame = 0;
    let previousDraw = 0;
    const draw = (now) => {
      if (!activeRef.current || finished.current) return;
      if (now - previousDraw > 45) {
        previousDraw = now;
        const current = crashMultiplier(Date.now() - startTime.current);
        setElapsedMs(Date.now() - startTime.current);
        setMultiplier(current);
        if (!serverRoundActive.current && roundAutoCashout.current !== null && current >= roundAutoCashout.current && roundAutoCashout.current < crashAt.current) { settle(true, roundAutoCashout.current, true); return; }
        if (!serverRoundActive.current && current >= crashAt.current) { settle(false, crashAt.current); return; }
        if (serverRoundActive.current && now - lastTick.current > 850 && !actionPending.current) {
          lastTick.current = now;
          actionPending.current = true;
          gameAction('crash-check').then((response) => {
            actionPending.current = false;
            if (!response || finished.current) return;
            const serverMultiplier = Number(response.outcome?.currentMultiplier) || current;
            setMultiplier(serverMultiplier);
            if (response.outcome?.autoCashedOut) settle(true, serverMultiplier, true);
            else if (response.completed || response.outcome?.crashed) settle(false, serverMultiplier);
          });
        }
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [phase, locked, gameAction, active]);

  const play = async (autoBet = null, target = autoCashout) => {
    const bet = autoBet ?? stake;
    if (locked || busy || phase === 'running' || !Number.isSafeInteger(bet) || bet < 10 || bet > credits || (target !== null && (!Number.isFinite(target) || target < 1.5 || target > 100))) return;
    setBusy(true); finished.current = false; actionPending.current = false;
    const round = await startRound(bet, 'crash', { autoCashout: target });
    if (!round) { setBusy(false); if (autoBet !== null) auto.stop(); return; }
    serverRoundActive.current = !round.demo;
    stakeRef.current = bet;
    roundAutoCashout.current = target;
    startTime.current = round.demo ? Date.now() : Number(round.round?.startedAt) || Date.now();
    crashAt.current = round.demo ? sampleCrashPoint() : Number.POSITIVE_INFINITY;
    setMultiplier(1); setElapsedMs(0); setPlotKey((key) => key + 1); setPhase('running'); setResultText('In flight'); setBusy(false);
    lastTick.current = 0;
    casinoSound('spin');
  };
  const playRef = useRef(play);
  playRef.current = play;
  const startAuto = () => {
    const target = autoCashout ?? 2;
    if (autoCashout === null) setAutoCashoutText('2');
    auto.start(stakeText, setStakeText, (amount) => playRef.current(amount, target));
  };

  const cashOut = async () => {
    if (phase !== 'running' || busy || finished.current) return;
    setBusy(true); actionPending.current = true;
    const localMultiplier = crashMultiplier(Date.now() - startTime.current);
    if (serverRoundActive.current) {
      const response = await gameAction('cashout');
      actionPending.current = false;
      if (!response) { setBusy(false); return; }
      const settledAt = Number(response.outcome?.currentMultiplier) || localMultiplier;
      if (response.outcome?.crashed || response.completed && !response.payout) settle(false, settledAt);
      else settle(true, settledAt, Boolean(response.outcome?.autoCashedOut));
      return;
    }
    if (localMultiplier >= crashAt.current) settle(false, crashAt.current);
    else settle(true, localMultiplier);
  };

  const extent = Math.min(1, elapsedMs / 50000);
  const rise = Math.min(1, Math.log(Math.max(1, multiplier)) / Math.log(100));
  const chartX = 24 + 552 * extent;
  const chartY = 342 - 286 * rise;
  const graph = (() => {
    const points = Array.from({ length: 24 }, (_, index) => {
      const p = index / 23;
      const x = 24 + 552 * extent * p;
      const y = 342 - 286 * rise * Math.pow(p, 1.55);
      return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return points.join(' ');
  })();

  return <div className="crash-game game-side-layout">
    <section className="game-controls side-control-panel crash-controls" aria-label="Crash controls">
      <GameModeHeader label="CRASH" mode={auto.mode} onChange={auto.setMode} disabled={locked || busy || phase === 'running' || auto.running} />
      <label className="stake-field"><span>{auto.mode === 'auto' ? 'Bet amount' : 'Play amount'}</span><div className="stake-input-wrap"><input aria-label="Crash bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={locked || busy || phase === 'running' || auto.running} /><span>CR</span></div></label>
      {auto.mode === 'auto' && <AutoRollSettings auto={auto} onStart={startAuto} disabled={auto.running} />}
      <label className="stake-field crash-auto-field"><span>Auto cashout</span><div className="stake-input-wrap"><input aria-label="Crash auto cashout multiplier, minimum 1.5 times" type="number" min="1.5" max="100" step="0.1" value={autoCashoutText} onChange={(event) => setAutoCashoutText(event.target.value)} disabled={locked || busy || phase === 'running' || auto.running} placeholder="1.50× minimum" /><span>×</span></div><small className={'crash-auto-hint' + (autoCashoutText && !autoCashoutValid ? ' invalid' : '')}>{autoCashoutText && !autoCashoutValid ? 'Enter a target from 1.50× to 100×.' : ''}</small></label>
      {phase === 'running' ? <Button variant="primary" className="game-action-button crash-cashout" onClick={cashOut} disabled={busy || auto.running || finished.current}>Cash out · {formatCredits(crashPayout(stakeRef.current, multiplier))} CR</Button> : auto.mode === 'manual' ? <Button variant="primary" className="game-action-button" onClick={() => play()} disabled={locked || busy || !Number.isSafeInteger(stake) || stake < 10 || stake > credits || !autoCashoutValid}>{phase === 'crashed' || phase === 'cashed' ? 'Play again' : 'Start round'}</Button> : null}
      <div className={'crash-round-status ' + phase} aria-live="polite">{resultText}</div>
      <div className="crash-cashout-note">Your bet is returned only when you cash out in time.</div>
    </section>
    <section className={'crash-board game-scene-panel ' + phase} aria-label="Crash multiplier chart">
      <div className="crash-chart-grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="crash-chart-label">{phase === 'running' ? 'IN FLIGHT' : phase === 'crashed' ? 'CRASHED' : phase === 'cashed' ? 'CASHED OUT' : 'READY'}</div>
      <motion.strong key={plotKey} className="crash-multiplier" animate={{ color: phase === 'crashed' ? '#ff6475' : '#60a9ff', scale: phase === 'running' && !reduced ? [1, 1.035, 1] : 1 }} transition={{ scale: { duration: 1.4, repeat: phase === 'running' ? Infinity : 0 } }}>{multiplierText(multiplier)}</motion.strong>
      <svg className="crash-chart" viewBox="0 0 600 380" preserveAspectRatio="none" aria-hidden="true"><path className="crash-fill" d={`${graph} L${chartX.toFixed(1)},380 L24,380 Z`} /><path className="crash-line" d={graph} /></svg>
      <span className="crash-dot" aria-hidden="true" style={{ left: `${(chartX / 600) * 100}%`, top: `${(chartY / 380) * 100}%` }} />
    </section>
  </div>;
}
