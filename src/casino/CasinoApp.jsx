import React, { Component, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Volume2, VolumeX, WalletCards, RotateCcw } from 'lucide-react';
import { CoinFlip } from './components/CoinFlip.jsx';
import { Roulette } from './components/Roulette.jsx';
import { Tower } from './components/Tower.jsx';
import { ChickenCross } from './components/ChickenCross.jsx';
import { WheelGame } from './components/WheelGame.jsx';
import { DoubleGame } from './components/DoubleGame.jsx';
import { CrashGame } from './components/CrashGame.jsx';
import { Button } from './components/ui.jsx';
import { WinPopup } from './components/WinPopup.jsx';
import { setCasinoMuted } from './logic/sound.js';
import { roundCredits } from './logic/roulette.js';
import { formatCredits, readCasinoState, STARTING_CREDITS, writeCasinoState } from './logic/storage.js';

const games = { roulette: 'Roulette', 'chicken-cross': 'Chicken Cross', tower: 'Tower', 'coin-flip': 'Coin Flip', wheel: 'Wheel', double: 'Double', crash: 'Crash' };

class CasinoErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Casino interface failed to render.', error); }
  render() {
    if (this.state.error) return <div className="casino-load-error" role="alert"><strong>Casino could not load.</strong><span>{this.state.error.message}</span></div>;
    return this.props.children;
  }
}

