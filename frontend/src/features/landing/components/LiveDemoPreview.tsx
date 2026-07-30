import React, { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Terminal,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';

type SimStatus = 'healthy' | 'anomaly' | 'healing' | 'recovered';

interface PodInfo {
  id: string;
  name: string;
  cpu: number;
  memory: string;
  status: 'Running' | 'CPU Spike' | 'Restarting' | 'Healthy';
  ip: string;
}

interface LogEntry {
  id: string;
  time: string;
  source: 'Kernel' | 'ML Radar' | 'K8s Operator';
  msg: string;
  type: 'info' | 'warn' | 'error' | 'success';
}

const INITIAL_PODS: PodInfo[] = [
  { id: 'pod-1', name: 'payment-api-7d9f-1', cpu: 26, memory: '210 MB', status: 'Running', ip: '10.244.1.12' },
  { id: 'pod-2', name: 'payment-api-7d9f-2', cpu: 29, memory: '218 MB', status: 'Running', ip: '10.244.1.13' },
  { id: 'pod-3', name: 'payment-api-7d9f-3', cpu: 24, memory: '205 MB', status: 'Running', ip: '10.244.1.14' },
  { id: 'pod-4', name: 'payment-api-7d9f-4', cpu: 31, memory: '225 MB', status: 'Running', ip: '10.244.1.15' },
  { id: 'pod-5', name: 'payment-api-7d9f-5', cpu: 27, memory: '212 MB', status: 'Running', ip: '10.244.1.16' },
  { id: 'pod-6', name: 'payment-api-7d9f-6', cpu: 25, memory: '208 MB', status: 'Running', ip: '10.244.1.17' },
];

const INITIAL_LOGS: LogEntry[] = [
  { id: '1', time: '22:14:01', source: 'Kernel', msg: '[eBPF Probes] CO-RE probes attached to namespace prod-mesh', type: 'info' },
  { id: '2', time: '22:14:05', source: 'Kernel', msg: '[Collector] gRPC stream active — 14,200 telemetry events/sec', type: 'info' },
  { id: '3', time: '22:14:09', source: 'ML Radar', msg: '[ML Engine] Isolation Forest baseline score: 0.04 (Optimal)', type: 'info' },
];

export default function LiveDemoPreview() {
  const [status, setStatus] = useState<SimStatus>('healthy');
  const [cpuVal, setCpuVal] = useState(28);
  const [anomalyScore, setAnomalyScore] = useState(0.04);
  const [pods, setPods] = useState<PodInfo[]>(INITIAL_PODS);
  const [selectedPod, setSelectedPod] = useState<PodInfo>(INITIAL_PODS[3]);
  const [logFilter, setLogFilter] = useState<'All' | 'Kernel' | 'ML Radar' | 'K8s Operator'>('All');
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);

  const handleSimulateSpike = () => {
    setStatus('anomaly');
    setCpuVal(96);
    setAnomalyScore(0.94);
    
    setPods((prev) =>
      prev.map((p) =>
        p.id === 'pod-4'
          ? { ...p, cpu: 96, memory: '890 MB', status: 'CPU Spike' }
          : p
      )
    );

    const now = new Date().toLocaleTimeString();
    const newLogs: LogEntry[] = [
      { id: Date.now().toString() + '-1', time: now, source: 'ML Radar', msg: '🚨 [ML Engine] ANOMALY DETECTED: CPU Spike 96% on payment-api-7d9f-4', type: 'error' },
      { id: Date.now().toString() + '-2', time: now, source: 'ML Radar', msg: '[Isolation Forest] Score: 0.94 (>0.85 threshold breached)', type: 'warn' },
      { id: Date.now().toString() + '-3', time: now, source: 'Kernel', msg: '[eBPF Probe] Socket write backlog detected on fd #12', type: 'warn' },
    ];

    setLogs((prev) => [...newLogs, ...prev]);
  };

  const handleAutoHeal = () => {
    setStatus('healing');

    setPods((prev) =>
      prev.map((p) =>
        p.id === 'pod-4'
          ? { ...p, status: 'Restarting', memory: '410 MB' }
          : p
      )
    );

    const now = new Date().toLocaleTimeString();
    const healingLogs: LogEntry[] = [
      { id: Date.now().toString() + '-4', time: now, source: 'K8s Operator', msg: '⚡ [Auto-Healing] Triggered AutoHealingRule: PodRestart', type: 'warn' },
      { id: Date.now().toString() + '-5', time: now, source: 'K8s Operator', msg: '[Idempotency] Lock #9402 acquired in PostgreSQL store', type: 'info' },
      { id: Date.now().toString() + '-6', time: now, source: 'K8s Operator', msg: '[K8s API] Initiating Pod Drain & Replacement for payment-api-7d9f-4', type: 'info' },
    ];

    setLogs((prev) => [...healingLogs, ...prev]);

    setTimeout(() => {
      setStatus('recovered');
      setCpuVal(30);
      setAnomalyScore(0.06);

      setPods((prev) =>
        prev.map((p) =>
          p.id === 'pod-4'
            ? { ...p, cpu: 28, memory: '214 MB', status: 'Healthy' }
            : p
        )
      );

      const recoveredTime = new Date().toLocaleTimeString();
      const successLogs: LogEntry[] = [
        { id: Date.now().toString() + '-7', time: recoveredTime, source: 'K8s Operator', msg: '✅ [K8s Operator] Replacement pod ready & passed readiness probe', type: 'success' },
        { id: Date.now().toString() + '-8', time: recoveredTime, source: 'K8s Operator', msg: '🛡️ [Orchestrator] Incident INC-9402 RESOLVED in 1.4s MTTR.', type: 'success' },
      ];

      setLogs((prev) => [...successLogs, ...prev]);
    }, 2200);
  };

  const handleReset = () => {
    setStatus('healthy');
    setCpuVal(28);
    setAnomalyScore(0.04);
    setPods(INITIAL_PODS);
    setSelectedPod(INITIAL_PODS[3]);
    setLogs(INITIAL_LOGS);
  };

  const filteredLogs = useMemo(() => {
    if (logFilter === 'All') return logs;
    return logs.filter((l) => l.source === logFilter);
  }, [logs, logFilter]);

  const handleCopyLogs = useCallback(() => {
    const text = logs.map((l) => `${l.time} [${l.source}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [logs]);

  return (
    <section id="demo" className="py-24 md:py-32 bg-black border-b border-white/10 text-white font-sans relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-400 mb-4 shadow-sm shadow-blue-500/20">
            <Terminal className="h-3.5 w-3.5 text-blue-400" />
            <span>Interactive Incident Simulator</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            Live K8s Self-Healing Sandbox
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-300 font-light">
            Simulate a high-load CPU anomaly in real time and watch AstraWatch's ML detection engine and Kubernetes operator resolve the incident automatically.
          </p>
        </div>

        <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden">
          
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 mb-6 border-b border-neutral-800">
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-red-500/80" />
                <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
              </div>
              <span className="text-xs font-mono font-bold text-gray-400 ml-2">
                astrawatch-prod-mesh / payment-service
              </span>
            </div>

            <div className="flex items-center gap-3">
              {status === 'healthy' && (
                <button
                  onClick={handleSimulateSpike}
                  className="px-5 py-2.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-lg"
                >
                  <AlertTriangle className="h-4 w-4 text-red-400 animate-pulse" />
                  <span>Simulate CPU & Memory Spike</span>
                </button>
              )}

              {status === 'anomaly' && (
                <button
                  onClick={handleAutoHeal}
                  className="px-5 py-2.5 rounded-full bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white hover:from-blue-600 hover:to-blue-700 text-xs font-bold flex items-center gap-2 transition-colors shadow-xl shadow-blue-800 cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Auto-Remediate Pod Now</span>
                </button>
              )}

              {status === 'healing' && (
                <div className="px-5 py-2.5 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />
                  <span>Auto-Healing Pod Replacement in Progress...</span>
                </div>
              )}

              {status === 'recovered' && (
                <button
                  onClick={handleReset}
                  className="px-5 py-2.5 rounded-full bg-neutral-900 border border-neutral-700 text-gray-200 hover:bg-neutral-800 hover:text-white text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Reset Sandbox Simulation</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-black p-6 rounded-2xl border border-neutral-800">
              <p className="text-xs font-semibold text-gray-400">Cluster Health Status</p>
              <div className="flex items-center gap-3 mt-3">
                {status === 'healthy' && (
                  <>
                    <span className="h-3 w-3 rounded-full bg-blue-400" />
                    <span className="text-lg font-bold text-white font-mono">OPTIMAL HEALTH</span>
                  </>
                )}
                {status === 'anomaly' && (
                  <>
                    <span className="h-3 w-3 rounded-full bg-red-500 animate-ping" />
                    <span className="text-lg font-bold text-red-400 font-mono">ANOMALY CRITICAL</span>
                  </>
                )}
                {status === 'healing' && (
                  <>
                    <RefreshCw className="h-4 w-4 text-blue-400 animate-spin" />
                    <span className="text-lg font-bold text-blue-400 font-mono">REMEDIATING...</span>
                  </>
                )}
                {status === 'recovered' && (
                  <>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <span className="text-lg font-bold text-emerald-400 font-mono">AUTO-HEALED (1.4s)</span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-black p-6 rounded-2xl border border-neutral-800">
              <p className="text-xs font-semibold text-gray-400">Target Pod CPU Utilization</p>
              <div className="flex items-baseline justify-between mt-2">
                <p className={`text-3xl font-bold font-mono ${cpuVal > 80 ? 'text-red-400' : 'text-blue-400'}`}>
                  {cpuVal}%
                </p>
                <span className="text-xs text-gray-500 font-mono">Threshold: 85%</span>
              </div>
              <div className="w-full bg-neutral-900 h-2 rounded-full mt-3 overflow-hidden border border-neutral-800">
                <div
                  className={`h-full transition-all duration-500 ${cpuVal > 80 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'}`}
                  style={{ width: `${cpuVal}%` }}
                />
              </div>
            </div>

            <div className="bg-black p-6 rounded-2xl border border-neutral-800">
              <p className="text-xs font-semibold text-gray-400">Isolation Forest Score</p>
              <div className="flex items-baseline justify-between mt-2">
                <p className={`text-3xl font-bold font-mono ${anomalyScore > 0.5 ? 'text-red-400' : 'text-blue-400'}`}>
                  {anomalyScore.toFixed(2)}
                </p>
                <span className="text-xs text-gray-500 font-mono">Critical: &gt;0.80</span>
              </div>
              <div className="w-full bg-neutral-900 h-2 rounded-full mt-3 overflow-hidden border border-neutral-800">
                <div
                  className={`h-full transition-all duration-500 ${anomalyScore > 0.5 ? 'bg-red-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'}`}
                  style={{ width: `${anomalyScore * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Pod Cluster Matrix */}
          <div className="bg-black p-5 rounded-2xl border border-neutral-800 space-y-4 mb-8 font-mono">
            <div className="flex items-center justify-between text-xs text-gray-400 pb-2 border-b border-neutral-800">
              <span>Deployment Pod Replicas (payment-api-7d9f)</span>
              <span className="text-blue-400 font-bold text-[11px]">6 REPLICAS ACTIVE</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {pods.map((p) => {
                const isSelected = selectedPod.id === p.id;
                const isSpike = p.status === 'CPU Spike';
                const isRestart = p.status === 'Restarting';

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPod(p)}
                    className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                      isSpike
                        ? 'bg-red-500/20 border-red-500 text-red-300'
                        : isRestart
                        ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
                        : isSelected
                        ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white border-blue-500 shadow-md shadow-blue-800'
                        : 'bg-neutral-900 border-neutral-800 text-gray-300 hover:bg-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase truncate">{p.id}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isSpike ? 'bg-red-500 animate-ping' : isRestart ? 'bg-yellow-400 animate-spin' : isSelected ? 'bg-white' : 'bg-blue-400'
                      }`} />
                    </div>
                    <p className="text-xs font-bold font-mono">CPU {p.cpu}%</p>
                    <p className="text-[10px] opacity-70 truncate">{p.memory}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event Log Terminal */}
          <div className="bg-black rounded-2xl border border-neutral-800 p-5 font-mono text-xs shadow-inner space-y-3">
            <div className="flex flex-wrap items-center justify-between pb-3 border-b border-neutral-800 gap-2 text-gray-400">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-bold text-white">
                  <Terminal className="h-4 w-4 text-blue-400" /> Real-Time Remediation Stream Log
                </span>

                <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800 text-[11px]">
                  {(['All', 'Kernel', 'ML Radar', 'K8s Operator'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setLogFilter(filter)}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        logFilter === filter ? 'bg-gradient-to-t from-blue-500 to-blue-600 text-white font-bold' : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleCopyLogs}
                className="p-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-gray-200 hover:text-white hover:bg-neutral-700 transition-colors cursor-pointer flex items-center gap-1.5 text-[11px]"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-blue-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Logs'}</span>
              </button>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto font-mono text-xs">
              {filteredLogs.map((log) => (
                <div key={log.id} className="flex items-start gap-3">
                  <span className="text-gray-500 shrink-0">{log.time}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px] font-bold text-blue-400 border border-blue-500/20 shrink-0">
                    {log.source}
                  </span>
                  <span className={
                    log.type === 'error' ? 'text-red-400 font-semibold' :
                    log.type === 'warn' ? 'text-yellow-400' :
                    log.type === 'success' ? 'text-emerald-400 font-bold' :
                    'text-gray-300'
                  }>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
