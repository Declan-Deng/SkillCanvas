"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type PointerEvent } from "react";

/** Small feedback glow; pointer tracking stays outside React rendering. */
export function StartButton({ children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const spot = useRef<HTMLSpanElement>(null);
  const frame = useRef(0);
  const motion = useRef({ x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, time: 0 });
  const stop = () => { cancelAnimationFrame(frame.current); frame.current = 0; };
  useEffect(() => { if (disabled) stop(); return stop; }, [disabled]);
  const track = (event: PointerEvent<HTMLButtonElement>, entering = false) => {
    if (disabled || event.pointerType === "touch"
      || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const state = motion.current;
    state.tx = (event.clientX - bounds.left) * event.currentTarget.offsetWidth / bounds.width - 70;
    state.ty = (event.clientY - bounds.top) * event.currentTarget.offsetHeight / bounds.height - 70;
    if (entering) { stop(); state.x = state.tx; state.y = state.ty; state.vx = state.vy = 0; }
    const paint = () => { if (spot.current) spot.current.style.transform = `translate(${state.x}px, ${state.y}px)`; };
    paint();
    if (frame.current) return;
    state.time = performance.now();
    const tick = (now: number) => {
      // Run the same spring at 2.5x speed: 60% less following time.
      const elapsed = Math.min((now - state.time) / 1000, 1 / 30) / 0.4;
      state.time = now;
      // Small integration steps keep the faster spring stable across refresh rates.
      const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
      const dt = elapsed / steps;
      for (let step = 0; step < steps; step++) {
        state.vx += (100 * (state.tx - state.x) - 10 * state.vx) * dt;
        state.vy += (100 * (state.ty - state.y) - 10 * state.vy) * dt;
        state.x += state.vx * dt; state.y += state.vy * dt;
      }
      paint();
      if (Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) + Math.abs(state.vx) + Math.abs(state.vy) < 0.1) {
        frame.current = 0;
      } else frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };
  return <button {...props} disabled={disabled} className="primary-button start-button"
    onPointerEnter={(event) => track(event, true)} onPointerMove={(event) => track(event)} onPointerLeave={stop} onPointerCancel={stop}>
    <span className="start-button-light" aria-hidden="true"><span ref={spot} className="start-button-spot" /></span>
    <span className="start-button-label">{children}</span>
  </button>;
}
