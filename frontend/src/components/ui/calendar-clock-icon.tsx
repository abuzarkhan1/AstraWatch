import { forwardRef, useImperativeHandle, useCallback } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";
import { motion, useAnimate } from "motion/react";

const CalendarClockIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, color = "currentColor", strokeWidth = 2, className = "" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = useCallback(async () => {
      await animate(
        ".cc-hands",
        {
          rotate: 360,
        },
        { duration: 1, ease: "easeInOut" },
      );
    }, [animate]);

    const stop = useCallback(async () => {
      await animate(
        ".cc-hands",
        {
          rotate: 0,
        },
        { duration: 1, ease: "easeInOut" },
      );
    }, [animate]);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <motion.svg
        ref={scope}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`${className} cursor-pointer`}
        onHoverStart={start}
        onHoverEnd={stop}
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
        <motion.path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3" />
        <motion.path d="M4 7v11a2 2 0 0 0 2 2h5" />
        <motion.path d="M8 3v4" />
        <motion.path d="M16 3v4" />
        <motion.path d="M21 17a3 3 0 1 0 -6 0a3 3 0 0 0 6 0" />
        <motion.path d="M18 16v1.5l1 .5" className="cc-hands" />
      </motion.svg>
    );
  },
);

CalendarClockIcon.displayName = "CalendarClockIcon";
export default CalendarClockIcon;
