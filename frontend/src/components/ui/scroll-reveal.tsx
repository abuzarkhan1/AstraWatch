/**
 * ScrollReveal — GSAP ScrollTrigger-powered reveal wrapper.
 * Children animate in when they enter the viewport.
 * Supports: fade-up, fade-left, fade-right, scale-in presets.
 */
import React, { useRef, useEffect } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

type Preset = 'fade-up' | 'fade-left' | 'fade-right' | 'scale-in' | 'fade-in';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  preset?: Preset;
  delay?: number;       // seconds
  duration?: number;    // seconds
  stagger?: number;     // seconds (applies to direct children)
  once?: boolean;
  threshold?: number;   // 0-1
}

const PRESETS: Record<Preset, gsap.TweenVars> = {
  'fade-up':    { opacity: 0, y: 40 },
  'fade-left':  { opacity: 0, x: -40 },
  'fade-right': { opacity: 0, x: 40 },
  'scale-in':   { opacity: 0, scale: 0.92 },
  'fade-in':    { opacity: 0 },
};

export default function ScrollReveal({
  children,
  className = '',
  preset = 'fade-up',
  delay = 0,
  duration = 0.7,
  stagger,
  once = true,
  threshold = 0.15,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets = stagger
      ? Array.from(el.children) as HTMLElement[]
      : [el];

    const from = PRESETS[preset];

    // Set initial state
    gsap.set(targets, { ...from });

    const tween = gsap.to(targets, {
      opacity: 1,
      x: 0,
      y: 0,
      scale: 1,
      duration,
      delay,
      ease: 'power3.out',
      stagger: stagger ?? 0,
      scrollTrigger: {
        trigger: el,
        start: `top ${Math.round((1 - threshold) * 100)}%`,
        toggleActions: once
          ? 'play none none none'
          : 'play none none reverse',
      },
    });

    return () => {
      tween.kill();
      ScrollTrigger.getAll().forEach((st) => {
        if (st.trigger === el) st.kill();
      });
    };
  }, [preset, delay, duration, stagger, once, threshold]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