function CasinoApp() {
  const initial = useRef(readCasinoState()).current;
  const [credits, setCredits] = useState(initial.credits);
  const [history, setHistory] = useState(initial.history);
  const [muted, setMuted] = useState(initial.muted);
  const [locked, setLocked] = useState(false);
  const [activeGame, setActiveGame] = useState(games[location.hash.slice(1)] ? location.hash.slice(1) : 'roulette');
  const [win, setWin] = useState(null);
  const balanceRef = useRef(initial.credits);
  const lockRef = useRef(false);
  const accountMode = useRef(false);
  const walletReady = useRef(false);
  const serverRound = useRef(null);
  const serverBalance = useRef(null);
  const [walletError, setWalletError] = useState('');
  const [savedRound, setSavedRound] = useState(null);
  const [accountWallet, setAccountWallet] = useState(false);

  const api = async (path, body) => {
    const options = body ? { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) } : {};
    let response;
    for(let attempt=0;attempt<2;attempt++) {
      try { response=await fetch(path,{ credentials:'same-origin',...options,signal:AbortSignal.timeout(10000) });break; }
      catch(error) { if(attempt===1) throw error; }
    }
    const data=await response.json();
    if(!response.ok) { const error=new Error(data.error?.message || 'Your saved balance could not be loaded.');error.status=response.status;throw error; }
    return data;
  };
  useEffect(() => {
    api('/api/casino/state').then(data=> {
      accountMode.current=true;setAccountWallet(true);balanceRef.current=data.balance;setCredits(data.balance);
      if(data.activeRound) { serverRound.current=data.activeRound.id;setSavedRound(data.activeRound);lockRef.current=true;setLocked(true); }
      walletReady.current=true;
    }).catch(error=> {
      if(error.status===401) walletReady.current=true;
      else setWalletError('Saved credits could not load. Refresh to reconnect.');
    });
  }, []);
  const gameAction = async (action, options={}) => {
    if(!accountMode.current) return {demo:true};
    try {
      const data=await api('/api/casino/action',{action,options,roundId:serverRound.current,actionId:crypto.randomUUID()});
      serverBalance.current=data.balance;setWalletError('');return data;
    }catch(error) { setWalletError(error.message + ' Refresh to reconnect to your saved round.');return null; }
  };
  const resolveSavedRound = async action => {
    const data=await gameAction(action);
    if(!data) return;
    balanceRef.current=data.balance;setCredits(data.balance);setSavedRound(null);lockRef.current=false;setLocked(false);serverRound.current=null;
  };

  useEffect(() => {
    const handleRoute = (event) => {
      setActiveGame(games[event.detail?.page] ? event.detail.page : null); setWin(null);
    };
    window.addEventListener('casino:route', handleRoute);
    return () => window.removeEventListener('casino:route', handleRoute);
  }, []);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('casino:balance', { detail: { balance: credits, saved: accountWallet } }));
  }, [credits, accountWallet]);

  useEffect(() => {
    setCasinoMuted(muted);
    writeCasinoState({ credits: accountWallet ? initial.credits : credits, muted, history });
  }, [credits, muted, history, accountWallet]);

  useEffect(() => {
    if (!win) return;
    const timer = window.setTimeout(() => setWin(null), 3500);
    return () => window.clearTimeout(timer);
  }, [win]);

  const startRound = useCallback(async (stake, game, options={}) => {
    const amount = roundCredits(Number(stake));
    if (!walletReady.current || lockRef.current || !Number.isFinite(amount) || amount < 10 || amount > balanceRef.current) return null;
    lockRef.current = true;setLocked(true);setWin(null);
    if(accountMode.current) {
      try {
        const data=await api('/api/casino/action',{action:'start',game,stake:amount,options,actionId:crypto.randomUUID()});
        serverRound.current=data.round.id;serverBalance.current=data.balance;
        balanceRef.current=data.debitBalance;setCredits(data.debitBalance);setWalletError('');return data;
      }catch(error) { setWalletError(error.message);lockRef.current=false;setLocked(false);return null; }
    }
    balanceRef.current=roundCredits(balanceRef.current-amount);setCredits(balanceRef.current);return {demo:true};
  }, []);

  const finishRound = useCallback((record, returned) => {
    if (!lockRef.current) return;
    const payout = roundCredits(Math.max(0, Number(returned) || 0));
    balanceRef.current = accountMode.current ? serverBalance.current : roundCredits(balanceRef.current + payout);
    serverRound.current = null;
    setCredits(balanceRef.current);
    const id = crypto.randomUUID();
    setHistory((rounds) => [{ id, createdAt: Date.now(), ...record }, ...rounds].slice(0, 60));
    if (record.net > 0) setWin({ ...record, id, multiplier: payout / record.stake });
    lockRef.current = false;
    setLocked(false);
  }, []);

  const resetBank = () => {
    if (accountMode.current || lockRef.current || balanceRef.current >= 10) return;
    balanceRef.current = STARTING_CREDITS;
    setCredits(STARTING_CREDITS);
  };

  const props = { credits, locked, startRound, finishRound, gameAction };
  return <div className="casino-scope">
    <header className="casino-toolbar">
      <h1>{games[activeGame]}</h1>
      <div className="casino-tools">
        {credits < 10 && <button type="button" className="casino-icon-button" aria-label="Reset virtual credits" disabled={locked} onClick={resetBank}><RotateCcw size={17} /></button>}
        <button type="button" className="casino-icon-button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Enable sound' : 'Mute sound'} aria-pressed={muted}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <div className="casino-credit-balance" aria-label="Virtual credit balance"><WalletCards size={18} /><strong aria-live="polite">{formatCredits(credits)}</strong><span>{accountWallet ? 'credits' : 'demo credits'}</span></div>
      </div>
    </header>
    {walletError && <p className="casino-wallet-error" role="alert">{walletError}</p>}
    {savedRound && <div className="casino-saved-round"><span>Your {games[savedRound.game]} round is saved.</span><Button variant="primary" onClick={()=>resolveSavedRound('cashout')} disabled={!(savedRound.wins || savedRound.steps || savedRound.cleared || (savedRound.game === 'crash' && savedRound.multiplier > 1))}>Cash out saved round</Button><Button onClick={()=>resolveSavedRound('abandon')}>End round</Button></div>}
    <div className="casino-play-area">
      <section className={activeGame === 'roulette' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'roulette'}><Roulette {...props} /></section>
      <section className={activeGame === 'chicken-cross' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'chicken-cross'}><ChickenCross {...props} active={activeGame === 'chicken-cross'} /></section>
      <section className={activeGame === 'tower' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'tower'}><Tower {...props} active={activeGame === 'tower'} /></section>
      <section className={activeGame === 'coin-flip' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'coin-flip'}><CoinFlip {...props} active={activeGame === 'coin-flip'} /></section>
      <section className={activeGame === 'wheel' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'wheel'}><WheelGame {...props} /></section>
      <section className={activeGame === 'double' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'double'}><DoubleGame {...props} /></section>
      <section className={activeGame === 'crash' ? 'game-view' : 'hidden'} aria-hidden={activeGame !== 'crash'}><CrashGame {...props} active={activeGame === 'crash'} /></section>
      <WinPopup win={win?.game === activeGame ? win : null} />
    </div>
  </div>;
}

const mount = document.getElementById('casino-app');
if (mount) createRoot(mount).render(<CasinoErrorBoundary><CasinoApp /></CasinoErrorBoundary>);

