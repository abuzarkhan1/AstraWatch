import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/hooks/useStore';
import { motion } from 'framer-motion';
import LayoutDashboardIcon from '@/components/ui/layout-dashboard-icon';
import ChartLineIcon from '@/components/ui/chart-line-icon';
import ShieldCheck from '@/components/ui/shield-check';
import TriangleAlertIcon from '@/components/ui/triangle-alert-icon';
import ChartBarIcon from '@/components/ui/chart-bar-icon';
import PlugConnectedIcon from '@/components/ui/plug-connected-icon';
import FilledBellIcon from '@/components/ui/filled-bell-icon';
import StackIcon from '@/components/ui/stack-icon';
import DotsHorizontalIcon from '@/components/ui/dots-horizontal-icon';
import XIcon from '@/components/ui/x-icon';
import LogoutIcon from '@/components/ui/logout-icon';
import MagnifierIcon from '@/components/ui/magnifier-icon';
import GearIcon from '@/components/ui/gear-icon';
import BookIcon from '@/components/ui/book-icon';
import FileDescriptionIcon from '@/components/ui/file-description-icon';
import WorldIcon from '@/components/ui/world-icon';
import CpuIcon from '@/components/ui/cpu-icon';
import UsersIcon from '@/components/ui/users-icon';
import CodeIcon from '@/components/ui/code-icon';
import ScanBarcodeIcon from '@/components/ui/scan-barcode-icon';
import LockIcon from '@/components/ui/lock-icon';
import ClockIcon from '@/components/ui/clock-icon';
import ArrowNarrowUpIcon from '@/components/ui/arrow-narrow-up-icon';
import SendIcon from '@/components/ui/send-icon';
import CalendarClockIcon from '@/components/ui/calendar-clock-icon';
import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';
import { CreditCard } from 'lucide-react';
import { TimeRangePicker } from '@/components/ui/time-range-picker';
import QuestionMarkIcon from '@/components/ui/question-mark';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { path: '/incidents', label: 'Incidents', icon: TriangleAlertIcon },
  { path: '/alerting', label: 'Alerting', icon: FilledBellIcon },
  { path: '/oncall', label: 'On-Call', icon: ClockIcon },
  { path: '/escalation', label: 'Escalation', icon: ArrowNarrowUpIcon },
  { path: '/notifications/channels', label: 'Channels', icon: SendIcon },
  { path: '/notifications/maintenance', label: 'Maintenance', icon: CalendarClockIcon },
  { path: '/healing', label: 'Healing', icon: ShieldCheck },
  { path: '/slo', label: 'SLO', icon: ChartBarIcon },
  { path: '/topology', label: 'Topology', icon: PlugConnectedIcon },
  { path: '/dashboards', label: 'Dashboards', icon: StackIcon },
  { path: '/logs', label: 'Logs', icon: CodeIcon },
  { path: '/traces', label: 'Traces', icon: ScanBarcodeIcon },
  { path: '/catalog', label: 'Catalog', icon: CpuIcon },
  { path: '/status-page', label: 'Status Page', icon: WorldIcon },
  { path: '/runbooks', label: 'Runbooks', icon: BookIcon },
  { path: '/postmortems', label: 'Postmortems', icon: FileDescriptionIcon },
  { path: '/synthetics', label: 'Synthetics', icon: ChartLineIcon },
  { path: '/admin', label: 'Admin', icon: GearIcon },
  { path: '/users', label: 'User Management', icon: UsersIcon },
  { path: '/billing', label: 'Billing', icon: CreditCard },
  { path: '/settings', label: 'Settings', icon: LockIcon },
];

function BrandMark({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <div className={`relative ${className} flex items-center justify-center`}>
      <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 top-0 left-1/2 transform -translate-x-1/2 opacity-90" />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 left-0 top-1/2 transform -translate-y-1/2 opacity-90" />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 right-0 top-1/2 transform -translate-y-1/2 opacity-90" />
      <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 bottom-0 left-1/2 transform -translate-x-1/2 opacity-90" />
    </div>
  );
}

