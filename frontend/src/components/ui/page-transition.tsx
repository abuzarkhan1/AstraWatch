/**
 * PageTransition — GSAP curtain wipe transition for page/route changes.
 */
import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap } from '@/lib/gsap';

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const overlay = overlayRef.current;
    if (!overlay) return;

    const tl = gsap.timeline();
    tl.to(overlay, {
      scaleY: 1,
      transformOrigin: 'bottom center',
      duration: 0.35,
      ease: 'power3.inOut',
    }).to(overlay, {
      scaleY: 0,
      transformOrigin: 'top center',
      duration: 0.45,
      ease: 'power3.inOut',
      delay: 0.05,
    });

    return () => {
      tl.kill();
    };
  }, [location.pathname]);

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[10000] bg-blue-600 pointer-events-none scale-y-0"
        style={{ willChange: 'transform' }}
      />
      {children}
    </>
  );
}
