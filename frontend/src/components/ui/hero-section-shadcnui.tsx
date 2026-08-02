import { Button } from "@/components/ui/button";
import MagneticButton from "@/components/ui/magnetic-button";
import { motion, type Variants } from "framer-motion";
import ArrowNarrowRightIcon from '@/components/ui/arrow-narrow-right-icon';
import SparklesIcon from '@/components/ui/sparkles-icon';

import { Link } from "react-router-dom";
import VerticalCutReveal from "@/components/ui/vertical-cut-reveal";
import NumberFlow from "@number-flow/react";

export function HeroSection() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: "easeOut" },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex min-h-[500px] flex-col items-center justify-center px-4 py-16 text-center text-white relative z-10"
    >


      <motion.div variants={itemVariants} className="mb-6">
        <VerticalCutReveal
          splitBy="words"
          staggerDuration={0.12}
          staggerFrom="first"
          reverse={true}
          containerClassName="justify-center text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white leading-tight"
          transition={{
            type: "spring",
            stiffness: 250,
            damping: 40,
          }}
        >
          Build Amazing Observability Systems
        </VerticalCutReveal>
      </motion.div>

      <motion.p
        variants={itemVariants}
        className="mb-8 max-w-2xl text-lg text-gray-300 font-light leading-relaxed"
      >
        Create stunning, real-time observability interfaces with zero-overhead eBPF kernel probes, Isolation Forest ML models, and automated K8s self-healing operators.
      </motion.p>

      <motion.div variants={itemVariants} className="flex flex-wrap items-center justify-center gap-4">
        <MagneticButton strength={0.3}>
          <Link to="/dashboard">
            <button className="gap-2 bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/80 border border-blue-500 text-white font-bold rounded-full px-8 py-3.5 text-sm hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer flex items-center">
              <span>Get Started</span>
              <ArrowNarrowRightIcon className="h-4 w-4" />
            </button>
          </Link>
        </MagneticButton>
        <MagneticButton strength={0.25}>
          <a href="#demo">
            <button className="rounded-full border border-neutral-700 bg-neutral-900 text-white hover:bg-neutral-800 px-8 py-3.5 text-sm font-medium transition-all cursor-pointer">
              View Demo
            </button>
          </a>
        </MagneticButton>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="mt-12 flex items-center gap-8 text-sm text-gray-400 font-mono"
      >
        <div>
          <div className="text-2xl font-bold text-white flex items-center justify-center">
            <NumberFlow value={10} className="font-bold text-white text-2xl" />M+
          </div>
          <div>Events / Sec Ingress</div>
        </div>
        <div className="h-8 w-px bg-neutral-800" />
        <div>
          <div className="text-2xl font-bold text-blue-400">&lt;0.32%</div>
          <div>CPU Overhead</div>
        </div>
        <div className="h-8 w-px bg-neutral-800" />
        <div>
          <div className="text-2xl font-bold text-emerald-400">
            1.4s
          </div>
          <div>Auto-Remediation MTTR</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
