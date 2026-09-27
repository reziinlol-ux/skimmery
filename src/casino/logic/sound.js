let audioContext;
let casinoMuted = false;

export function setCasinoMuted(value) { casinoMuted = Boolean(value); }
export function casinoSound(kind) { playCasinoSound(kind, casinoMuted); }

export function playCasinoSound(kind, muted) {
  if (muted || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    audioContext ||= new AudioContextClass();
    if (audioContext.state === 'suspended') void audioContext.resume();
    const notes = kind === 'win' ? [523.25, 659.25, 783.99, 1046.5, 1318.51] : kind === 'loss' ? [220, 165] : kind === 'spin' ? [330, 495] : [520];
    const start = audioContext.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const duration = kind === 'win' ? 0.28 : 0.16;
      const spacing = kind === 'spin' ? 0.09 : kind === 'win' ? 0.075 : 0.12;
      const time = start + index * spacing;
      oscillator.type = kind === 'loss' || kind === 'win' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(kind === 'win' ? 0.032 : 0.045, time + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(time); oscillator.stop(time + duration + 0.01);
    });
  } catch {}
}
