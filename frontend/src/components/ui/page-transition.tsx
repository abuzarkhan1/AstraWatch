/**
 * PageTransition — route-aware transition layer.
 *
 * Public pages (landing/auth): the signature blue curtain wipe.
 * Inside the authenticated app: no curtain — a thin route-progress bar sweeps
 * across the top while the page content animates in (see Layout's page-enter).
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { gsap } from '@/lib/gsap';

const AUTH_PATHS = [
  '/dashboard',
  '/incidents',
  '/healing',
  '/slo',
  '/topology',
  '/alerting',
  '/dashboards',
  '/logs',
  '/traces',
  '/catalog',
  '/status-page',
  '/runbooks',
  '/postmortems',
  '/synthetics',
  '/admin',
];

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const prevAuth = useRef(false);

  useEffect(() => {
    const path = location.pathname;
    const isAuth = isAuthPath(path);

    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevAuth.current = isAuth;
      return;
    }

    const overlay = overlayRef.current;
    const progress = progressRef.current;
    const insideAuthApp = prevAuth.current && isAuth;
    prevAuth.current = isAuth;

    // Navigation within the authenticated app — no blue curtain, just a thin
    // route-progress bar. Page content entrance is handled by Layout's
    // page-enter animation.
    if (insideAuthApp) {
      if (progress) {
        const tween = gsap.fromTo(
          progress,
          { scaleX: 0, transformOrigin: 'left center' },
          {
            scaleX: 1,
            transformOrigin: 'left center',
            duration: 0.35,
            ease: 'power2.inOut',
            onComplete: () => {
              gsap.to(progress, {
                scaleX: 0,
                transformOrigin: 'right center',
                duration: 0.35,
                ease: 'power2.in',
              });
            },
          }
        );
        return () => {
          tween.kill();
        };
      }
      return;
    }

    // Public pages (and crossing into/out of auth) — signature blue curtain wipe.
    if (overlay) {
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
    }
  }, [location.pathname]);

  return (
    <>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[10000] bg-blue-600 pointer-events-none scale-y-0"
        style={{ willChange: 'transform' }}
      />
      <div
        ref={progressRef}
        className="fixed top-0 left-0 right-0 z-[10001] h-0.5 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 scale-x-0 pointer-events-none"
        style={{ willChange: 'transform' }}
      />
      {children}
    </>
  );
}
