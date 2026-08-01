import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useIncident, useIncidentTimeline } from '@/hooks/useApi';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Clock, 
  User, 
  GitPullRequest, 
  ExternalLink, 
  FileCode, 
  Check, 
  Copy, 
  Sparkles, 
  Github, 
  Bot,
  BrainCircuit,
  FileDiff
} from 'lucide-react';

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading } = useIncident(id);
  const { data: timeline } = useIncidentTimeline(id);
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="text-center py-12 text-gray-500">
        <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Incident not found</p>
        <Link to="/incidents" className="text-blue-500 hover:underline mt-2 inline-block">
          Back to incidents
        </Link>
      </div>
    );
  }

  // Fallback demo PR if incident doesn't have explicit githubPR from backend
  const pr = incident.githubPR || {
    number: 42,
    title: 'astrawatch/fix-incident-123',
    repo: 'astrawatch/payment-service',
    url: 'https://github.com/astrawatch/payment-service/pull/42',
    status: 'OPEN',
    branch: 'astrawatch/fix-incident-123',
    aiDiagnosis: {
      what: 'eBPF socket buffer overflow caused TCP retransmission spikes during high-throughput ingress traffic.',
      why: 'Socket read buffer pool size (64KB) was undersized for peak 10Gbps ingress burst traffic, forcing TCP window scaling drops and kernel queue exhaustion.',
      confidence: 0.94,
      impactedFiles: [
        'services/payment-service/internal/socket/buffer.go',
        'services/payment-service/config/sysctl.conf',
      ],
    },
    codeDiff: `--- a/services/payment-service/internal/socket/buffer.go
+++ b/services/payment-service/internal/socket/buffer.go
@@ -14,7 +14,7 @@ const (
-   DefaultMaxSocketBuffer = 65536 // 64KB
+   DefaultMaxSocketBuffer = 4194304 // 4MB dynamic pool buffer
    TcpWindowScaleFactor  = 7
 )

 func ConfigureRingBuffer(conn *net.TCPConn) error {
-   return conn.SetReadBuffer(DefaultMaxSocketBuffer)
+   if err := conn.SetReadBuffer(DefaultMaxSocketBuffer); err != nil {
+       log.Warnf("Failed to expand socket buffer: %v", err)
+       return err
+   }
+   return nil
 }`,
  };

  const handleCopyDiff = () => {
    if (pr.codeDiff) {
      navigator.clipboard.writeText(pr.codeDiff);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/incidents" className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft className="w-4 h-4" />
        Back to incidents
      </Link>

      {/* Primary Incident Info Card */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white relative z-10 mb-1">{incident.title || 'Incident'}</h1>
            <p className="text-sm text-gray-500">ID: {incident.id}</p>
          </div>
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-400 font-medium">
            {incident.severity}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock className="w-3 h-3" />
              State
            </div>
            <span className="text-sm font-medium">{incident.state}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Clock className="w-3 h-3" />
              Created
            </div>
            <span className="text-sm">{new Date(incident.createdAt).toLocaleString()}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <User className="w-3 h-3" />
              Assigned To
            </div>
            <span className="text-sm">{incident.assignedTo || 'Unassigned'}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <AlertTriangle className="w-3 h-3" />
              Service
            </div>
            <span className="text-sm">{incident.serviceId}</span>
          </div>
        </div>

        {incident.description && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-400 mb-2">Description</h3>
            <p className="text-sm text-gray-300 bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">{incident.description}</p>
          </div>
        )}
      </div>

      {/* GitHub Automated Remediation PR Display */}
      {pr && (
        <div className="rounded-2xl text-white bg-gradient-to-b from-neutral-900 via-neutral-900 to-neutral-950 border border-purple-500/30 shadow-[0_10px_40px_-15px_rgba(147,51,234,0.3)] p-6 space-y-6">
          
          {/* PR Header Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-neutral-800/80">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shadow-inner">
                <GitPullRequest className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {pr.status}
                  </span>
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-bold text-white hover:text-purple-300 transition-colors flex items-center gap-1.5 group"
                  >
                    <span>Pull Request #{pr.number}: {pr.title}</span>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-purple-300 transition-colors" />
                  </a>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 font-mono mt-1">
                  <span>Repo: <strong className="text-gray-200">{pr.repo}</strong></span>
                  <span>•</span>
                  <span>Branch: <code className="text-purple-300 bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800">{pr.branch}</code></span>
                </div>
              </div>
            </div>

            <a
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-xl px-4 py-2.5 text-xs shadow-lg shadow-purple-900/40 border border-purple-500/50 transition-all cursor-pointer shrink-0"
            >
              <Github className="w-4 h-4" />
              <span>View Pull Request on GitHub</span>
            </a>
          </div>

          {/* AI Diagnosis Breakdown ("What & Why") */}
          {pr.aiDiagnosis && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-5 h-5 text-purple-400" />
                  <h2 className="text-base font-bold text-white">AI Diagnosis Breakdown</h2>
                </div>
                {pr.aiDiagnosis.confidence && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    {(pr.aiDiagnosis.confidence * 100).toFixed(0)}% AI Confidence
                  </span>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                {/* WHAT Section */}
                <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                    <Bot className="w-4 h-4" />
                    <span>WHAT (Symptom & Root Finding)</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    {pr.aiDiagnosis.what}
                  </p>
                </div>

                {/* WHY Section */}
                <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-purple-400 uppercase tracking-wider">
                    <Sparkles className="w-4 h-4" />
                    <span>WHY (Causal Machine Learning Explanation)</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed font-sans">
                    {pr.aiDiagnosis.why}
                  </p>
                </div>
              </div>

              {/* Impacted Files */}
              {pr.aiDiagnosis.impactedFiles && pr.aiDiagnosis.impactedFiles.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
                    Impacted Code Artifacts ({pr.aiDiagnosis.impactedFiles.length})
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {pr.aiDiagnosis.impactedFiles.map((file: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-gray-300">
                        <FileCode className="w-3.5 h-3.5 text-purple-400" />
                        {file}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Proposed Code Diff Section */}
          {pr.codeDiff && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileDiff className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Proposed Code Diff</h3>
                </div>
                <button
                  onClick={handleCopyDiff}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy Diff'}</span>
                </button>
              </div>

              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 overflow-x-auto font-mono text-xs leading-relaxed">
                <pre className="text-gray-300">
                  {pr.codeDiff.split('\n').map((line: string, idx: number) => {
                    let lineStyle = "text-gray-400";
                    if (line.startsWith('+') && !line.startsWith('+++')) lineStyle = "text-emerald-400 bg-emerald-950/30 px-1 py-0.5 rounded";
                    else if (line.startsWith('-') && !line.startsWith('---')) lineStyle = "text-red-400 bg-red-950/30 px-1 py-0.5 rounded";
                    else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) lineStyle = "text-purple-400 font-bold";

                    return (
                      <div key={idx} className={lineStyle}>
                        {line}
                      </div>
                    );
                  })}
                </pre>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Timeline Section */}
      {timeline && timeline.length > 0 && (
        <div className="relative rounded-2xl text-white bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] hover:border-blue-500/30 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.25)] transition-all duration-300 p-6 z-10">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Timeline</h2>
          <div className="space-y-3">
            {timeline.map((event: any) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                <div>
                  <span className="text-xs text-gray-500">{new Date(event.createdAt).toLocaleString()}</span>
                  <p className="text-sm text-gray-300 mt-0.5">{event.eventType}</p>
                  {event.payload && (
                    <pre className="text-xs text-gray-500 mt-1 bg-neutral-950/60 border border-neutral-800 rounded-lg p-2 overflow-x-auto">
                      {JSON.stringify(JSON.parse(event.payload), null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incident Actions */}
      <div className="flex items-center gap-3 relative z-10">
        <button
          onClick={async () => {
            const { endpoints } = await import('@/lib/api');
            await endpoints.incidents.resolve(incident.id, 'Resolved via dashboard');
            navigate(0);
          }}
          className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-5 py-3 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
        >
          Resolve Incident
        </button>
        <button
          onClick={async () => {
            const { endpoints } = await import('@/lib/api');
            await endpoints.incidents.escalate(incident.id, 'manager', 'Needs immediate attention');
            navigate(0);
          }}
          className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-5 py-3 hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer"
        >
          Escalate
        </button>
      </div>
    </div>
  );
}
