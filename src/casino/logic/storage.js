export const STARTING_CREDITS = 100000;
const STORAGE_KEY = 'gorilla-tag-casino-v1';

export function readCasinoState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const bonusGranted = localStorage.getItem('gorilla-tag-casino-testing-credit-grant-v1') === '1';
    if (saved && Number.isFinite(saved.credits) && saved.credits >= 0) {
      const credits = bonusGranted ? saved.credits : Math.max(saved.credits, 100000);
      if (!bonusGranted) localStorage.setItem('gorilla-tag-casino-testing-credit-grant-v1', '1');
      return {
        credits: Math.round(credits * 100) / 100,
        muted: Boolean(saved.muted),
        history: Array.isArray(saved.history) ? saved.history.slice(0, 60) : [],
      };
    }
  } catch {}
  try { localStorage.setItem('gorilla-tag-casino-testing-credit-grant-v1', '1'); } catch {}
  return { credits: STARTING_CREDITS, muted: false, history: [] };
}

export function writeCasinoState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function makeRoundRecord(round) {
  return { id: crypto.randomUUID(), createdAt: Date.now(), ...round };
}

export function formatCredits(amount) {
  return Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });
}
