import React, { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { RotateCcw, Undo2 } from 'lucide-react';
import { Button } from './ui.jsx';
import { RED_NUMBERS, WHEEL_ORDER, netOddsForBet, rouletteGroups, rouletteOutcomeDetails, settleRoulette, spinRoulette } from '../logic/roulette.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';

const chipColors = ['#3a73aa', '#a64d55', '#46836e', '#303136', '#8065ab', '#a68548'];
function ChipArtwork({ value, color }) {
  return <svg className="chip-artwork" viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r="47" fill={color} stroke="#d8e0ea" strokeWidth="2" />
    {Array.from({ length: 16 }, (_, i) => <path key={i} d="M47 4H53V13H47Z" fill="#e7edf4" transform={`rotate(${i * 22.5} 50 50)`} />)}
    <circle cx="50" cy="50" r="35" fill="none" stroke="#e7edf4" strokeWidth="2" />
    <circle cx="50" cy="50" r="30" fill="none" stroke="#ffffff55" strokeWidth="1" />
    <text x="50" y="51" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontFamily="DM Sans, sans-serif" fontWeight="700" fontSize={String(value).length > 3 ? 20 : 25}>{formatCredits(value)}</text>
  </svg>;
}

const chipSizes = [10, 25, 50, 100, 200, 500];
const numberBet = (value) => ({ key: 'number-' + value, label: String(value), type: 'number', value, count: 1 });
const pocketClass = (value) => value === 0 ? 'green' : RED_NUMBERS.has(value) ? 'red' : 'black';
const step = 360 / 37;
const point = (radius, angle) => [200 + radius * Math.sin(angle * Math.PI / 180), 200 - radius * Math.cos(angle * Math.PI / 180)];
const sector = (start, end) => {
  const a = point(170, start), b = point(170, end), c = point(106, end), d = point(106, start);
  return 'M' + a.join(',') + ' A170,170 0 0,1 ' + b.join(',') + ' L' + c.join(',') + ' A106,106 0 0,0 ' + d.join(',') + 'Z';
};

function Wheel({ rotation, ballRotation, spinning, reduced }) {
  return <div className="roulette-wheel-scene" aria-label="European roulette wheel">
    <div className="roulette-wheel-perspective">
      <div className="roulette-wheel-depth" />
      <svg className="roulette-wheel-base" viewBox="0 0 400 400" aria-hidden="true">
        <defs><radialGradient id="wheel-rim"><stop offset=".72" stopColor="#444649"/><stop offset=".88" stopColor="#6b6d70"/><stop offset="1" stopColor="#3b3d40"/></radialGradient></defs>
        <circle cx="200" cy="200" r="198" fill="#35373a"/><circle cx="200" cy="200" r="190" fill="url(#wheel-rim)"/><circle cx="200" cy="200" r="172" fill="#262729"/>
      </svg>
      <motion.svg className="roulette-wheel-disc" viewBox="0 0 400 400" animate={{ rotate: rotation }} transition={{ duration: reduced ? 0 : spinning ? 5.05 : 0, ease: [.12,.65,.16,1] }} aria-hidden="true">
        {WHEEL_ORDER.map((number, index) => {
          const angle = (index + .5) * step, pos = point(157, angle);
          return <g key={number}><path d={sector(index * step, (index + 1) * step)} fill={number === 0 ? '#00c878' : RED_NUMBERS.has(number) ? '#ff3048' : '#202124'} stroke="#ffffff08" strokeWidth=".6"/><text x={pos[0]} y={pos[1]} fill="#fff" fontSize="10" fontWeight="700" textAnchor="middle" dominantBaseline="middle" transform={'rotate(' + angle + ' ' + pos[0] + ' ' + pos[1] + ')'}>{number}</text></g>;
        })}
        <circle cx="200" cy="200" r="106" fill="#45474b"/>
      </motion.svg>
      <motion.div className="roulette-ball-orbit" animate={{ rotate: ballRotation }} transition={{ duration: reduced ? 0 : spinning ? 5 : 0, ease: [.15,.75,.25,1] }}><span className="roulette-ball" /></motion.div>
      <div className="wheel-spindle"><i /><b /><span /></div>
    </div>
  </div>;
}

export function Roulette({ credits, locked, startRound, finishRound }) {
  const [bets, setBets] = useState([]);
  const [chip, setChip] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [winningKeys, setWinningKeys] = useState([]);
  const [rotation, setRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);
  const rotationRef = useRef(0);
  const ballRef = useRef(0);
  const busy = useRef(false);
  const undoRef = useRef([]);
  const reduced = useReducedMotion();
  const total = useMemo(() => bets.reduce((sum, bet) => sum + bet.amount, 0), [bets]);
  const isLocked = locked || spinning;

  const addBet = (bet) => {
    if (isLocked || busy.current || total + chip > credits) return;
    undoRef.current.push(bets);
    setBets((current) => {
      const previous = current.find((entry) => entry.key === bet.key);
      return previous ? current.map((entry) => entry.key === bet.key ? { ...entry, amount: entry.amount + chip, chips: [...(entry.chips || [entry.amount]), chip] } : entry) : [...current, { ...bet, amount: chip, chips: [chip] }];
    });
    setWinningKeys([]);
    setResult(null);
  };
  const undo = () => { if (!isLocked && undoRef.current.length) setBets(undoRef.current.pop()); };
  const clear = () => { if (!isLocked) { setBets([]); undoRef.current = []; } };
  const play = async () => {
    if (busy.current || isLocked || total < 10) return;
    busy.current = true;
    const round = await startRound(total, 'roulette', { bets });
    if (!round) { busy.current = false; return; }
    const outcome = round.demo ? spinRoulette() : round.outcome;
    const settlement = settleRoulette(bets, outcome);
    const targetAngle = -((WHEEL_ORDER.indexOf(outcome) + .5) * step);
    const currentAngle = ((rotationRef.current % 360) + 360) % 360;
    rotationRef.current += 360 * 11 + ((targetAngle - currentAngle + 360) % 360);
    ballRef.current -= 360 * 14;
    setRotation(rotationRef.current); setBallRotation(ballRef.current);
    setResult(null); setWinningKeys([]); setSpinning(true);
    casinoSound('spin');
    window.setTimeout(() => {
      setSpinning(false); setResult(outcome); setWinningKeys(settlement.winningKeys); undoRef.current = [];
      casinoSound(settlement.net > 0 ? 'win' : 'loss');
      finishRound({ game: 'roulette', summary: String(outcome), stake: total, net: settlement.net, won: settlement.net > 0, payout: settlement.returned, outcome }, settlement.returned);
      busy.current = false;
    }, reduced ? 30 : 5200);
  };
  const amountFor = (key) => bets.find((bet) => bet.key === key)?.amount;
  const labelFor = (group) => group.type === 'column' ? '2:1' : group.type === 'dozen' ? ['1 to 12','13 to 24','25 to 36'][group.value - 1] : group.label;
  const placedChip = (key) => {
    const bet = bets.find((entry) => entry.key === key);
    if (!bet) return null;
    const amount = bet.amount;
    const color = amount > 500 ? '#a68548' : amount > 200 ? '#3a73aa' : amount > 100 ? '#303136' : amount > 50 ? '#46836e' : amount > 25 ? '#a64d55' : '#3a73aa';
    return <span className="placed-wager-chip" title={`${formatCredits(amount)} credits bet`}><ChipArtwork value={amount} color={color} /></span>;
  };
  const groupButton = (key) => {
    const group = rouletteGroups.find((item) => item.key === key), amount = amountFor(key);
    return <button key={key} type="button" disabled={isLocked} onClick={() => addBet(group)} className={'roulette-bet roulette-group ' + (amount ? 'has-bet ' : '') + (winningKeys.includes(key) ? 'winning-bet' : '')} aria-label={'Bet on ' + group.label + ', pays ' + (group.type === 'column' ? '2 to 1' : netOddsForBet(group).toFixed(2) + ' to 1')}>
      {group.type === 'color' ? <span className={'color-diamond ' + group.value} /> : <span>{labelFor(group)}</span>}
      {amount && placedChip(key)}
    </button>;
  };
  const numberButton = (n) => {
    const key = 'number-' + n, amount = amountFor(key);
    return <button key={n} type="button" disabled={isLocked} onClick={() => addBet(numberBet(n))} aria-label={'Bet on ' + n} className={'roulette-bet roulette-number ' + pocketClass(n) + (amount ? ' has-bet' : '') + (result === n ? ' winning-number' : '') + (winningKeys.includes(key) ? ' winning-bet' : '')}><span>{n}</span>{amount && placedChip(key)}</button>;
  };

  return <div className="roulette-game">
    <Wheel rotation={rotation} ballRotation={ballRotation} spinning={spinning} reduced={reduced} />
    {result !== null && <div className="roulette-result-summary" role="status" aria-label={`Number ${result} result details`}>
      <span className={'roulette-result-number ' + pocketClass(result)}>{result}</span>
      <div className="roulette-result-details">{rouletteOutcomeDetails(result).map((item) => <span key={item.label} className={item.className}>{item.label}</span>)}</div>
    </div>}
    <div className="roulette-betting">
      <div className="roulette-table-scroll"><div className="roulette-table" aria-label="Roulette betting table">
        <div className="roulette-zero">{numberButton(0)}</div>
        <div className="roulette-number-grid">{[3,2,1].flatMap((row) => Array.from({ length: 12 }, (_, col) => numberButton(col * 3 + row)))}</div>
        <div className="column-bets">{[3,2,1].map((n) => groupButton('column-' + n))}</div>
        <button type="button" className="table-tool table-undo" disabled={isLocked || !bets.length} onClick={undo} aria-label="Undo last chip"><Undo2 size={18} /></button>
        <div className="dozen-bets">{[1,2,3].map((n) => groupButton('dozen-' + n))}</div>
        <div className="outside-bets">{['low','even','red','black','odd','high'].map(groupButton)}</div>
        <button type="button" className="table-tool table-clear" disabled={isLocked || !bets.length} onClick={clear} aria-label="Clear bets"><RotateCcw size={18} /></button>
      </div></div>
    <div className="roulette-chip-row" role="group" aria-label="Bet amount, chip size, and spin">
      <span className="wager-total">{formatCredits(total)} <small>bet</small></span>
      <div className="roulette-chip-options" aria-label="Chip size">{chipSizes.map((size, i) => <button type="button" key={size} className={'casino-chip chip-' + i + (chip === size ? ' selected' : '')} disabled={isLocked} onClick={() => setChip(size)} aria-label={size + ' credit chip'} aria-pressed={chip === size}><ChipArtwork value={size} color={chipColors[i]} /></button>)}</div>
      <Button className="roulette-spin-button" variant="primary" onClick={play} disabled={isLocked || total < 10 || total > credits}>{spinning ? 'Spinning…' : 'Spin'}</Button>
    </div>
    </div>
  </div>;
}

