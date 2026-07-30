import React, { useState, useEffect } from 'react';
import MagneticButton from '@/components/ui/magnetic-button';
import { motion, AnimatePresence } from 'framer-motion';
import VerticalCutReveal from '@/components/ui/vertical-cut-reveal';
import { Badge } from '@/components/ui/badge';
import {
  Cpu,
  Server,
  Database,
  Brain,
  Workflow,
  ShieldCheck,
  ArrowRight,
  Play,
  Pause,
  Zap,
  Activity,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface PipelineStep {
  step: string;
  title: string;
  headline: string;
  tech: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  highlights: { title: string; desc: string; metric: string }[];
  liveStatus: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    step: '01',
    title: 'Kernel Telemetry',
    headline: 'Zero-Code eBPF Kernel Probes',
    tech: 'Kernel Socket Tracepoints & RingBuffer',
    badge: '<0.32% CPU Overhead',
    icon: Cpu,
    desc: 'Capture instant TCP latency, HTTP/gRPC traces, and CPU bottlenecks directly at Linux kernel socket tracepoints without modifying a single line of code or injecting heavy sidecar proxies.',
    highlights: [
      { title: 'Zero Sidecars Needed', desc: 'No Envoy or proxy sidecars consuming cluster RAM', metric: '0MB Sidecar RAM' },
      { title: 'Kernel RingBuffer Output', desc: 'Lockless event streaming directly from kernel space', metric: 'Sub-0.1ms Capture' },
      { title: 'Auto-Protocol Discovery', desc: 'Instant L4/L7 protocol detection for HTTP, gRPC, and SQL', metric: '100% Auto-Discovered' },
    ],
    liveStatus: 'Active Kernel Probes: 1,024 Nodes Hooked',
  },
  {
    step: '02',
    title: 'Real-Time Ingestion',
    headline: 'Sub-Millisecond Event Streaming',
    tech: 'High-Throughput gRPC & Topic Fan-Out',
    badge: '10M+ Events / Sec',
    icon: Server,
    desc: 'High-throughput stream ingestion pipeline designed to ingest tens of millions of telemetry metrics per second with zero log ingestion tax and instant fan-out.',
    highlights: [
      { title: 'Zero Log Ingestion Tax', desc: 'Flat-rate node pricing with no per-gigabyte surprises', metric: '$0 Log Tax' },
      { title: 'gRPC Stream Engine', desc: 'Zero-allocation memory batching for petabyte scale', metric: '10M+ Evt/Sec' },
      { title: 'Backpressure Protection', desc: 'Automatic rate-limiting protects downstream databases', metric: '99.999% Ingestion SLA' },
    ],
    liveStatus: 'Ingestion Pipeline Rate: 12.4M Events/Sec',
  },
  {
    step: '03',
    title: 'Columnar Storage',
    headline: 'Sub-Second ClickHouse Analytics',
    tech: 'MergeTree Columnar DB Engine',
    badge: 'Sub-Second Queries',
    icon: Database,
    desc: 'High-density compressed columnar database storing logs, traces, and metrics with sub-second aggregate query execution across petabyte-scale clusters.',
    highlights: [
      { title: 'Sub-Second Aggregations', desc: 'Scan billions of rows in under 20ms for instant dashboards', metric: '<20ms Query Time' },
      { title: '10x Data Compression', desc: 'High-density MergeTree columnar storage reduces disk costs', metric: '90% Storage Saved' },
      { title: 'OpenTelemetry Native', desc: 'Exports standard OTLP metrics directly to Grafana & Prometheus', metric: '100% OTLP Compatible' },
    ],
    liveStatus: 'ClickHouse Query Latency: 14ms (Scanned 4.2M Rows)',
  },
  {
    step: '04',
    title: 'ML Anomaly Engine',
    headline: 'Ensemble Isolation Forest Engine',
    tech: 'FastAPI & Isolation Forest Models',
    badge: '<15ms Inference',
    icon: Brain,
    desc: 'Multi-dimensional anomaly detection evaluating telemetry across 12 feature dimensions simultaneously with dynamic Z-score and Isolation Forest ML models.',
    highlights: [
      { title: 'Zero Noise Alerts', desc: '85%+ confidence thresholding eliminates false positive fatigue', metric: '85% Confidence Cap' },
      { title: 'EWMA Latency Drift', desc: 'Detects subtle latency degradation before full outages occur', metric: 'Sub-Second Detection' },
      { title: 'Causal Root Cause', desc: 'Maps metric anomalies directly to source Kubernetes pods', metric: 'Automated Root Cause' },
    ],
    liveStatus: 'ML Ensemble Confidence: 94.2% (No False Positives)',
  },
  {
    step: '05',
    title: 'Autonomous Healing',
    headline: 'Kubernetes Auto-Remediation Operator',
    tech: 'Spring Boot & Safety-Bounded CRDs',
    badge: '1.4s Auto-Healing',
    icon: Workflow,
    desc: 'Kubernetes operator executing automated remediation rules (pod restarts, traffic cordoning, image rollbacks) with strict safety bounds and idempotency locks.',
    highlights: [
      { title: 'Blast-Radius Caps', desc: 'Configurable caps limit maximum pod restarts per hour', metric: 'Max 10% Restart Cap' },
      { title: 'Canary Verification', desc: 'Validates cluster health automatically after remediation', metric: '1.4s Total MTTR' },
      { title: 'Idempotency Locks', desc: 'PostgreSQL distributed locks prevent cascading restart loops', metric: 'Zero Loop Risk' },
    ],
    liveStatus: 'K8s Operator Status: Auto-Remediated Pod payment-api-7d9f in 1.4s',
  },
  {
    step: '06',
    title: 'Continuous Compliance',
    headline: 'Enterprise Audit & Private VPC Boundary',
    tech: 'SOC2 Type II & Multi-Window SLOs',
    badge: '99.999% Platform SLA',
    icon: ShieldCheck,
    desc: 'Real-time multi-window SLO burn rate tracking, immutable audit trails, and strict private VPC data boundary enforcement for HIPAA and SOC2 compliance.',
    highlights: [
      { title: 'Private VPC Boundary', desc: 'All telemetry stays strictly within your cloud perimeter', metric: '100% On-Prem / VPC' },
      { title: 'Multi-Window SLO Burn', desc: 'Real-time error budget tracking with instant Slack/PagerDuty alerts', metric: 'Sub-Minute Burn Alert' },
      { title: 'SOC2 & HIPAA Ready', desc: '256-bit AES encryption at rest and in transit', metric: 'SOC2 Type II Verified' },
    ],
    liveStatus: 'Compliance Status: SOC2 Type II Verified · VPC Boundary Active',
  },
];

