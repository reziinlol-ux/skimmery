import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './ui.jsx';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';
import { formatWheelMultiplier, multiplyWheelMultiplier, spinWheel, wheelCashout, wheelSegments, WHEEL_MAX_WINS, WHEEL_RISKS } from '../logic/wheel.js';

const segmentAngle = 360 / 25;
const polar = (radius, degrees) => {
  const angle = (degrees - 90) * Math.PI / 180;
  return [210 + radius * Math.cos(angle), 210 + radius * Math.sin(angle)];
};
const segmentPath = (index) => {
  const start = index * segmentAngle - segmentAngle / 2, end = start + segmentAngle;
  const [x1, y1] = polar(188, start), [x2, y2] = polar(188, end);
  const [x3, y3] = polar(173, end), [x4, y4] = polar(173, start);
  return `M${x1},${y1} A188,188 0 0 1 ${x2},${y2} L${x3},${y3} A173,173 0 0 0 ${x4},${y4} Z`;
};

export function WheelGame({ credits, locked, startRound, finishRound, gameAction }) {
  const [risk, setRisk] = useState('low');
  const [stakeText, setStakeText] = useState('10');
  const [phase, setPhase] = useState('ready');
  const [busy, setBusy] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [lastResult, setLastResult] = useState(null);
  const rotationRef = useRef(0);
  const roundStake = useRef(10);
  const roundRisk = useRef('low');
  const multiplierRef = useRef(1);
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const winsRef = useRef(0);
  const [wins, setWins] = useState(0);
  const reduced = useReducedMotion();
  const stake = Number(stakeText);
  const riskConfig = WHEEL_RISKS[risk];
  const segments = useMemo(() => wheelSegments(risk), [risk]);
  const nextPayouts = riskConfig.multipliers.map((value) => multiplyWheelMultiplier(multiplier, value));
  const cashoutValue = wheelCashout(roundStake.current, multiplier);
  const inRound = phase === 'spinning' || phase === 'playing';

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const spin = async (startedOutcome = null) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const response = startedOutcome || await gameAction('spin');
    if (!response) { busyRef.current = false; setBusy(false); return; }
    const outcome = response.demo ? spinWheel(roundRisk.current, winsRef.current) : response.outcome;
    const currentAngle = ((rotationRef.current % 360) + 360) % 360;
    const targetAngle = -outcome.index * segmentAngle;
    rotationRef.current += 360 * 7 + ((targetAngle - currentAngle + 360) % 360);
    busyRef.current = true;
    setBusy(true);
    setPhase('spinning');
    setLastResult(null);
    setRotation(rotationRef.current);
    casinoSound('spin');
    timerRef.current = window.setTimeout(() => {
      setBusy(false);
      busyRef.current = false;
      setLastResult(outcome);
      if (outcome.multiplier === null) {
        setPhase('busted');
        casinoSound('loss');
        finishRound({ game: 'wheel', summary: 'Lost', stake: roundStake.current, net: -roundStake.current, won: false, payout: 0, risk: roundRisk.current, outcome: 'miss' }, 0);
        return;
      }
      const nextMultiplier = multiplyWheelMultiplier(multiplierRef.current, outcome.multiplier);
      multiplierRef.current = nextMultiplier;
      setMultiplier(nextMultiplier);
      winsRef.current += 1;
      setWins(winsRef.current);
      casinoSound('win');
      if (winsRef.current >= WHEEL_MAX_WINS) {
        const payout = wheelCashout(roundStake.current, nextMultiplier);
        setPhase('cashed');
        finishRound({ game: 'wheel', summary: formatWheelMultiplier(nextMultiplier), stake: roundStake.current, net: payout - roundStake.current, won: true, payout, risk: roundRisk.current, autoCashout: true }, payout);
      } else setPhase('playing');
    }, reduced ? 35 : 2550);
  };

  const placeBet = async () => {
    if (locked || inRound || busyRef.current || !Number.isFinite(stake) || stake < 10 || stake > credits) return;
    busyRef.current = true;
    const round = await startRound(stake, 'wheel', { risk });
    busyRef.current = false;
    if (!round) return;
    roundStake.current = stake;
    roundRisk.current = risk;
    winsRef.current = 0; setWins(0);
    multiplierRef.current = 1;
    setMultiplier(1);
    spin(round);
  };

  const cashOut = async () => {
    if (phase !== 'playing' || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const response = await gameAction('cashout');
    if (!response) { busyRef.current = false; setBusy(false); return; }
    const payout = wheelCashout(roundStake.current, multiplierRef.current);
    setPhase('cashed');
    casinoSound('win');
    finishRound({ game: 'wheel', summary: formatWheelMultiplier(multiplierRef.current), stake: roundStake.current, net: payout - roundStake.current, won: payout > roundStake.current, payout, risk: roundRisk.current, outcome: lastResult?.multiplier }, payout);
    setBusy(false);
    busyRef.current = false;
  };

  return <div className="wheel-game">
    <div className="wheel-game-layout">
      <section className="wheel-controls" aria-label="Wheel controls">
        <label className="stake-field"><span>Bet</span><div className="stake-input-wrap"><input aria-label="Wheel bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={locked || inRound || busy} /><span>CR</span></div></label>
        <div className="wheel-risk-field"><span>Risk</span><div className="wheel-risk-picker" role="group" aria-label="Wheel risk">{Object.entries(WHEEL_RISKS).map(([key, option]) => <button key={key} type="button" className={risk === key ? 'selected' : ''} aria-pressed={risk === key} disabled={locked || inRound || busy} onClick={() => setRisk(key)}>{option.label}</button>)}</div></div>
        <div className="wheel-payout-card"><span>Cash out</span><strong>{inRound ? `${formatCredits(cashoutValue)} CR` : lastResult?.multiplier === null ? 'Round lost' : phase === 'cashed' ? `${formatCredits(cashoutValue)} CR` : '—'}</strong></div>
        {!inRound ? <Button className="game-action-button" variant="primary" onClick={placeBet} disabled={locked || busy || !Number.isFinite(stake) || stake < 10 || stake > credits}>{phase === 'ready' || phase === 'busted' || phase === 'cashed' ? 'Bet & spin' : 'Spin'}</Button> : <div className="wheel-action-row">
          <Button className="game-action-button" variant="secondary" onClick={cashOut} disabled={phase !== 'playing' || busy}>Cash out</Button>
          <Button className="game-action-button" variant="primary" onClick={() => spin()} disabled={phase !== 'playing' || busy}>Spin again</Button>
        </div>}
        <span className="wheel-round-status" aria-live="polite">{phase === 'spinning' ? 'Spinning' : phase === 'busted' ? 'Lost' : phase === 'cashed' ? 'Cashed out' : phase === 'playing' ? `${wins} / 8 wins · ${formatWheelMultiplier(multiplier)}` : ''}</span>
      </section>

      <section className="wheel-board" aria-label="Wheel game">
        <div className="wheel-stage">
          <svg className="wheel-frame" viewBox="0 0 420 420" aria-hidden="true">
            <circle cx="210" cy="210" r="204" fill="#25272c" stroke="#42454e" strokeWidth="5" />
            <circle cx="210" cy="210" r="197" fill="none" stroke="#555963" strokeWidth="2" />
            {Array.from({ length: 25 }, (_, index) => { const [x, y] = polar(199, index * segmentAngle); return <circle key={index} cx={x} cy={y} r="2.2" fill="#70747c" />; })}
          </svg>
          <motion.svg className="wheel-disc" viewBox="0 0 420 420" animate={{ rotate: rotation }} transition={{ rotate: { duration: reduced ? 0 : busy ? 2.5 : 0, ease: [.08, .72, .13, 1] } }} aria-label="Wheel segments">
            <circle cx="210" cy="210" r="190" fill="#32353c" />
            {segments.map((segment, index) => <path key={index} d={segmentPath(index)} fill={segment.color} stroke="#25272d" strokeWidth="2.5" />)}
            <circle cx="210" cy="210" r="171" fill="#25272d" stroke="#565a64" strokeWidth="3" />
          </motion.svg>
          <div className="wheel-hub" aria-hidden="true"><span>{multiplier > 1 ? formatWheelMultiplier(multiplier) : ''}</span></div>
          <svg className="wheel-pointer" viewBox="0 0 44 66" aria-hidden="true"><path d="M4 4 22 14 40 4 22 58Z" fill="#f4f5f7" stroke="#9297a0" strokeWidth="2" strokeLinejoin="round" /><path d="M16 16 22 21 28 16" fill="none" stroke="#ef5d61" strokeWidth="3" strokeLinecap="round" /></svg>
        </div>
        <div className="wheel-payout-row" aria-label="Multipliers for the next spin">{nextPayouts.map((value, index) => <span key={`${risk}-${index}`} className={`wheel-payout-chip wheel-payout-${index}`}>{formatWheelMultiplier(value)}</span>)}</div>
      </section>
    </div>
  </div>;
}
