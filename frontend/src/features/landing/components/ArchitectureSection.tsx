import React, { useState, useEffect, useCallback } from 'react';
import MagneticButton from '@/components/ui/magnetic-button';
import { motion } from 'framer-motion';
import {
  Cpu,
  Server,
  Database,
  Brain,
  Workflow,
  Radio,
  ArrowRight,
  Terminal,
  Play,
  Pause,
  Check,
  Copy,
  Code2
} from 'lucide-react';

interface PipelineStep {
  step: string;
  title: string;
  tech: string;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  filename: string;
  lang: string;
  payload: string;
  simulatedLogs: string[];
}

const PIPELINE_STEPS: PipelineStep[] = [
  {
    step: '01',
    title: 'C++ eBPF Host Agent',
    tech: 'eBPF CO-RE Probes & Procfs',
    badge: '<0.32% CPU Overhead',
    icon: Cpu,
    desc: 'Zero-overhead kernel probes hook directly into Linux socket tracepoints and ring-buffers. Collect TCP latency, CPU cycles, and syscall events natively.',
    filename: 'ebpf_kernel_probe.cpp',
    lang: 'C++ / eBPF CO-RE',
    payload: `// eBPF Socket Buffer Tracepoint Probe
SEC("socket/filter")
int filter_packet(struct __sk_buff *skb) {
    u32 len = skb->len;
    u64 ts = bpf_ktime_get_ns();
    
    // Submit payload directly to kernel ringbuffer
    struct event_t evt = { .pkt_len = len, .timestamp = ts };
    bpf_ringbuf_output(&rb, &evt, sizeof(evt), 0);
    return 0;
}`,
    simulatedLogs: [
      '[eBPF] Hooked syscall tracepoint sys_enter_write (Probe ID: #401)',
      '[RingBuffer] 64MB buffer allocated on CPU socket 0',
      '[Telemetry] Streaming TCP flow latency events at 0.12ms'
    ]
  },
  {
    step: '02',
    title: 'Go Ingestion Collector',
    tech: 'Gin & gRPC Streaming Engine',
    badge: '10M+ Events/Sec',
    icon: Server,
    desc: 'High-throughput ingestion engine capable of handling tens of millions of telemetry events/sec with memory batching, rate-limiting, and topic fan-out.',
    filename: 'telemetry_collector.go',
    lang: 'Go (gRPC & Gin)',
    payload: `// Go High-Throughput Telemetry Ingestion Endpoint
func (s *CollectorServer) StreamTelemetry(stream pb.Telemetry_StreamServer) error {
    for {
        batch, err := stream.Recv()
        if err == io.EOF { return stream.SendAndClose(&pb.Ack{Status: "OK"}) }
        
        // Zero-allocation batch channel emission
        s.kafkaProducer.EmitBatch(batch.Events)
    }
}`,
    simulatedLogs: [
      '[Collector] gRPC stream initialized on port :50051',
      '[Ingestion] Batching 10,000 metrics per window',
      '[Kafka] Emitted telemetry stream to topic astrawatch.events'
    ]
  },
  {
    step: '03',
    title: 'ClickHouse Columnar Storage',
    tech: 'MergeTree DB Engine',
    badge: 'Sub-Second Analytics',
    icon: Database,
    desc: 'Columnar analytical database storing compressed metrics, logs, and traces with sub-second aggregate query speeds across petabyte-scale clusters.',
    filename: 'metrics_aggregation.sql',
    lang: 'ClickHouse SQL',
    payload: `-- Columnar Latency Quantile Query
SELECT 
    service_name,
    quantilesExact(0.50, 0.95, 0.99)(latency_ns / 1e6) AS p_latencies,
    count() AS total_requests
FROM ebpf_telemetry_events 
WHERE timestamp >= now() - INTERVAL 15 MINUTE
GROUP BY service_name 
ORDER BY p_latencies[3] DESC;`,
    simulatedLogs: [
      '[ClickHouse] Executing MergeTree query across 12 partitions',
      '[Query Engine] Scanned 4.2M rows in 14ms',
      '[Result] Aggregated p99 latency matrix for payment-api'
    ]
  },
  {
    step: '04',
    title: 'Python ML Anomaly Engine',
    tech: 'FastAPI + Isolation Forest',
    badge: '<15ms Inference',
    icon: Brain,
    desc: 'Real-time anomaly scoring pipeline evaluating EWMA, Dynamic Z-Score, and Isolation Forest models over telemetry streams with ultra-low latency.',
    filename: 'anomaly_detector.py',
    lang: 'Python (FastAPI & Scikit)',
    payload: `# Real-Time Isolation Forest Anomaly Scoring Engine
def evaluate_telemetry_vector(vector: np.ndarray) -> dict:
    iso_score = model.decision_function(vector)[0]
    ewma_val = compute_ewma_baseline(vector)
    
    is_anomaly = float(iso_score) < -0.45 or ewma_val > 3.5
    return {"score": round(abs(iso_score), 3), "anomaly_flag": is_anomaly}`,
    simulatedLogs: [
      '[ML Engine] Evaluating 12-dimensional telemetry feature vector',
      '[Isolation Forest] Decision score: 0.92 (Anomaly Threshold > 0.85)',
      '[Alert] Anomaly flag raised for deployment payment-api'
    ]
  },
  {
    step: '05',
    title: 'Java Orchestrator & Operator',
    tech: 'Spring Boot & K8s CRD',
    badge: '1.4s Auto-Healing',
    icon: Workflow,
    desc: 'State-machine engine enforcing risk-based auto-healing rules, blast-radius limits, PostgreSQL idempotency locks, and K8s API mutations.',
    filename: 'RemediationOperator.java',
    lang: 'Java (Spring Boot / K8s)',
    payload: `// Kubernetes CRD Auto-Healing Operator
@EventListener
public void handleAnomalyEvent(AnomalyDetectedEvent event) {
    AutoHealingRule rule = ruleRepository.findForService(event.getServiceName());
    
    if (rule.validateBlastRadius() && idempotencyLock.acquire(event.getLockId())) {
        k8sClient.apps().deployments().inNamespace("prod")
                 .withName(event.getServiceName()).restart();
    }
}`,
    simulatedLogs: [
      '[Orchestrator] Acquired idempotency lock #9402 in PostgreSQL',
      '[Safeguard] Blast radius check: 2.5% active pod restarts (<10% limit)',
      '[K8s API] Issued rollout restart deployment payment-api'
    ]
  },
  {
    step: '06',
    title: 'Node.js Realtime Gateway',
    tech: 'Socket.io WebSockets',
    badge: '<1ms WS Fan-Out',
    icon: Radio,
    desc: 'Sub-millisecond WebSocket fan-out gateway broadcasting live cluster metrics, incident alerts, and topology updates to UI dashboards.',
    filename: 'realtimeGateway.ts',
    lang: 'TypeScript (Node.js)',
    payload: `// Real-Time WebSocket Telemetry Gateway
io.on("connection", (socket) => {
    socket.join("cluster-prod-mesh");
    
    // Broadcast live telemetry ticks to connected UI clients
    telemetryBus.on("tick", (payload: TelemetryTick) => {
        socket.emit("telemetry_tick", payload);
    });
});`,
    simulatedLogs: [
      '[WebSocket Gateway] Client connected to channel cluster-prod-mesh',
      '[Broadcast] Dispatched telemetry tick to 142 dashboard sessions',
      '[Status] UI topology state synchronized in 0.8ms'
    ]
  }
];

