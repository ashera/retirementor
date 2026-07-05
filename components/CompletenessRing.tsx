"use client";

import { useEffect, useRef, useState } from "react";

/** Tween a number toward `target` (skips the first render so it doesn't count up
 *  from 0 on mount). Uses the rAF timestamp — no Date.now/performance.now. */
function useCountUp(target: number, ms = 550) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

/** Circular "how complete is your plan" meter with a dead-centred number that
 *  gently counts up as it changes. `size` in px (header 44, hub 88, chip ~30). */
export default function CompletenessRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const display = useCountUp(pct);
  const big = size >= 80;
  const stroke = size >= 80 ? 7 : size >= 40 ? 4 : 3;
  const r = (size - stroke) / 2 - 1;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(100, display)) / 100);
  const c = size / 2;
  const fontClass = big ? "text-[30px]" : size >= 40 ? "text-[11px]" : "text-[10px]";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Plan ${pct}% complete`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#232c40" strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="#34d399" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center leading-none">
        <span className={`font-bold tabular-nums text-white ${fontClass}`}>{display}</span>
      </div>
    </div>
  );
}