export default function ArchitectureSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const current = PIPELINE_STEPS[activeStep];
  const Icon = current.icon;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <section
      id="architecture"
      className="w-full py-24 lg:py-36 relative border-b border-white/10 text-white font-sans overflow-hidden bg-black"
    >
      <div className="max-w-7xl mx-auto px-6 relative z-10">

        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div className="space-y-4 max-w-2xl text-left">


            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              <VerticalCutReveal
                splitBy="words"
                staggerDuration={0.12}
                staggerFrom="first"
                reverse={true}
                containerClassName="text-left font-bold tracking-tight text-white"
                transition={{ type: 'spring', stiffness: 250, damping: 40 }}
              >
                6-Phase Autonomous Observability
              </VerticalCutReveal>
            </h2>
            <p className="text-base sm:text-lg text-gray-300 font-light leading-relaxed">
              From zero-overhead kernel eBPF probes to autonomous Kubernetes self-healing operators — designed for enterprise engineering teams.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <MagneticButton strength={0.25}>
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-5 py-2.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-gray-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5 text-blue-400" /> : <Play className="h-3.5 w-3.5 text-blue-400" />}
                <span>{isPlaying ? 'Pause Auto-Cycle' : 'Auto-Cycle Pipeline'}</span>
              </button>
            </MagneticButton>
          </div>
        </div>

        {/* 12-Column Grid Layout */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">

          {/* LEFT COLUMN: Vertical 6-Phase Stepper */}
          <div className="lg:col-span-5 space-y-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isSelected = activeStep === idx;
              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setActiveStep(idx)}
                  className={`w-full p-4.5 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white border-blue-500 shadow-xl shadow-blue-800/80 scale-[1.01] transform-gpu'
                      : 'backdrop-blur-md bg-white/[0.02] border-white/10 text-gray-300 hover:bg-white/[0.05] hover:text-white hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span className={`text-xs font-mono font-bold ${isSelected ? 'text-white/80' : 'text-gray-500'}`}>
                      {step.step}
                    </span>
                    <div className={`p-2.5 rounded-xl border ${isSelected ? 'bg-black text-white border-black' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                      <StepIcon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold tracking-tight">{step.title}</h3>
                      <p className={`text-xs font-mono mt-0.5 ${isSelected ? 'text-white/90' : 'text-gray-400'}`}>
                        {step.tech}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border hidden sm:inline-block ${
                      isSelected
                        ? 'bg-black/20 text-white border-black/30'
                        : 'bg-neutral-900/80 text-gray-400 border-neutral-800'
                    }`}>
                      {step.badge}
                    </span>
                    <ArrowRight className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* RIGHT COLUMN: Active Phase Value & Capabilities Inspector */}
          <div className="lg:col-span-7 backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] relative overflow-hidden min-h-[480px]">

            {/* Corner Blue Glow Aura */}
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />

            <AnimatePresence mode="wait">
              <motion.div
                key={current.step}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="space-y-6 relative z-10"
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-white/10">
                  <div className="flex items-center gap-3.5">
                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white tracking-tight">{current.headline}</h3>
                      <p className="text-xs font-mono text-blue-400 mt-0.5">{current.tech}</p>
                    </div>
                  </div>
                  <span className="px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-300 font-mono text-xs font-bold border border-blue-500/30">
                    Phase {current.step} of 06
                  </span>
                </div>

                {/* Main Description */}
                <p className="text-gray-200 text-sm sm:text-base leading-relaxed font-light">
                  {current.desc}
                </p>

                {/* 3 Value Capability Cards */}
                <div className="grid sm:grid-cols-3 gap-4 pt-2">
                  {current.highlights.map((h, hIdx) => (
                    <div
                      key={hIdx}
                      className="backdrop-blur-md bg-white/[0.02] border border-white/10 p-4 rounded-2xl space-y-2 flex flex-col justify-between hover:border-blue-500/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                          <h4 className="text-xs font-bold text-white">{h.title}</h4>
                        </div>
                        <p className="text-[11px] text-gray-400 leading-tight font-light">{h.desc}</p>
                      </div>
                      <span className="px-2 py-1 rounded-md bg-blue-500/10 text-blue-300 font-mono text-[10px] font-bold border border-blue-500/20 w-fit">
                        {h.metric}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Live System Status Bar */}
                <div className="backdrop-blur-md bg-black/60 border border-white/10 rounded-2xl p-4 flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <Activity className="h-4 w-4 animate-pulse" />
                    <span>{current.liveStatus}</span>
                  </div>
                  <span className="text-gray-500 text-[10px] hidden sm:inline-block">Status: Healthy</span>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>
      </div>
    </section>
  );
}
