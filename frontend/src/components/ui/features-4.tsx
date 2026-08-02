import { CpuIcon } from '@/components/ui/cpu-icon'
import { SparklesIcon } from '@/components/ui/sparkles-icon'
import { GearIcon } from '@/components/ui/gear-icon'
import { PenIcon } from '@/components/ui/pen-icon'
import { RocketIcon } from '@/components/ui/rocket-icon' // using rocket for Zap
import { ShieldCheck } from '@/components/ui/shield-check' // using shield-check for Fingerprint


const FEATURES = [
  {
    icon: RocketIcon,
    title: 'Faaast',
    desc: 'Kernel-level eBPF probes capture telemetry with sub-millisecond overhead, no sidecars required.',
  },
  {
    icon: CpuIcon,
    title: 'Powerful',
    desc: 'Multi-model ML anomaly detection over metrics, traces, and logs with confidence scoring.',
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    desc: 'Zero sidecars, kernel CO-RE binaries, and 100% on-premise VPC-safe deployment by default.',
  },
  {
    icon: PenIcon,
    title: 'Customization',
    desc: 'Drag-and-drop dashboards, custom SLOs, and runbooks tailored to your exact stack.',
  },
  {
    icon: GearIcon,
    title: 'Control',
    desc: 'Blast-radius limits and idempotency locks on every auto-healing action keep you in command.',
  },
  {
    icon: SparklesIcon,
    title: 'Built for AI',
    desc: 'LLM-powered root-cause analysis and autonomous remediation across your entire fleet.',
  },
]

export function Features() {
  return (
    <section className="py-24 md:py-32 relative border-b border-neutral-800 text-white font-sans overflow-hidden">
      {/* Ambient Glowing Light Orbs (matching sibling sections) */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(32,108,232,0.22),transparent_100%)] pointer-events-none blur-3xl" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-[radial-gradient(circle_at_center,rgba(32,108,232,0.16),transparent_70%)] pointer-events-none blur-2xl" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <div className="mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight lg:whitespace-nowrap xl:text-5xl">
            The foundation for autonomous observability
          </h2>
        </div>

        {/* 6 Glassmorphism Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-3xl text-white bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] hover:border-blue-500/30 hover:shadow-[0_12px_40px_0_rgba(32,108,232,0.25)] p-6 sm:p-8 overflow-hidden transition-all duration-300 hover:-translate-y-1"
              >
                {/* Ambient Inner Glass Glow */}
                <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                <div className="h-12 w-12 rounded-2xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-inner mb-6">
                  <Icon className="h-5 w-5" />
                </div>

                <h3 className="text-lg font-bold text-white tracking-tight mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-gray-400 font-light leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  )
}

export default Features
