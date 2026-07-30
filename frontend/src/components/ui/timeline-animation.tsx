"use client";

import React from "react";
import { motion } from "framer-motion";

export interface TimelineContentProps {
  animationNum?: number;
  timelineRef?: React.RefObject<HTMLDivElement | null>;
  customVariants?: any;
  className?: string;
  as?: any;
  children?: React.ReactNode;
}

export function TimelineContent({
  animationNum = 0,
  timelineRef,
  customVariants,
  className,
  as: Component = "div",
  children,
  ...props
}: TimelineContentProps) {
  const MotionComponent = motion.create
    ? motion.create(Component as keyof React.JSX.IntrinsicElements)
    : (motion as any)[Component] || motion.div;

  return (
    <MotionComponent
      custom={animationNum}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={customVariants}
      className={className}
      {...props}
    >
      {children}
    </MotionComponent>
  );
}
