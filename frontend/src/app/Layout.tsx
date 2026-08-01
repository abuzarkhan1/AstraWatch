import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '@/hooks/useStore';
import { motion } from 'framer-motion';
import { LayoutDashboard, Activity, Shield, AlertTriangle, BarChart3, Network, Bell, LayoutGrid, ScrollText, GitBranch, Menu, X, LogOut, Search, Settings, Book, FileText, Globe, Box } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Toaster } from 'sonner';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/incidents', label: 'Incidents', icon: AlertTriangle },
  { path: '/alerting', label: 'Alerting', icon: Bell },
  { path: '/healing', label: 'Healing', icon: Shield },
  { path: '/slo', label: 'SLO', icon: BarChart3 },
  { path: '/topology', label: 'Topology', icon: Network },
  { path: '/dashboards', label: 'Dashboards', icon: LayoutGrid },
  { path: '/logs', label: 'Logs', icon: ScrollText },
  { path: '/traces', label: 'Traces', icon: GitBranch },
  { path: '/catalog', label: 'Catalog', icon: Box },
  { path: '/status-page', label: 'Status Page', icon: Globe },
  { path: '/runbooks', label: 'Runbooks', icon: Book },
  { path: '/postmortems', label: 'Postmortems', icon: FileText },
  { path: '/synthetics', label: 'Synthetics', icon: Activity },
  { path: '/admin', label: 'Admin', icon: Settings },
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

export default function Layout() {
  const location = useLocation();
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-[#060911] text-gray-100 relative overflow-hidden">
      {/* Ambient blue glow behind the app shell */}
      <div className="absolute -top-40 left-1/3 w-[900px] h-[500px] bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(49,49,245,0.14),transparent_100%)] pointer-events-none blur-3xl" />

      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-neutral-950/80 backdrop-blur-xl border-r border-white/10 overflow-hidden flex flex-col relative z-10`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <BrandMark className="w-5 h-5" />
            <span className="font-extrabold text-lg tracking-tight">AstraWatch</span>
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
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 ${
                  isActive ? 'text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 shadow-md shadow-blue-800/60 border border-blue-500"
                  />
                )}
                <Icon className="w-5 h-5 relative z-10" />
                <span className="text-sm font-medium relative z-10">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <button
            onClick={() => {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              window.location.href = '/auth/login';
            }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-xl text-gray-400 hover:bg-white/[0.05] hover:text-white border border-transparent hover:border-white/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-14 bg-neutral-950/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>All systems operational</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              to="/landing"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 transition-colors text-sm font-medium"
            >
              <Globe className="w-4 h-4" />
              <span>SaaS Landing Page</span>
            </Link>
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-white/10 rounded-lg text-gray-400 hover:text-gray-200 hover:border-white/20 text-sm transition-colors"
            >
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <kbd className="ml-2 px-1.5 py-0.5 bg-neutral-900 rounded text-xs border border-white/10">⌘K</kbd>
            </button>
            <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white relative transition-all duration-200 hover:scale-105 active:scale-95"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl backdrop-blur-2xl bg-neutral-950/90 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] z-50 overflow-hidden">
                  <div className="p-3 border-b border-white/10 font-medium text-sm">Notifications</div>
                  <div className="p-4 text-sm text-gray-400">No new notifications</div>
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
              <div className="rounded-2xl backdrop-blur-2xl bg-neutral-950/90 border border-white/10 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] w-full max-w-xl h-96 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center gap-3">
                  <Search className="w-5 h-5 text-gray-400" />
                  <input
                    autoFocus
                    className="flex-1 bg-transparent outline-none text-gray-100 placeholder-gray-500"
                    placeholder="Type a command or search..."
                    onChange={() => {}}
                  />
                  <button
                    onClick={() => setSearchOpen(false)}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-2">
                  <div className="p-2 text-sm text-gray-500">No results found.</div>
                </div>
              </div>
            </div>
          )}
          <Outlet />
        </div>
      </main>
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
