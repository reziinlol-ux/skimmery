import { useCallback, useEffect, useRef, useState } from 'react';

const positiveOrEmpty = (text) => text.trim() === '' ? null : Number(text);

export function useAutoRoll({ credits, active = true }) {
  const [mode, setMode] = useState('manual');
  const [onLoss, setOnLoss] = useState('0');
  const [onWin, setOnWin] = useState('0');
  const [stopOnLoss, setStopOnLoss] = useState('');
  const [stopOnProfit, setStopOnProfit] = useState('');
  const [numberOfBets, setNumberOfBets] = useState('10');
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [lastLimit, setLastLimit] = useState(10);
  const [net, setNet] = useState(0);
  const [error, setError] = useState('');
  const runRef = useRef(null);
  const timerRef = useRef(null);
  const creditsRef = useRef(credits);
  creditsRef.current = credits;

  const stop = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (runRef.current) runRef.current.running = false;
    setRunning(false);
  }, []);

  const start = useCallback((betText, setBetText, runner) => {
    const bet = Number(betText);
    const bets = Number(numberOfBets);
    const lossIncrease = Number(onLoss);
    const winIncrease = Number(onWin);
    const lossLimit = positiveOrEmpty(stopOnLoss);
    const profitLimit = positiveOrEmpty(stopOnProfit);
    if (!Number.isSafeInteger(bet) || bet < 10 || bet > creditsRef.current) return setError('Enter a valid bet amount.'), false;
    if (!Number.isInteger(bets) || bets < 1 || bets > 1000) return setError('Enter 1–1000 bets.'), false;
    if (!Number.isFinite(lossIncrease) || lossIncrease < 0 || lossIncrease > 1000 || !Number.isFinite(winIncrease) || winIncrease < 0 || winIncrease > 1000) return setError('Enter an increase from 0% to 1000%.'), false;
    if ((lossLimit !== null && (!Number.isFinite(lossLimit) || lossLimit <= 0)) || (profitLimit !== null && (!Number.isFinite(profitLimit) || profitLimit <= 0))) return setError('Enter a positive stop amount.'), false;
    if (runRef.current?.running) return false;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const run = { running: true, bet, setBetText, runner, completed: 0, net: 0, bets, lossIncrease, winIncrease, lossLimit, profitLimit };
    runRef.current = run;
    setCompleted(0); setNet(0); setLastLimit(bets); setError(''); setRunning(true);
    runner(bet);
    return true;
  }, [numberOfBets, onLoss, onWin, stopOnLoss, stopOnProfit]);

  const finish = useCallback((roundNet) => {
    const run = runRef.current;
    if (!run?.running || !Number.isFinite(Number(roundNet))) return;
    run.completed += 1;
    run.net += Number(roundNet);
    setCompleted(run.completed); setNet(run.net);
    const hitLoss = run.lossLimit !== null && run.net <= -run.lossLimit;
    const hitProfit = run.profitLimit !== null && run.net >= run.profitLimit;
    if (run.completed >= run.bets || hitLoss || hitProfit) { stop(); return; }
    const increase = Number(roundNet) < 0 ? run.lossIncrease : Number(roundNet) > 0 ? run.winIncrease : 0;
    const nextBet = Math.max(1, Math.round(run.bet * (1 + increase / 100)));
    if (nextBet < 10 || nextBet > creditsRef.current) {
      setError('Auto roll stopped: bet exceeds balance.');
      stop();
      return;
    }
    run.bet = nextBet;
    run.setBetText(String(nextBet));
    timerRef.current = window.setTimeout(() => {
      if (runRef.current?.running) run.runner(nextBet);
    }, 700);
  }, [stop]);

  useEffect(() => {
    if (!active && runRef.current?.running) stop();
  }, [active, stop]);
  useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  return { mode, setMode, onLoss, setOnLoss, onWin, setOnWin, stopOnLoss, setStopOnLoss, stopOnProfit, setStopOnProfit, numberOfBets, setNumberOfBets, running, completed, lastLimit, net, error, start, finish, stop };
}
