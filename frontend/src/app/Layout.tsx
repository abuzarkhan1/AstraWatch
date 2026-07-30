import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAppStore } from '@/hooks/useStore';
import { LayoutDashboard, Activity, Shield, AlertTriangle, BarChart3, Network, Bell, LayoutGrid, ScrollText, GitBranch, Menu, X, LogOut, Search, Settings, Book, FileText, Globe, Box } from 'lucide-react';
import { useState, useEffect } from 'react';

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
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 bg-gray-900 border-r border-gray-800 overflow-hidden flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-500" />
            <span className="font-bold text-lg">AstraWatch</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <button
            onClick={() => {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              window.location.href = '/auth/login';
            }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Activity className="w-4 h-4 text-green-500" />
              <span>All systems operational</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <Link to="/landing" className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/20 text-indigo-400 rounded-md hover:bg-indigo-600/30 transition-colors text-sm font-medium">
              <Globe className="w-4 h-4" />
              <span>SaaS Landing Page</span>
            </Link>
            <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-md text-gray-400 hover:text-gray-200 text-sm">
              <Search className="w-4 h-4" />
              <span>Search...</span>
              <kbd className="ml-2 px-1.5 py-0.5 bg-gray-700 rounded text-xs">⌘K</kbd>
            </button>
            <div className="relative">
              <button onClick={() => setNotificationsOpen(!notificationsOpen)} className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-50">
                  <div className="p-3 border-b border-gray-700 font-medium">Notifications</div>
                  <div className="p-3 text-sm text-gray-400">No new notifications</div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 relative">
          {searchOpen && (
            <div className="absolute inset-0 bg-black/50 z-40 flex justify-center p-12">
              <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-xl h-96 flex flex-col">
                <div className="p-4 border-b border-gray-700 flex items-center gap-3">
                  <Search className="w-5 h-5 text-gray-400" />
                  <input autoFocus className="flex-1 bg-transparent outline-none text-gray-100" placeholder="Type a command or search..." onChange={() => {}} />
                  <button onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
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
    </div>
  );
}
