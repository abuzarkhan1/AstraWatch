import { create } from 'zustand';
import type { Incident, AnomalyResult, ServiceHealth, HealingAction } from '@/types';

interface AppState {
  incidents: Incident[];
  selectedIncident: Incident | null;
  services: ServiceHealth[];
  anomalies: Map<string, AnomalyResult>;
  healingActions: HealingAction[];
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  // Global observability context (SaaS-standard): a single time range and
  // auto-refresh cadence that every page respects, like Datadog/Grafana.
  timeRangeMinutes: number;
  autoRefresh: boolean;
  lastRefresh: number;

  setIncidents: (incidents: Incident[]) => void;
  addIncident: (incident: Incident) => void;
  updateIncident: (id: string, updates: Partial<Incident>) => void;
  setSelectedIncident: (incident: Incident | null) => void;
  setServices: (services: ServiceHealth[]) => void;
  addAnomaly: (serviceId: string, anomaly: AnomalyResult) => void;
  addHealingAction: (action: HealingAction) => void;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  setTimeRangeMinutes: (minutes: number) => void;
  setAutoRefresh: (enabled: boolean) => void;
  markRefreshed: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  incidents: [],
  selectedIncident: null,
  services: [],
  anomalies: new Map(),
  healingActions: [],
  theme: (localStorage.getItem('theme') as 'light' | 'dark') || 'dark',
  sidebarOpen: true,
  timeRangeMinutes: Number(localStorage.getItem('timeRangeMinutes')) || 60,
  autoRefresh: localStorage.getItem('autoRefresh') !== 'false',
  lastRefresh: Date.now(),

  setIncidents: (incidents) => set({ incidents }),

  addIncident: (incident) =>
    set((state) => ({ incidents: [incident, ...state.incidents] })),

  updateIncident: (id, updates) =>
    set((state) => ({
      incidents: state.incidents.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      ),
      selectedIncident:
        state.selectedIncident?.id === id
          ? { ...state.selectedIncident, ...updates }
          : state.selectedIncident,
    })),

  setSelectedIncident: (incident) => set({ selectedIncident: incident }),

  setServices: (services) => set({ services }),

  addAnomaly: (serviceId, anomaly) =>
    set((state) => {
      const newAnomalies = new Map(state.anomalies);
      newAnomalies.set(serviceId, anomaly);
      return { anomalies: newAnomalies };
    }),

  addHealingAction: (action) =>
    set((state) => ({
      healingActions: [action, ...state.healingActions],
    })),

  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', newTheme);
      return { theme: newTheme };
    }),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setTimeRangeMinutes: (minutes) => {
    localStorage.setItem('timeRangeMinutes', String(minutes));
    set({ timeRangeMinutes: minutes, lastRefresh: Date.now() });
  },

  setAutoRefresh: (enabled) => {
    localStorage.setItem('autoRefresh', String(enabled));
    set({ autoRefresh: enabled });
  },

  markRefreshed: () => set({ lastRefresh: Date.now() }),
}));