export default function ArchitectureSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [copied, setCopied] = useState(false);
  const [executedLogs, setExecutedLogs] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);

  const current = PIPELINE_STEPS[activeStep];
  const Icon = current.icon;

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % PIPELINE_STEPS.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleSelectStep = (idx: number) => {
    setActiveStep(idx);
    setIsPlaying(false);
  };

  const handleCopyCode = useCallback(() => {
    navigator.clipboard.writeText(current.payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [current.payload]);

  const handleRunExecution = () => {
    setIsExecuting(true);
    setExecutedLogs([]);
    current.simulatedLogs.forEach((log, index) => {
      setTimeout(() => {
        setExecutedLogs((prev) => [...prev, log]);
        if (index === current.simulatedLogs.length - 1) {
          setIsExecuting(false);
        }
      }, (index + 1) * 350);
    });
  };

  return (
    <section id="architecture" className="py-24 md:py-32 bg-black border-b border-white/10 text-white font-sans relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-400 mb-4 backdrop-blur-md shadow-sm shadow-blue-500/20">
              <Workflow className="h-3.5 w-3.5 text-blue-400" />
              <span>Sub-Millisecond Pipeline</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
              6-Phase Pipeline Architecture
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <MagneticButton strength={0.25}>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-4 py-2 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-gray-200 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{isPlaying ? 'Pause Auto-Cycle' : 'Auto-Cycle Pipeline'}</span>
              </button>
            </MagneticButton>
          </div>
        </div>

        {/* 12-Column Layout */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          
          {/* LEFT COLUMN: Vertical 6-Phase Stepper */}
          <div className="lg:col-span-5 space-y-3">
            {PIPELINE_STEPS.map((step, idx) => {
              const StepIcon = step.icon;
              const isSelected = activeStep === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectStep(idx)}
                  className={`w-full p-4.5 rounded-2xl border text-left transition-all duration-200 flex items-center justify-between cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white border-blue-500 shadow-xl shadow-blue-800/80 scale-[1.01] transform-gpu'
                      : 'bg-[#0c0c0c] border-neutral-800 text-gray-300 hover:bg-neutral-900 hover:text-white hover:border-neutral-700'
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
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold tracking-tight">{step.title}</h4>
                      </div>
                      <p className={`text-xs font-mono mt-0.5 ${isSelected ? 'text-white/90' : 'text-gray-400'}`}>
                        {step.tech}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded-full border hidden sm:inline-block ${
                      isSelected 
                        ? 'bg-black/20 text-white border-black/30' 
                        : 'bg-neutral-900 text-gray-400 border-neutral-800'
                    }`}>
                      {step.badge}
                    </span>
                    <ArrowRight className={`h-4 w-4 ${isSelected ? 'text-white' : 'text-gray-500'}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* RIGHT COLUMN: Active Step Code Payload Inspector */}
          <div className="lg:col-span-7 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-neutral-700">
                <div className="flex items-center gap-3.5">
                  <div className="h-12 w-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">{current.title}</h3>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">{current.tech}</p>
                  </div>
                </div>
                <span className="px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-400 font-mono text-xs font-bold border border-blue-500/30">
                  Phase {current.step} of 06
                </span>
              </div>

              <p className="text-gray-300 text-sm sm:text-base leading-relaxed font-light mb-8">
                {current.desc}
              </p>
            </div>

            {/* Code Payload Inspector Box */}
            <div className="bg-black rounded-2xl border border-neutral-800 p-5 font-mono text-xs shadow-inner space-y-4">
              <div className="flex flex-wrap items-center justify-between pb-3 border-b border-neutral-800 gap-2 text-gray-400">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-blue-400" />
                  <span className="text-white font-bold">{current.filename}</span>
                  <span className="text-[10px] text-gray-500 font-mono">({current.lang})</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyCode}
                    className="p-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-gray-200 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5 text-[11px]"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copied ? 'Copied' : 'Copy Payload'}</span>
                  </button>

                  <button
                    onClick={handleRunExecution}
                    disabled={isExecuting}
                    className="px-3 py-1.5 rounded-lg bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-bold font-sans flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-blue-800"
                  >
                    <Play className="h-3 w-3 fill-white" />
                    <span>{isExecuting ? 'Running...' : 'Execute Payload'}</span>
                  </button>
                </div>
              </div>

              <pre className="text-gray-200 leading-relaxed overflow-x-auto max-h-56 scrollbar-thin scrollbar-thumb-neutral-800 font-mono">
                <code>{current.payload}</code>
              </pre>

              {executedLogs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-3 border-t border-neutral-800 space-y-1.5 text-[11px] text-gray-300"
                >
                  <div className="flex items-center justify-between text-gray-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Terminal className="h-3 w-3 text-blue-400" /> Execution Stream Output
                    </span>
                    <span className="text-emerald-400 font-bold">SUCCESS</span>
                  </div>
                  {executedLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-2 font-mono">
                      <span className="text-blue-400">›</span>
                      <span className="text-white font-medium">{log}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
