"use client";

import React, { useEffect, useId, useState } from "react";
import Particles, * as ParticlesModule from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

export function SparklesComp({
  className,
  size = 1,
  minSize = null,
  density = 800,
  speed = 1,
  minSpeed = null,
  opacity = 1,
  opacitySpeed = 3,
  minOpacity = null,
  color = "#FFFFFF",
  background = "transparent",
  options = {},
}: {
  className?: string;
  size?: number;
  minSize?: number | null;
  density?: number;
  speed?: number;
  minSpeed?: number | null;
  opacity?: number;
  opacitySpeed?: number;
  minOpacity?: number | null;
  color?: string;
  background?: string;
  options?: Record<string, any>;
  direction?: string;
}) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initEngine = (ParticlesModule as any).initParticlesEngine || (Particles as any).initParticlesEngine;
    if (initEngine) {
      initEngine(async (engine: any) => {
        await loadSlim(engine);
      }).then(() => {
        setIsReady(true);
      });
    } else {
      setIsReady(true);
    }
  }, []);

  const id = useId();

  const defaultOptions: any = {
    background: {
      color: {
        value: background,
      },
    },
    fullScreen: {
      enable: false,
      zIndex: 1,
    },
    fpsLimit: 120,
    particles: {
      color: {
        value: color,
      },
      move: {
        enable: true,
        direction: "none",
        speed: {
          min: minSpeed || speed / 10,
          max: speed,
        },
        straight: false,
      },
      number: {
        value: density,
      },
      opacity: {
        value: {
          min: minOpacity || opacity / 10,
          max: opacity,
        },
        animation: {
          enable: true,
          sync: false,
          speed: opacitySpeed,
        },
      },
      size: {
        value: {
          min: minSize || size / 2.5,
          max: size,
        },
      },
    },
    detectRetina: true,
  };

  if (!isReady) return null;

  return (
    <Particles
      id={id}
      options={{ ...defaultOptions, ...options }}
      className={className}
    />
  );
}

export { SparklesComp as Sparkles };
export default SparklesComp;
