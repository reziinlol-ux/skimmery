import React from 'react';
import { Check, Clock3, History, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui.jsx';
import { formatCredits } from '../logic/storage.js';

const gameName = { roulette: 'Roulette', tower: 'Tower', coinflip: 'Coin Flip', 'coin-flip': 'Coin Flip', 'chicken-cross': 'Chicken Cross', wheel: 'Wheel', double: 'Double', crash: 'Crash' };

export function HistoryList({ rows }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="space-y-1"><CardTitle className="flex items-center gap-2"><History size={16} className="text-white/40" /> Recent rounds</CardTitle><CardDescription>Latest results across your games.</CardDescription></div>
        <span className="rounded-full border border-white/[.07] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-white/40">{rows.length} / 60</span>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length ? <div className="divide-y divide-white/[.055]">
          {rows.slice(0, 8).map((round) => (
            <div key={round.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-5 py-3 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
                  {round.won ? <Check size={13} className="text-emerald-300" /> : <X size={13} className="text-rose-300" />}
                  <span>{gameName[round.game]}</span>
                  <span className="truncate font-normal text-white/35">{round.summary}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/35"><Clock3 size={11} />{new Date(round.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}<span>·</span>{formatCredits(round.stake)} bet</div>
              </div>
              <strong className={`text-xs tabular-nums ${round.net >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{round.net > 0 ? '+' : ''}{formatCredits(round.net)}</strong>
            </div>
          ))}
        </div> : <div className="flex min-h-24 items-center justify-center px-5 text-xs text-white/35">No rounds yet</div>}
      </CardContent>
    </Card>
  );
}
