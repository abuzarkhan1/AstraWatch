/**
 * CustomCursor — A smooth dual-ring cursor:
 * - Small dot that snaps instantly to mouse
 * - Larger ring that follows with lerp lag
 * - Expands on hoverable elements
 * - Hides the native OS cursor on the page
 */
import React, { useEffect, useRef } from 'react';
import { gsap } from '@/lib/gsap';

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    // Hide native cursor globally
    document.documentElement.style.cursor = 'none';

    let mouseX = window.innerWidth  / 2;
    let mouseY = window.innerHeight / 2;
    let ringX  = mouseX;
    let ringY  = mouseY;

    // Dot snaps instantly
    const onMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      gsap.set(dot, { x: mouseX - 4, y: mouseY - 4 });
    };
    window.addEventListener('mousemove', onMove);

    // Ring lerps behind
    const ticker = gsap.ticker.add(() => {
      ringX += (mouseX - ringX) * 0.12;
      ringY += (mouseY - ringY) * 0.12;
      gsap.set(ring, { x: ringX - 20, y: ringY - 20 });
    });

    // Grow ring on interactive elements
    const onEnter = () => {
      gsap.to(ring, { scale: 2.2, opacity: 0.5, duration: 0.25, ease: 'power2.out' });
      gsap.to(dot,  { scale: 0,   opacity: 0,   duration: 0.2 });
    };
    const onLeave = () => {
      gsap.to(ring, { scale: 1,   opacity: 1,   duration: 0.25, ease: 'power2.out' });
      gsap.to(dot,  { scale: 1,   opacity: 1,   duration: 0.2 });
    };

    const addListeners = () => {
      document.querySelectorAll('a, button, [role="button"], input, textarea, select, label').forEach((el) => {
        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeave);
      });
    };
    addListeners();

    // Re-attach on DOM changes (dynamic content)
    const observer = new MutationObserver(addListeners);
    observer.observe(document.body, { childList: true, subtree: true });

    // Hide on leave, show on enter
    const onOut = () => gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
    const onIn  = () => gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
    document.addEventListener('mouseleave', onOut);
    document.addEventListener('mouseenter', onIn);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onOut);
      document.removeEventListener('mouseenter', onIn);
      gsap.ticker.remove(ticker);
      observer.disconnect();
      document.documentElement.style.cursor = '';
    };
  }, []);

  return (
    <>
      {/* Dot */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 z-[9999] w-2 h-2 rounded-full bg-blue-500 pointer-events-none mix-blend-difference"
        style={{ willChange: 'transform' }}
      />
      {/* Ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 z-[9998] w-10 h-10 rounded-full border border-blue-400/70 pointer-events-none"
        style={{ willChange: 'transform' }}
      />
    </>
  );
}
