import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  Brain, 
  ShieldAlert, 
  Database, 
  CheckCircle2, 
  RefreshCcw,
  Activity,
  ArrowUpRight,
  Radio,
  Sparkles
} from 'lucide-react';
import VerticalCutReveal from "@/components/ui/vertical-cut-reveal";
import NumberFlow from "@number-flow/react";
import { Link } from "react-router-dom";

export default function FeaturesSection() {
  const [activeTab, setActiveTab] = useState<'topology' | 'ebpf'>('topology');
  const [anomalyActive, setAnomalyActive] = useState(false);
  const [isHealing, setIsHealing] = useState(false);

  const handleTriggerHeal = () => {
    setIsHealing(true);
    setTimeout(() => {
      setIsHealing(false);
      setAnomalyActive(false);
    }, 1600);
  };

  const anomalyScore = anomalyActive ? 0.94 : 0.04;
  const isoScore = anomalyActive ? 0.92 : 0.02;

  return (
    <section id="features" className="py-28 md:py-36 bg-black relative border-b border-white/10 text-white font-sans overflow-hidden">
      
      {/* Dynamic Background Glowing Light Orbs for Glassmorphism Reflections */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(49,49,245,0.22),transparent_100%)] pointer-events-none blur-3xl" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-[radial-gradient(circle_at_center,rgba(32,108,232,0.18),transparent_70%)] pointer-events-none blur-2xl" />
      <div className="absolute top-20 right-10 w-96 h-96 bg-[radial-gradient(circle_at_center,rgba(147,51,234,0.12),transparent_70%)] pointer-events-none blur-2xl" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">


          <h2 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-white leading-tight">
            <VerticalCutReveal
              splitBy="words"
              staggerDuration={0.12}
              staggerFrom="first"
              reverse={true}
              containerClassName="justify-center font-bold tracking-tight text-white"
              transition={{
                type: "spring",
                stiffness: 250,
                damping: 40,
              }}
            >
              Next-Generation Observability
            </VerticalCutReveal>
          </h2>

          <p className="text-gray-300 text-base sm:text-xl font-light max-w-xl mx-auto leading-relaxed">
            Kernel-level eBPF probes. Zero sidecars. Sub-second auto-healing.
          </p>
        </div>

        {/* GLASSMORPHISM 4-BENTO GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          
          {/* GLASS CARD 1 (Featured 2-Span): Live Kernel Topology & eBPF Engine */}
          <motion.div 
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
            className="md:col-span-2 backdrop-blur-2xl bg-white/[0.03] border border-white/15 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] transition-all duration-300"
          >
            {/* Ambient Inner Glass Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none group-hover:bg-blue-600/20 transition-all" />

            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3.5">
                  <div className="h-13 w-13 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 backdrop-blur-md flex items-center justify-center text-blue-400 shadow-lg shadow-blue-900/30">
                    <Cpu className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">
                      Zero-Overhead eBPF Probes
                    </h3>
                    <p className="text-xs text-blue-400/90 font-mono mt-0.5">Kernel CO-RE RingBuffer Probes</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 backdrop-blur-md bg-blue-500/10 border border-blue-500/40 px-3.5 py-1.5 rounded-full">
                  <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  <span className="text-xs font-bold font-mono text-blue-300">&lt;0.32% CPU Overhead</span>
                </div>
              </div>

              {/* Glass Module Tabs */}
              <div className="flex items-center gap-2 bg-black/60 p-1.5 rounded-2xl border border-white/10 mb-6 backdrop-blur-md w-fit">
                <button
                  onClick={() => setActiveTab('topology')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'topology'
                      ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-800/80 border border-blue-500'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Live TCP Topology
                </button>
                <button
                  onClick={() => setActiveTab('ebpf')}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'ebpf'
                      ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-800/80 border border-blue-500'
                      : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Zero-Sidecar Specs
                </button>
              </div>

              {/* Tab 1: Topology Visualizer */}
              {activeTab === 'topology' && (
                <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-2xl p-5 font-mono text-xs space-y-4">
                  <div className="flex items-center justify-between text-gray-400 pb-2 border-b border-white/10">
                    <span className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-blue-400 animate-pulse" />
                      Microservice Socket Topology Flow
                    </span>
                    <span className="text-emerald-400 font-bold">14.8M ops/sec</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-gray-400 block">GATEWAY</span>
                      <p className="font-bold text-white mt-1">ingress-nginx</p>
                      <p className="text-[11px] text-blue-400 mt-0.5">0.12ms</p>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/40 rounded-xl p-3 text-center shadow-lg shadow-blue-900/20">
                      <span className="text-[10px] text-blue-300 block font-bold">TARGET</span>
                      <p className="font-bold text-white mt-1">payment-api</p>
                      <p className="text-[11px] text-emerald-400 mt-0.5">0.42ms (p99)</p>
                    </div>

                    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-center">
                      <span className="text-[10px] text-gray-400 block">IN-MEMORY</span>
                      <p className="font-bold text-white mt-1">redis-cache</p>
                      <p className="text-[11px] text-blue-400 mt-0.5">0.08ms</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Zero-Sidecar Specs */}
              {activeTab === 'ebpf' && (
                <div className="grid sm:grid-cols-3 gap-3 my-4">
                  <div className="backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                    <CheckCircle2 className="h-5 w-5 text-blue-400 mb-2" />
                    <h4 className="text-sm font-bold text-white">No Sidecars</h4>
                    <p className="text-xs text-gray-400 mt-1">Direct kernel tracepoint hooks.</p>
                  </div>
                  <div className="backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                    <CheckCircle2 className="h-5 w-5 text-blue-400 mb-2" />
                    <h4 className="text-sm font-bold text-white">Zero Code Edit</h4>
                    <p className="text-xs text-gray-400 mt-1">Universal CO-RE binary.</p>
                  </div>
                  <div className="backdrop-blur-xl bg-black/60 border border-white/10 rounded-2xl p-4 flex flex-col justify-between">
                    <CheckCircle2 className="h-5 w-5 text-blue-400 mb-2" />
                    <h4 className="text-sm font-bold text-white">Sub-ms Latency</h4>
                    <p className="text-xs text-gray-400 mt-1">Microsecond RTT accuracy.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-gray-300">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <span className="font-mono text-gray-400">RingBuffer: <strong className="text-white">64MB CO-RE</strong></span>
              </div>

              <Link to="/dashboard">
                <button className="px-5 py-2.5 rounded-2xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-800/80 border border-blue-500 cursor-pointer">
                  <span>Explore Kernel Engine</span>
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </motion.div>

          {/* GLASS CARD 2: Multi-Model ML Anomaly Radar */}
          <motion.div 
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
            className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] transition-all duration-300"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-md">
                  <Brain className="h-6 w-6" />
                </div>
                <span className="px-3 py-1 rounded-full backdrop-blur-md bg-blue-500/10 text-blue-300 font-mono text-[11px] font-bold border border-blue-500/30">
                  Ensemble ML
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-1 tracking-tight">
                ML Anomaly Radar
              </h3>
              <p className="text-gray-300 text-xs font-light mb-6">
                Isolation Forest & Z-Score anomaly engine.
              </p>
            </div>

            {/* Radial Anomaly Score Gauge */}
            <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-2xl p-5 font-mono space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Confidence Score</span>
                <span className={`text-lg font-bold ${anomalyActive ? 'text-red-400' : 'text-blue-400'}`}>
                  <NumberFlow value={anomalyScore} format={{ maximumFractionDigits: 2 }} />
                </span>
              </div>

              <div className="w-full bg-black h-2.5 rounded-full overflow-hidden p-0.5 border border-white/10">
                <motion.div
                  className={`h-full rounded-full ${anomalyActive ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.8)]' : 'bg-gradient-to-r from-blue-500 to-blue-400 shadow-[0_0_12px_rgba(49,49,245,0.8)]'}`}
                  animate={{ width: `${anomalyScore * 100}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                />
              </div>

              <div className="pt-2 border-t border-white/10 flex justify-between text-[11px] text-gray-400">
                <span>IsoForest: <strong className="text-white">{isoScore.toFixed(2)}</strong></span>
                <span>Z-Score: <strong className="text-white">{anomalyActive ? '0.88' : '0.05'}</strong></span>
              </div>

              <button
                onClick={() => setAnomalyActive(!anomalyActive)}
                className="w-full py-2.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-sans text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-blue-800/80 border border-blue-500"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                <span>{anomalyActive ? 'Reset Baseline' : 'Simulate CPU Spike'}</span>
              </button>
            </div>
          </motion.div>

          {/* GLASS CARD 3: Autonomous K8s Self-Healing */}
          <motion.div 
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
            className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] transition-all duration-300"
          >
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-md">
                  <ShieldAlert className="h-6 w-6" />
                </div>
                <span className="px-3 py-1 rounded-full backdrop-blur-md bg-emerald-500/10 text-emerald-300 font-mono text-[11px] font-bold border border-emerald-500/30">
                  1.4s MTTR
                </span>
              </div>

              <h3 className="text-xl font-bold text-white mb-1 tracking-tight">
                K8s Auto-Healing
              </h3>
              <p className="text-gray-300 text-xs font-light mb-6">
                Automated pod restarts & canary rollbacks.
              </p>
            </div>

            <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-2xl p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between text-gray-300">
                <span>Blast Radius Limit:</span>
                <span className="text-blue-300 font-bold backdrop-blur-md bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                  10% max/hr
                </span>
              </div>

              <div className="flex items-center justify-between text-gray-300">
                <span>Idempotency Lock:</span>
                <span className="text-emerald-400 font-bold">Verified Active</span>
              </div>

              <button
                onClick={handleTriggerHeal}
                disabled={isHealing}
                className="w-full py-2.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-sans text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-blue-800/80 border border-blue-500 disabled:opacity-50"
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${isHealing ? 'animate-spin' : ''}`} />
                <span>{isHealing ? 'Remediating Pod...' : 'Test Auto-Healing'}</span>
              </button>
            </div>
          </motion.div>

          {/* GLASS CARD 4 (Featured 2-Span): ClickHouse Columnar Analytics Engine */}
          <motion.div 
            whileHover={{ y: -4 }}
            transition={{ duration: 0.3 }}
            className="md:col-span-2 backdrop-blur-2xl bg-white/[0.03] border border-white/15 hover:border-blue-500/60 rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden group shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] transition-all duration-300"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3.5">
                <div className="h-13 w-13 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 backdrop-blur-md flex items-center justify-center text-blue-400 shadow-lg shadow-blue-900/30">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">
                    ClickHouse Columnar Storage
                  </h3>
                  <p className="text-xs text-blue-400/90 font-mono mt-0.5">Zero Log Ingestion Tax • Sub-Second Analytics</p>
                </div>
              </div>

              <span className="px-3.5 py-1.5 rounded-full backdrop-blur-md bg-blue-500/10 text-blue-300 font-mono text-xs font-bold border border-blue-500/30 w-fit">
                Zero Log Tax
              </span>
            </div>

            <div className="backdrop-blur-xl bg-black/70 border border-white/10 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-6 font-mono text-xs">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase tracking-wider">P99 Query Latency</span>
                  <span className="text-xl font-bold text-emerald-400">14ms</span>
                </div>
                <div className="h-10 w-px bg-white/10" />
                <div>
                  <span className="text-[10px] text-gray-400 block uppercase tracking-wider">Compression</span>
                  <span className="text-xl font-bold text-blue-400">12.4x</span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-gray-400 block uppercase tracking-wider">Deployment Model</span>
                <span className="text-sm font-bold text-white font-sans">100% On-Premise VPC Safe</span>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
