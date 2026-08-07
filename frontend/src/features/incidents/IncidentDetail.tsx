import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useIncident, useIncidentTimeline } from '@/hooks/useApi';
import { 
  GitPullRequest, 
  Copy, 
  Bot,
  BrainCircuit,
  FileDiff,
  FilePlus2,
  MessageSquarePlus,
  UserRound,
  ListChecks,
  Download
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import ArrowNarrowLeftIcon from '@/components/ui/arrow-narrow-left-icon';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import ClockIcon from '@/components/ui/clock-icon';
import UsersIcon from '@/components/ui/users-icon';
import ExternalLinkIcon from '@/components/ui/external-link-icon';
import FileDescriptionIcon from '@/components/ui/file-description-icon';
import CheckedIcon from '@/components/ui/checked-icon';
import SparklesIcon from '@/components/ui/sparkles-icon';
import GithubIcon from '@/components/ui/github-icon';
import SendIcon from '@/components/ui/send-icon';
// Consistent severity badge styling (audit: the detail header always rendered a
// blue badge regardless of actual severity — CRITICAL looked identical to LOW).
const severityColors: Record<string, string> = {
  CRITICAL: 'border-red-500/30 bg-red-500/10 text-red-400',
  HIGH: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  MEDIUM: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  LOW: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
};

export default function IncidentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: incident, isLoading } = useIncident(id);
  const { data: timeline } = useIncidentTimeline(id);
  const [copied, setCopied] = useState(false);

  // ── Hooks are all declared up here, before any conditional return, so the
  // hook order never changes between renders (review fix: postmortem/assign/
  // comment hooks used to sit after the isLoading/!incident early returns,
  // which crashes React with "Rendered more hooks than during the previous
  // render" as soon as an incident finishes loading).
  const queryClient = useQueryClient();

  // Postmortem authoring state (audit Part 2.1: create/update/export/action-items
  // existed on the backend but the page only listed postmortems — no authoring).
  const [pmEdit, setPmEdit] = useState(false);
  const [pmSummary, setPmSummary] = useState('');
  const [pmLessons, setPmLessions] = useState('');
  const [pmFactors, setPmFactors] = useState('');
  const [pmAccurate, setPmAccurate] = useState<boolean | null>(null);
  const [pmMsg, setPmMsg] = useState('');
  const [pmErr, setPmErr] = useState('');
  const [aiDesc, setAiDesc] = useState('');
  const [aiOwner, setAiOwner] = useState('');
  const [aiDue, setAiDue] = useState('');
  const [aiMsg, setAiMsg] = useState('');

  // Assign + comment (audit Part 2.1: incident triage was backend-only).
  const [assigneeId, setAssigneeId] = useState('');
  const [assignMsg, setAssignMsg] = useState('');
  const [commentText, setCommentText] = useState('');
  const [commentMsg, setCommentMsg] = useState('');

  const { data: pmData } = useQuery({
    queryKey: ['postmortem', id],
    queryFn: async () => {
      try {
        const { data } = await endpoints.postmortems.get(id!);
        return data?.data ?? data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!id,
  });

  const { data: actionItems = [] } = useQuery({
    queryKey: ['postmortem-action-items', id],
    queryFn: async () => {
      try {
        const { data } = await endpoints.postmortems.actionItems(id!);
        const items = Array.isArray(data) ? data : (data?.data ?? []);
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    enabled: !!id && !!pmData,
  });

  const savePm = useMutation({
    mutationFn: () =>
      (pmData
        ? endpoints.postmortems.update(id!, {
            summary: pmSummary,
            lessonsLearned: pmLessons,
            contributingFactors: pmFactors.split('\n').map((s) => s.trim()).filter(Boolean),
            severityWasAccurate: pmAccurate,
          })
        : endpoints.postmortems.create(id!, {
            summary: pmSummary,
            lessonsLearned: pmLessons,
            contributingFactors: pmFactors.split('\n').map((s) => s.trim()).filter(Boolean),
            severityWasAccurate: pmAccurate,
          })),
    onSuccess: () => {
      setPmEdit(false);
      setPmMsg(pmData ? 'Postmortem updated.' : 'Postmortem created.');
      setTimeout(() => setPmMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['postmortem', id] });
      queryClient.invalidateQueries({ queryKey: ['postmortems'] });
    },
    onError: (err: any) => setPmErr(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to save postmortem'),
  });

  const exportPm = useMutation({
    mutationFn: () => endpoints.postmortems.export(id!, { format: 'markdown' }),
    onSuccess: (res: any) => {
      const content = res?.data?.data?.content ?? res?.data?.content;
      if (content) {
        navigator.clipboard.writeText(content);
        setPmMsg('Markdown postmortem copied to clipboard.');
        setTimeout(() => setPmMsg(''), 3000);
      }
    },
    onError: (err: any) => setPmErr(err?.response?.data?.data?.error ?? err?.message ?? 'Export failed'),
  });

  const addActionItem = useMutation({
    mutationFn: () =>
      endpoints.postmortems.createActionItem(id!, {
        description: aiDesc,
        ownerId: aiOwner || null,
        dueDate: aiDue || null,
        status: 'OPEN',
      }),
    onSuccess: () => {
      setAiDesc('');
      setAiOwner('');
      setAiDue('');
      setAiMsg('Action item added.');
      setTimeout(() => setAiMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['postmortem-action-items', id] });
    },
    onError: (err: any) => setPmErr(err?.response?.data?.data?.error ?? err?.message ?? 'Failed to add action item'),
  });

  const assignMutation = useMutation({
    mutationFn: () => endpoints.incidents.assign(id!, assigneeId),
    onSuccess: () => {
      setAssignMsg('Incident assigned.');
      setAssigneeId('');
      setTimeout(() => setAssignMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incident-timeline', id] });
    },
    onError: (err: any) => setAssignMsg(err?.response?.data?.data?.error ?? 'Assignment failed'),
  });

  const commentMutation = useMutation({
    mutationFn: () => endpoints.incidents.comment(id!, commentText),
    onSuccess: () => {
      setCommentText('');
      setCommentMsg('Comment added.');
      setTimeout(() => setCommentMsg(''), 3000);
      queryClient.invalidateQueries({ queryKey: ['incident-timeline', id] });
    },
    onError: (err: any) => setCommentMsg(err?.response?.data?.data?.error ?? 'Comment failed'),
  });

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
        <TriangleAlertIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Incident not found</p>
        <Link to="/incidents" className="text-blue-500 hover:underline mt-2 inline-block">
          Back to incidents
        </Link>
      </div>
    );
  }

  const pr = incident.githubPR;

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
        <ArrowNarrowLeftIcon className="w-4 h-4" />
        Back to incidents
      </Link>

      {/* Primary Incident Info Card */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white relative z-10 mb-1">{incident.title || 'Incident'}</h1>
            <p className="text-sm text-gray-500">ID: {incident.id}</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${severityColors[incident.severity] || severityColors.LOW}`}>
            {incident.severity}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <ClockIcon className="w-3 h-3" />
              State
            </div>
            <span className="text-sm font-medium">{incident.state}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <ClockIcon className="w-3 h-3" />
              Created
            </div>
            <span className="text-sm">{incident.createdAt ? new Date(incident.createdAt).toLocaleString() : '—'}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <UsersIcon className="w-3 h-3" />
              Assigned To
            </div>
            <span className="text-sm">{incident.assignedTo || 'Unassigned'}</span>
          </div>
          <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <TriangleAlertIcon className="w-3 h-3" />
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
                    <ExternalLinkIcon className="w-4 h-4 text-gray-400 group-hover:text-purple-300 transition-colors" />
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
              <GithubIcon className="w-4 h-4" />
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
                    <SparklesIcon className="w-3.5 h-3.5" />
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
                    <SparklesIcon className="w-4 h-4" />
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
                        <FileDescriptionIcon className="w-3.5 h-3.5 text-purple-400" />
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
                  {copied ? <CheckedIcon className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
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
                  <span className="text-xs text-gray-500">{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</span>
                  <p className="text-sm text-gray-300 mt-0.5">{event.eventType}</p>
                  {event.payload && (
                    <pre className="text-xs text-gray-500 mt-1 bg-neutral-950/60 border border-neutral-800 rounded-lg p-2 overflow-x-auto">
                      {/* Payload may be non-JSON text from older events — never let
                          a raw parse crash the whole detail view. */}
                      {(() => {
                        if (typeof event.payload !== 'string') return JSON.stringify(event.payload, null, 2);
                        try {
                          return JSON.stringify(JSON.parse(event.payload), null, 2);
                        } catch {
                          return event.payload;
                        }
                      })()}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incident Actions */}
      <div className="flex items-center gap-3 relative z-10 flex-wrap">
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
          className="bg-neutral-900 border border-amber-500/40 text-amber-300 font-semibold rounded-xl px-5 py-3 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all cursor-pointer"
        >
          Escalate
        </button>
      </div>

      {/* Assign + Comment (audit Part 2.1: incident triage was backend-only) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <UserRound className="w-4 h-4 text-blue-400" />
            Assign
          </h3>
          <p className="text-xs text-gray-500">Current: {incident.assignedTo || 'Unassigned'}</p>
          <div className="flex gap-2">
            <input
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              placeholder="User ID (UUID)"
              className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
            <button
              onClick={() => assignMutation.mutate()}
              disabled={!assigneeId.trim() || assignMutation.isPending}
              className="bg-neutral-800 border border-neutral-700 text-gray-300 text-xs font-bold rounded-xl px-4 py-2 hover:bg-neutral-700 transition-all cursor-pointer disabled:opacity-50"
            >
              Assign
            </button>
          </div>
          {assignMsg && <p className="text-xs text-gray-400">{assignMsg}</p>}
        </div>
        <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <MessageSquarePlus className="w-4 h-4 text-blue-400" />
            Add Comment
          </h3>
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Update the team..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentText.trim()) commentMutation.mutate();
              }}
              className="flex-1 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
            />
            <button
              onClick={() => commentMutation.mutate()}
              disabled={!commentText.trim() || commentMutation.isPending}
              className="flex items-center gap-1.5 bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 text-xs hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <SendIcon className="w-3.5 h-3.5" />
              Send
            </button>
          </div>
          {commentMsg && <p className="text-xs text-gray-400">{commentMsg}</p>}
        </div>
      </div>

      {/* Postmortem authoring (audit Part 2.1: page only listed postmortems) */}
      <div className="rounded-2xl text-white bg-neutral-900 border border-neutral-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <FileDescriptionIcon className="w-4 h-4 text-blue-400" />
            Postmortem
          </h3>
          <div className="flex gap-2">
            {pmData && (
              <button
                onClick={() => exportPm.mutate()}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors bg-neutral-800 border border-neutral-700 px-2.5 py-1.5 rounded-lg cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export Markdown
              </button>
            )}
            <button
              onClick={() => {
                setPmEdit((v) => !v);
                if (!pmEdit && pmData) {
                  setPmSummary(pmData.summary ?? '');
                  setPmLessions(pmData.lessonsLearned ?? '');
                  setPmFactors(Array.isArray(pmData.contributingFactors) ? pmData.contributingFactors.join('\n') : '');
                  setPmAccurate(pmData.severityWasAccurate);
                }
              }}
              className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 border border-blue-500/30 px-2.5 py-1.5 rounded-lg cursor-pointer"
            >
              <FilePlus2 className="w-3.5 h-3.5" />
              {pmEdit ? 'Cancel' : pmData ? 'Edit' : 'Write'}
            </button>
          </div>
        </div>

        {pmMsg && <p className="text-sm text-green-400">{pmMsg}</p>}
        {pmErr && <p className="text-sm text-red-400">{pmErr}</p>}

        {!pmData && !pmEdit ? (
          <p className="text-sm text-gray-500">No postmortem written for this incident yet.</p>
        ) : !pmEdit ? (
          <div className="space-y-3">
            {pmData.summary && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Summary</p>
                <p className="text-sm text-gray-300 bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">{pmData.summary}</p>
              </div>
            )}
            {pmData.lessonsLearned && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Lessons Learned</p>
                <p className="text-sm text-gray-300 bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">{pmData.lessonsLearned}</p>
              </div>
            )}
            {pmData.contributingFactors && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Contributing Factors</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(pmData.contributingFactors) ? pmData.contributingFactors : []).map((f: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-gray-400">{f}</span>
                  ))}
                </div>
              </div>
            )}
            {pmData.severityWasAccurate != null && (
              <p className="text-xs text-gray-400">
                Severity was {pmData.severityWasAccurate ? 'accurate' : 'inaccurate'}.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Summary</label>
              <textarea
                value={pmSummary}
                onChange={(e) => setPmSummary(e.target.value)}
                rows={3}
                placeholder="What happened, and what was the impact?"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Lessons Learned</label>
              <textarea
                value={pmLessons}
                onChange={(e) => setPmLessions(e.target.value)}
                rows={3}
                placeholder="What should the team do differently next time?"
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all resize-y"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Contributing Factors (one per line)</label>
              <textarea
                value={pmFactors}
                onChange={(e) => setPmFactors(e.target.value)}
                rows={2}
                placeholder={'Missing timeout on payment API\nNo alert on queue depth'}
                className="w-full bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all resize-y"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-gray-400">Severity was accurate:</span>
              <button
                onClick={() => setPmAccurate(true)}
                className={`text-xs font-bold rounded-lg px-3 py-1.5 border transition-all cursor-pointer ${pmAccurate === true ? 'bg-green-500/15 border-green-500/40 text-green-400' : 'bg-neutral-800 border-neutral-700 text-gray-400'}`}
              >
                Yes
              </button>
              <button
                onClick={() => setPmAccurate(false)}
                className={`text-xs font-bold rounded-lg px-3 py-1.5 border transition-all cursor-pointer ${pmAccurate === false ? 'bg-red-500/15 border-red-500/40 text-red-400' : 'bg-neutral-800 border-neutral-700 text-gray-400'}`}
              >
                No
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => savePm.mutate()}
                disabled={savePm.isPending}
                className="bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800/50 border border-blue-500 text-white font-bold rounded-xl px-4 py-2 text-xs hover:from-blue-600 hover:to-blue-700 transition-all cursor-pointer disabled:opacity-50"
              >
                {savePm.isPending ? 'Saving...' : 'Save Postmortem'}
              </button>
            </div>
          </div>
        )}

        {/* Action items (audit Part 2.1: action-items endpoints were unused) */}
        {pmData && (
          <div className="border-t border-neutral-800 pt-4 space-y-3">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ListChecks className="w-4 h-4 text-blue-400" />
              Action Items
            </h4>
            {actionItems.length === 0 ? (
              <p className="text-sm text-gray-500">No action items yet.</p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-neutral-800 last:border-0">
                    <div>
                      <p className="text-sm text-gray-300">{a.description}</p>
                      <p className="text-xs text-gray-500">
                        {a.status} · {a.ownerId ? `Owner ${a.ownerId.slice(0, 8)}` : 'Unassigned'}
                        {a.dueDate ? ` · Due ${a.dueDate}` : ''}
                      </p>
                    </div>
                    {a.status === 'OPEN' && <CheckedIcon className="w-4 h-4 text-gray-600" />}
                    {a.status === 'COMPLETED' && <CheckedIcon className="w-4 h-4 text-green-500" />}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                value={aiDesc}
                onChange={(e) => setAiDesc(e.target.value)}
                placeholder="Action description"
                className="sm:col-span-3 bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
              <input
                value={aiOwner}
                onChange={(e) => setAiOwner(e.target.value)}
                placeholder="Owner ID (optional)"
                className="bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none transition-all"
              />
              <input
                value={aiDue}
                onChange={(e) => setAiDue(e.target.value)}
                type="date"
                className="bg-neutral-800 border border-neutral-700 focus:border-blue-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-all"
              />
              <button
                onClick={() => addActionItem.mutate()}
                disabled={!aiDesc.trim() || addActionItem.isPending}
                className="bg-neutral-800 border border-neutral-700 text-gray-300 text-xs font-bold rounded-xl px-4 py-2 hover:bg-neutral-700 transition-all cursor-pointer disabled:opacity-50"
              >
                Add Item
              </button>
            </div>
            {aiMsg && <p className="text-xs text-green-400">{aiMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
