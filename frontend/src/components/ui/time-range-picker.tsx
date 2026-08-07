import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/hooks/useStore';
import RefreshIcon from '@/components/ui/refresh-icon';
import ClockIcon from '@/components/ui/clock-icon';

const RANGES = [
  { label: 'Last 15m', minutes: 15 },
  { label: 'Last 1h', minutes: 60 },
  { label: 'Last 6h', minutes: 360 },
  { label: 'Last 24h', minutes: 1440 },
  { label: 'Last 7d', minutes: 10080 },
];

const REFRESH_LABELS: Record<string, string> = {
  '15': '15s',
  '30': '30s',
  '60': '1m',
};

// Global time-range + auto-refresh control (the Datadog/Grafana top-bar
// pattern). Writes into the shared store so every page's queries key off the
// same window; the manual refresh button bumps `lastRefresh` which the pages
// listen to. Previously each page hard-coded its own window — a dead giveaway
// the product was a set of mockups rather than a single product.
export function TimeRangePicker() {
  const { timeRangeMinutes, setTimeRangeMinutes, autoRefresh, setAutoRefresh, markRefreshed } =
    useAppStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [refreshSeconds, setRefreshSeconds] = useState(30);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Auto-refresh cadence: bumps lastRefresh on an interval when enabled.
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => markRefreshed(), refreshSeconds * 1000);
    return () => clearInterval(t);
  }, [autoRefresh, refreshSeconds, markRefreshed]);

  const current = RANGES.find((r) => r.minutes === timeRangeMinutes) ?? RANGES[1];

  return (
    <div ref={ref} className="relative flex items-center">
      {/* Manual refresh */}
      <button
        onClick={markRefreshed}
        title="Refresh now"
        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
      >
        <RefreshIcon className="w-4 h-4" />
      </button>

      {/* Time range selector */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 rounded-xl text-gray-300 hover:text-white text-sm transition-all"
      >
        <ClockIcon className="w-4 h-4 text-gray-500" />
        <span className="font-medium">{current.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] z-50 overflow-hidden">
          <div className="p-3 border-b border-neutral-800 font-medium text-sm flex items-center justify-between">
            <span>Time range</span>
          </div>
          <div className="p-2">
            {RANGES.map((r) => (
              <button
                key={r.minutes}
                onClick={() => {
                  setTimeRangeMinutes(r.minutes);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  r.minutes === timeRangeMinutes
                    ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                    : 'text-gray-300 hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-neutral-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-400">Auto-refresh</span>
              <div className="flex items-center gap-1">
                {[15, 30, 60].map((s) => (
                  <button
                    key={s}
                    onClick={() => setRefreshSeconds(s)}
                    disabled={!autoRefresh}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors disabled:opacity-40 ${
                      refreshSeconds === s
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : 'bg-neutral-800 text-gray-500 border border-neutral-700'
                    }`}
                  >
                    {REFRESH_LABELS[String(s)]}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="flex w-full items-center justify-between rounded-lg bg-neutral-800/80 border border-neutral-700 px-3 py-2"
            >
              <span className="text-sm text-gray-300">{autoRefresh ? 'Live' : 'Paused'}</span>
              <span
                className={`relative h-4 w-8 rounded-full transition-colors ${
                  autoRefresh ? 'bg-blue-500' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
                    autoRefresh ? 'left-4' : 'left-0.5'
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