// SaaS notification item: read state, a tone for the icon, and an optional
// per-event action (e.g. "View incident"). Read state persists so the unread
// badge stays correct across refreshes.
interface NotificationItem {
  id: string;
  type: string;
  title: string;
  time: string;
  link?: string;
  read: boolean;
  /** Per-event action label (rendered as a button inside the row). */
  actionLabel?: string;
}

const NOTIFY_EVENTS = ['anomaly.detected', 'incident.created', 'incident.updated', 'healing.started', 'healing.completed', 'healing.failed'] as const;

const NOTIFY_STORAGE_KEY = 'astrawatch_notifications_v1';

// Tone + icon per event type (Datadog/Sentry-style color-coded notifications).
const notifyTone: Record<string, { dot: string; iconColor: string }> = {
  'anomaly.detected': { dot: 'bg-red-500', iconColor: 'text-red-400' },
  'incident.created': { dot: 'bg-red-500', iconColor: 'text-red-400' },
  'incident.updated': { dot: 'bg-amber-500', iconColor: 'text-amber-400' },
  'healing.started': { dot: 'bg-blue-500', iconColor: 'text-blue-400' },
  'healing.completed': { dot: 'bg-green-500', iconColor: 'text-green-400' },
  'healing.failed': { dot: 'bg-orange-500', iconColor: 'text-orange-400' },
};

