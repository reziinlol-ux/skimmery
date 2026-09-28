import React from 'react';

export function GameModeHeader({ label, mode, onChange, disabled = false }) {
  return <div className="game-panel-heading game-panel-heading-compact">
    <div className="game-mode-picker" role="group" aria-label={`${label} play mode`}>
      {['manual', 'auto'].map((option) => <button key={option} type="button" aria-pressed={mode === option} className={mode === option ? 'selected' : ''} disabled={disabled} onClick={() => onChange(option)}>{option === 'auto' ? 'Auto' : 'Manual'}</button>)}
    </div>
  </div>;
}

function NumberSetting({ label, value, onChange, min = 0, max, step = '1', suffix, placeholder = '0', prefix, disabled = false }) {
  return <label className="auto-roll-setting">
    <span>{label}</span>
    <div className="auto-roll-input">
      {prefix && <span>{prefix}</span>}
      <input type="number" min={min} max={max} step={step} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
      {suffix && <span>{suffix}</span>}
    </div>
  </label>;
}

export function AutoRollSettings({ auto, onStart, disabled = false, canStart = true }) {
  return <div className="auto-roll-settings">
    <div className="auto-roll-increases">
      <NumberSetting label="On loss" prefix="Increase by" suffix="%" step="0.1" value={auto.onLoss} onChange={auto.setOnLoss} disabled={disabled} />
      <NumberSetting label="On win" prefix="Increase by" suffix="%" step="0.1" value={auto.onWin} onChange={auto.setOnWin} disabled={disabled} />
    </div>
    <div className="auto-roll-stops">
      <NumberSetting label="Stop on loss" suffix="CR" value={auto.stopOnLoss} onChange={auto.setStopOnLoss} placeholder="Off" disabled={disabled} />
      <NumberSetting label="Stop on profit" suffix="CR" value={auto.stopOnProfit} onChange={auto.setStopOnProfit} placeholder="Off" disabled={disabled} />
      <NumberSetting label="Number of bets" min={1} max={1000} value={auto.numberOfBets} onChange={auto.setNumberOfBets} placeholder="10" disabled={disabled} />
    </div>
    {auto.error && <span className="auto-roll-error" role="alert">{auto.error}</span>}
    {auto.completed > 0 && <span className="auto-roll-progress" aria-live="polite">{auto.completed} / {auto.lastLimit} bets · {auto.net >= 0 ? '+' : ''}{auto.net.toLocaleString()} CR</span>}
    <button type="button" className="auto-roll-action" onClick={auto.running ? auto.stop : onStart} disabled={(disabled && !auto.running) || (!auto.running && !canStart)}>{auto.running ? 'Stop' : 'Start auto roll'}</button>
  </div>;
}
