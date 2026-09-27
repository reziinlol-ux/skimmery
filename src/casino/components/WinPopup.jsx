import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { formatCredits } from '../logic/storage.js';

export function WinPopup({ win }) {
  const reduced = useReducedMotion();
  return <AnimatePresence>{win && <motion.div key={win.id} className="win-popup-wrap" role="status" initial={{ opacity: 0, scale: reduced ? 1 : .86, y: reduced ? 0 : 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .95 }} transition={{ duration: .24, ease: [.22, 1, .36, 1] }}>
    <div className="win-popup"><strong>{win.multiplier.toFixed(2)}×</strong><span>+{formatCredits(win.net)} credits</span></div>
  </motion.div>}</AnimatePresence>;
}

