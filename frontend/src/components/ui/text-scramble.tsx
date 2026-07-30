/**
 * TextScramble — GSAP TextPlugin-powered character scramble reveal.
 * Plays a randomised character scramble animation that resolves
 * into the target text. Triggers once when element enters viewport.
 */
import React, { useRef, useEffect } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

interface TextScrambleProps {
  text: string;
  className?: string;
  duration?: number;
  chars?: string;
  delay?: number;
  trigger?: boolean;
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&';

export default function TextScramble({
  text,
  className = '',
  duration = 1.2,
  chars = DEFAULT_CHARS,
  delay = 0,
  trigger = true,
}: TextScrambleProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.textContent = text;

    let frame = 0;
    let raf: number;
    const totalFrames = Math.round(duration * 60);
    const original = text.split('');

    const scramble = () => {
      const progress = frame / totalFrames;
      el.textContent = original
        .map((ch, i) => {
          if (ch === ' ') return ' ';
          if (i / original.length < progress) return ch;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join('');
      frame++;
      if (frame <= totalFrames) {
        raf = requestAnimationFrame(scramble);
      } else {
        el.textContent = text;
      }
    };

    const start = () => {
      frame = 0;
      cancelAnimationFrame(raf);
      setTimeout(scramble, delay * 1000);
    };

    if (trigger) {
      const st = ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: start,
      });
      return () => {
        st.kill();
        cancelAnimationFrame(raf);
      };
    } else {
      start();
      return () => cancelAnimationFrame(raf);
    }
  }, [text, duration, chars, delay, trigger]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