// Per-event action label (SaaS pattern: the row offers the next step).
function notifyActionLabel(type: string): string | undefined {
  if (type === 'incident.created' || type === 'incident.updated') return 'View incident';
  if (type.startsWith('healing.')) return 'View healing';
  if (type === 'anomaly.detected') return 'Inspect';
  return undefined;
}

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  link: string;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name?: string; email?: string; avatarUrl?: string } | null>(null);
  // Load persisted notifications (with read state) so the unread badge survives
  // a refresh — SaaS-standard. Corrupt cache falls back to empty.
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const raw = localStorage.getItem(NOTIFY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // corrupt cache — start fresh
    }
    return [];
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // null = unknown: never claim "operational" before a real status response
  // (audit: the header defaulted to green even with the API down).
  const [systemsOperational, setSystemsOperational] = useState<boolean | null>(null);

  // Header system status: reflect the real status-page payload instead of the
  // hardcoded always-green "All systems operational" label (audit: the header
  // previously claimed operational even while incidents were open).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { endpoints } = await import('@/lib/api');
        const spRes = await endpoints.statusPage.get();
        const sp = spRes?.data?.data ?? spRes?.data ?? {};
        const incidents = Array.isArray(sp?.incidents) ? sp.incidents : [];
        if (mounted) setSystemsOperational(incidents.length === 0);
      } catch {
        // API unreachable — keep the last known state, never fake "operational".
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Live notifications via the realtime WebSocket (audit F11 — previously a stub
  // that always rendered "No new notifications"). A mounted flag prevents handler
  // registration after unmount (async import race) and handlers are deduped by
  // event id so StrictMode double-mounts don't produce duplicates.
  useEffect(() => {
    let mounted = true;
    let unsubscribers: Array<() => void> = [];

    import('@/hooks/useWebSocket').then(({ wsManager }) => {
      if (!mounted) return;
      wsManager.connect();

      const pushNotification = (type: string, raw: unknown) => {
        if (!mounted) return;
        const d = (raw && typeof raw === 'object' ? (raw as any)?.data ?? raw : raw) ?? {};
        // Random suffix on the fallback so two same-type events in the same
        // millisecond (e.g. healing.started + healing.completed from one batch)
        // can't collide on the dedup check below.
        const id = String(d.incidentId || d.actionId || d.eventId || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
        const link = d.incidentId ? `/incidents/${d.incidentId}` : '/incidents';
        const title =
          type === 'anomaly.detected' ? `Anomaly detected: ${d.serviceId || 'unknown service'}` :
          type === 'incident.created' ? `Incident created: ${d.title || d.serviceId || 'new incident'}` :
          type.startsWith('healing.') ? `Healing ${type.split('.')[1]}: ${d.actionType || 'action'}` :
          `Event: ${type}`;
        setNotifications((prev) => {
          if (prev.some((n) => n.id === id)) return prev;
          // New events arrive unread (SaaS behavior).
          const next = [{ id, type, title, time: new Date().toISOString(), link, read: false, actionLabel: notifyActionLabel(type) }, ...prev];
          return next.slice(0, 50);
        });
      };

      NOTIFY_EVENTS.forEach((evt) => {
        unsubscribers.push(wsManager.on(evt, (data) => pushNotification(evt, data)));
      });
    });

    return () => {
      mounted = false;
      unsubscribers.forEach((u) => u());
    };
  }, []);

  // Persist notifications + read state (debounced-ish: writes on every change
  // are cheap for a 50-item cap).
  useEffect(() => {
    try {
      localStorage.setItem(NOTIFY_STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // storage full/unavailable — non-fatal
    }
  }, [notifications]);

  // Seed history from the REST endpoint so the bell shows past events across
  // refreshes (WS events alone are ephemeral). History ids are shaped to match
  // the WS push ids, so already-seen items keep their read state and nothing
  // is duplicated.
  useEffect(() => {
    let mounted = true;
    import('@/lib/api').then(({ endpoints }) => {
      endpoints.alerting.history().then((res: any) => {
        if (!mounted) return;
        const items = res.data?.data?.items ?? res.data?.items ?? [];
        if (!Array.isArray(items)) return;
        setNotifications((prev) => {
          const known = new Set(prev.map((n) => n.id));
          const fresh: NotificationItem[] = [];
          for (const it of items) {
            if (!it || !it.id || known.has(it.id)) continue;
            known.add(it.id);
            fresh.push({
              id: it.id,
              type: it.type || 'incident.updated',
              title: it.title || 'New event',
              time: it.time || new Date().toISOString(),
              link: it.link || '/incidents',
              read: false,
              actionLabel: notifyActionLabel(it.type),
            });
          }
          if (fresh.length === 0) return prev;
          return [...fresh, ...prev].slice(0, 50);
        });
      }).catch(() => {});
    });
    return () => {
      mounted = false;
    };
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markNotificationRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  useEffect(() => {
    import('@/lib/api').then(({ endpoints }) => {
      endpoints.auth.me().then((res: any) => {
        const d = res.data?.data ?? res.data;
        if (d) setCurrentUser({ name: d.name, email: d.email, avatarUrl: d.avatarUrl });
      }).catch(() => {});
    });
  }, []);

  // Command-bar search (audit F11 — previously a stub with no query logic).
  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const { default: api } = await import('@/lib/api');
        const [incRes, healRes, svcRes, rbRes] = await Promise.allSettled([
          api.get('/api/v1/incidents', { params: { limit: 50 } }),
          api.get('/api/v1/healing/history'),
          api.get('/api/v1/catalog/services'),
          api.get('/api/v1/runbooks'),
        ]);
        const results: SearchResult[] = [];
        if (incRes.status === 'fulfilled') {
          const items = incRes.value.data?.data ?? incRes.value.data ?? [];
          (Array.isArray(items) ? items : []).forEach((inc: any) => {
            const title = inc.title || inc.serviceId || '';
            if (title.toLowerCase().includes(q.toLowerCase())) {
              results.push({ id: `inc-${inc.id}`, title, subtitle: `${inc.severity || ''} incident`.trim(), link: `/incidents/${inc.id}` });
            }
          });
        }
        if (healRes.status === 'fulfilled') {
          const items = healRes.value.data?.data ?? healRes.value.data ?? [];
          (Array.isArray(items) ? items : []).forEach((h: any) => {
            if ((h.actionType || '').toLowerCase().includes(q.toLowerCase())) {
              results.push({ id: `heal-${h.id}`, title: `Healing: ${h.actionType}`, subtitle: `Risk ${h.riskScore} · ${h.status || ''}`.trim(), link: `/incidents/${h.incidentId}` });
            }
          });
        }
        if (svcRes.status === 'fulfilled') {
          const items = svcRes.value.data?.data ?? svcRes.value.data ?? [];
          (Array.isArray(items) ? items : []).forEach((svc: any) => {
            const title = svc.name || '';
            if (title.toLowerCase().includes(q.toLowerCase()) || (svc.owner || '').toLowerCase().includes(q.toLowerCase())) {
              results.push({ id: `svc-${svc.id}`, title: `Service: ${title}`, subtitle: `${svc.tier || 'STANDARD'} · ${svc.status || 'UNKNOWN'}`.trim(), link: '/catalog' });
            }
          });
        }
        if (rbRes.status === 'fulfilled') {
          const items = rbRes.value.data?.data ?? rbRes.value.data ?? [];
          (Array.isArray(items) ? items : []).forEach((rb: any) => {
            const title = rb.title || '';
            if (title.toLowerCase().includes(q.toLowerCase())) {
              results.push({ id: `rb-${rb.id}`, title: `Runbook: ${title}`, subtitle: `rev ${rb.currentRevision ?? 1}`.trim(), link: '/runbooks' });
            }
          });
        }
        if (!cancelled) setSearchResults(results.slice(0, 20));
      } catch (err) {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const target = e.target as HTMLElement;
        const typing =
          target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (!typing) {
          e.preventDefault();
          setHelpOpen((prev) => !prev);
        }
      }
      if (e.key === 'Escape') {
        setHelpOpen(false);
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-black text-gray-100 relative overflow-hidden">
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-neutral-950/40 backdrop-blur-2xl border-r border-neutral-800 overflow-hidden flex flex-col relative z-10`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <BrandMark className="w-5 h-5" />
            <span className="font-extrabold text-lg tracking-tight text-white">AstraWatch</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                  isActive ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-[0px_-4px_30px_0px_rgba(9,0,255,0.4)] border border-blue-500"
                  />
                )}
                <Icon className="w-5 h-5 relative z-10" />
                <span className="text-sm font-medium relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-neutral-800 space-y-2">
          {/* User profile strip */}
          {currentUser && (
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name || 'User'}
                  className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-300 text-xs font-bold shrink-0">
                  {(currentUser.name?.[0] || currentUser.email?.[0] || '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">{currentUser.name || 'User'}</div>
                <div className="text-[10px] text-gray-500 truncate">{currentUser.email}</div>
              </div>
            </div>
          )}
          <button
            onClick={async () => {
              try {
                const { default: api } = await import('@/lib/api');
                await api.post('/api/v1/auth/logout').catch(() => {});
              } finally {
                window.location.href = '/auth/login';
              }
            }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-gray-400 hover:bg-white/[0.05] hover:text-white border border-transparent hover:border-white/10 transition-all"
          >
            <LogoutIcon className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-14 bg-neutral-950/40 backdrop-blur-2xl border-b border-neutral-800 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
            >
              {sidebarOpen ? <XIcon className="w-5 h-5" /> : <DotsHorizontalIcon className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${systemsOperational === null ? 'bg-amber-400' : systemsOperational ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${systemsOperational === null ? 'bg-amber-500' : systemsOperational ? 'bg-emerald-500' : 'bg-red-500'}`} />
              </span>
              <span>{systemsOperational === null ? 'Checking system status...' : systemsOperational ? 'All systems operational' : 'Active incidents detected'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <TimeRangePicker />
            <Link
              to="/landing"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors text-sm font-medium"
            >
              <WorldIcon className="w-4 h-4" />
              <span>SaaS Landing Page</span>
            </Link>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 rounded-xl text-gray-400 hover:text-gray-200 text-sm transition-all"
            >
              <MagnifierIcon className="w-4 h-4" />
              <span>Search...</span>
              <kbd className="ml-2 px-1.5 py-0.5 bg-neutral-950 rounded text-xs border border-neutral-800">⌘K</kbd>
            </button>
            <button
              onClick={() => setHelpOpen(true)}
              title="Keyboard shortcuts (?)"
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
            >
              <QuestionMarkIcon className="w-4 h-4" />
            </button>
            <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
              aria-expanded={notificationsOpen}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white relative transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <FilledBellIcon className="w-5 h-5" />
              {/* Badge shows UNREAD count only (SaaS standard) */}
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-96 rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] z-50 overflow-hidden">
                  <div className="p-3 border-b border-neutral-800 font-medium text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      Notifications
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-red-500/15 border border-red-500/30 text-red-400 px-2 py-0.5 text-[10px] font-bold">
                          {unreadCount} new
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-3">
                      {unreadCount > 0 && (
                        <button
                          onClick={markAllNotificationsRead}
                          className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          Mark all read
                        </button>
                      )}
                      {notifications.length > 0 && (
                        <button
                          onClick={() => setNotifications([])}
                          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-96 overflow-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-sm text-gray-500">
                        <FilledBellIcon className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n) => {
                        const tone = notifyTone[n.type] ?? { dot: 'bg-blue-500', iconColor: 'text-blue-400' };
                        return (
                          <div
                            key={n.id}
                            className={`relative flex items-start gap-3 px-4 py-3 border-b border-neutral-800/60 transition-colors ${
                              n.read ? 'opacity-60' : 'hover:bg-white/[0.03]'
                            }`}
                          >
                            {/* Unread indicator dot */}
                            {!n.read && (
                              <span className={`absolute left-2 top-4 h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                            )}
                            <Link
                              to={n.link || '/incidents'}
                              onClick={() => {
                                markNotificationRead(n.id);
                                setNotificationsOpen(false);
                              }}
                              className="flex-1 min-w-0 block pl-3"
                            >
                              <div className={`text-xs font-semibold truncate ${n.read ? 'text-gray-400' : 'text-white'}`}>
                                {n.title}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-2">
                                <span className={`capitalize ${tone.iconColor}`}>{n.type.replace('.', ' ')}</span>
                                <span>·</span>
                                <span>{new Date(n.time).toLocaleString()}</span>
                              </div>
                            </Link>
                            {/* Per-event action button (SaaS: next step in the row) */}
                            {n.actionLabel && (
                              <button
                                onClick={() => {
                                  markNotificationRead(n.id);
                                  setNotificationsOpen(false);
                                  navigate(n.link || '/incidents');
                                }}
                                className="shrink-0 self-center rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                              >
                                {n.actionLabel}
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                  {notifications.length > 0 && (
                    <div className="p-2 border-t border-neutral-800 flex justify-center">
                      <button
                        onClick={markAllNotificationsRead}
                        className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {unreadCount > 0 ? `Mark ${unreadCount} notification${unreadCount === 1 ? '' : 's'} as read` : 'All caught up'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        <div
          key={location.pathname.split('/')[1] || 'root'}
          className="flex-1 overflow-auto p-6 relative page-enter"
        >
          {searchOpen && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 flex justify-center p-12">
              <div className="rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] w-full max-w-xl h-96 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-neutral-800 flex items-center gap-3">
                  <MagnifierIcon className="w-5 h-5 text-gray-400" />
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-500"
                    placeholder="Type a command or search..."
                  />
                  <button
                    onClick={() => setSearchOpen(false)}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  {searchLoading ? (
                    <div className="p-2 text-sm text-gray-500">Searching...</div>
                  ) : searchQuery.trim() === '' ? (
                    <div className="p-2 text-sm text-gray-500">Type to search incidents and healing actions.</div>
                  ) : searchResults.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">No results found.</div>
                  ) : (
                    searchResults.map((r) => (
                      <Link
                        key={r.id}
                        to={r.link}
                        onClick={() => setSearchOpen(false)}
                        className="block p-2 rounded-xl hover:bg-white/[0.04] transition-colors"
                      >
                        <div className="text-sm text-white font-medium truncate">{r.title}</div>
                        <div className="text-xs text-gray-500 truncate">{r.subtitle}</div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <Toaster theme="dark" position="bottom-right" />

      {/* Keyboard shortcuts help (press ? or the ? button) */}
      {helpOpen && (
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <span className="font-medium text-white text-sm">Keyboard shortcuts</span>
              <button onClick={() => setHelpOpen(false)} className="text-gray-400 hover:text-white transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-sm">
              {[
                ['⌘K / Ctrl K', 'Open global search'],
                ['?', 'Toggle this help panel'],
                ['Esc', 'Close any overlay'],
                ['Click ⊞ in the header', 'Collapse / expand navigation'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="text-gray-300">{desc}</span>
                  <kbd className="px-2 py-1 bg-neutral-950 rounded-lg text-xs border border-neutral-800 text-gray-400">{key}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
