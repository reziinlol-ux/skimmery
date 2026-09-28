import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Button } from './ui.jsx';
import { Gem } from './GameArt.jsx';
import { createTower, revealTowerPick, TOWER_DIFFICULTIES, TOWER_FLOORS, towerCashout, towerMultiplier } from '../logic/tower.js';
import { casinoSound } from '../logic/sound.js';
import { formatCredits } from '../logic/storage.js';
import { GameModeHeader, AutoRollSettings } from './AutoRoll.jsx';
import { useAutoRoll } from '../useAutoRoll.js';

export function Tower({ credits, locked, startRound, finishRound, gameAction, active }) {
  const [difficulty, setDifficulty] = useState('easy');
  const [stakeText, setStakeText] = useState('10');
  const [floors, setFloors] = useState(null);
  const [cleared, setCleared] = useState(0);
  const [phase, setPhase] = useState('ready');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const roundStake = useRef(10);
  const reduced = useReducedMotion();
  const auto = useAutoRoll({ credits, active });
  const stake = Number(stakeText);
  const payout = towerCashout(roundStake.current, cleared, difficulty);

  useEffect(() => { if (!active && (phase === 'busted' || phase === 'cashed')) { setPhase('ready'); setFloors(null); setCleared(0); } }, [active, phase]);

  const start = async () => {
    if (locked || busyRef.current || !Number.isFinite(stake) || stake < 10 || stake > credits) return;
    busyRef.current = true;
    const round = await startRound(stake, 'tower', { difficulty });
    busyRef.current = false;
    if (!round) return;
    roundStake.current = stake;
    setFloors(round.demo ? createTower(difficulty) : round.round.floors); setCleared(0); setPhase('playing'); setBusy(false);
  };
  const finish = (won, steps = cleared) => {
    const returned = won ? towerCashout(roundStake.current, steps, difficulty) : 0;

    if (!won) setFloors((current) => current.map((floor) => ({ ...floor, revealed: true })));
    setPhase(won ? 'cashed' : 'busted'); busyRef.current = false; setBusy(false);
    casinoSound(won ? 'win' : 'loss');
    finishRound({ game: 'tower', summary: String(steps), stake: roundStake.current, net: returned - roundStake.current, won, payout: returned, difficulty, floors: steps }, returned);
    auto.finish(returned - roundStake.current);
  };
  const pick = async (floorIndex, tileIndex) => {
    if (phase !== 'playing' || busyRef.current || floorIndex !== cleared) return;
    busyRef.current = true; setBusy(true);
    const outcome = await gameAction('pick', { tile: tileIndex });
    if (!outcome) { busyRef.current = false; setBusy(false); return; }
    const selected = outcome.demo ? revealTowerPick(floors[floorIndex], tileIndex) : { ...outcome.round.floors[floorIndex], picked: tileIndex, safe: outcome.outcome.safe };
    if (!outcome.demo && outcome.completed) setFloors(outcome.round.floors);
    setFloors((current) => current.map((floor, index) => index === floorIndex ? { ...selected, revealed: true } : floor));
    casinoSound(selected.safe ? 'click' : 'loss');
    const steps = selected.safe ? cleared + 1 : cleared;
    if (selected.safe) setCleared(steps);
    window.setTimeout(() => {
      if (!selected.safe) finish(false, steps);
      else if (steps === TOWER_FLOORS) finish(true, steps);
      else { busyRef.current = false; setBusy(false); }
    }, reduced ? 30 : 520);
  };
  const cashout = async () => {
    if (phase !== 'playing' || busyRef.current || !cleared) return;
    busyRef.current = true; setBusy(true);
    const outcome = await gameAction('cashout');
    if (!outcome) { busyRef.current = false; setBusy(false); return; }
    finish(true);
  };

  const startAuto = () => auto.start(stakeText, setStakeText, async (amount) => {
    const round = await startRound(amount, 'tower', { difficulty });
    if (!round) { auto.stop(); return; }
    roundStake.current = amount;
    setFloors(round.demo ? createTower(difficulty) : round.round.floors); setCleared(0); setPhase('playing'); setBusy(false);
  });
  useEffect(() => {
    if (auto.running && auto.mode === 'auto' && phase === 'playing' && !busy && !busyRef.current) pick(cleared, Math.floor(Math.random() * 4));
  }, [auto.running, auto.mode, phase, busy, cleared]);

  return <div className="tower-game game-side-layout">
    <div className="game-controls side-control-panel tower-controls">
      <GameModeHeader label="TOWER" mode={auto.mode} onChange={auto.setMode} disabled={locked || busy || phase === 'playing' || auto.running} />
      <div className="difficulty-picker" role="group" aria-label="Difficulty">{Object.keys(TOWER_DIFFICULTIES).map((key) => <button key={key} type="button" className={difficulty === key ? 'selected' : ''} aria-pressed={difficulty === key} disabled={locked || busy || phase === 'playing' || auto.running} onClick={() => { setDifficulty(key); setFloors(null); setCleared(0); setPhase('ready'); }}>{TOWER_DIFFICULTIES[key].label}</button>)}</div>
      <label className="stake-field"><span>{auto.mode === 'auto' ? 'Bet amount' : 'Play amount'}</span><div className="stake-input-wrap"><input aria-label="Tower bet" type="number" min="10" step="1" value={stakeText} onChange={(event) => setStakeText(event.target.value)} disabled={locked || busy || phase === 'playing' || auto.running} /><span>CR</span></div></label>
      {auto.mode === 'auto' && <AutoRollSettings auto={auto} onStart={startAuto} disabled={auto.running} />}
      {phase === 'playing' ? <Button variant="primary" onClick={cashout} disabled={busy || auto.running || !cleared}>Cash out <span>{formatCredits(payout)} CR</span></Button> : auto.mode === 'manual' ? <Button variant="primary" onClick={start} disabled={locked || busy || !Number.isFinite(stake) || stake < 10 || stake > credits}>Bet</Button> : null}
      {phase === 'busted' && <span className="tower-round-status lost" role="status">Lost</span>}{phase === 'cashed' && <span className="tower-round-status won" role="status">Won</span>}
    </div>
    <div className="tower-scene game-scene-panel">
      <div className="tower-masonry" aria-hidden="true" />
      <div className="tower-grid" aria-label="Tower tiles">{Array.from({ length: TOWER_FLOORS }, (_, row) => {
        const index = TOWER_FLOORS - 1 - row, floor = floors?.[index];
        const current = phase === 'playing' && index === cleared;
        return <div key={index} className={'tower-row' + (current ? ' current' : '')}>{[0,1,2,3].map((tile) => {
          const picked = floor?.picked === tile;
          const revealed = Boolean(floor?.revealed && (phase === 'busted' || picked));
          const bomb = Boolean(revealed && (floor.bombTiles || []).includes(tile));
          const safe = revealed && !bomb;
          const clickable = current && !busy;
          const multiplier = towerMultiplier(difficulty, index + 1);
          return <motion.button key={tile} type="button" className={'tower-tile' + (clickable ? ' clickable' : '') + (revealed ? ' revealed' : '') + (picked ? ' picked' : '') + (picked && bomb ? ' busted' : '') + (picked && safe ? ' safe' : '')} disabled={!clickable} onClick={() => pick(index,tile)} aria-label={'Floor ' + (index + 1) + ', tile ' + (tile + 1) + (revealed ? bomb ? ', bomb' : ', safe' : '')} whileHover={clickable && !reduced ? { y: -2 } : undefined} whileTap={clickable ? { scale: .97 } : undefined}>
            {revealed && <motion.div className="tower-gem-content" initial={{ opacity: 0, scale: reduced ? 1 : .55 }} animate={{ opacity: picked ? 1 : bomb ? .75 : .3, scale: 1 }} transition={{ duration: .24 }}><Gem broken={bomb} />{picked && safe && <strong>×{multiplier.toFixed(2)}</strong>}</motion.div>}
          </motion.button>;
        })}</div>;
      })}</div>
    </div>
  </div>;
}

