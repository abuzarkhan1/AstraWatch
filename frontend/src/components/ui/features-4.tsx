import { Cpu, Fingerprint, Pencil, Settings2, Sparkles, Zap } from 'lucide-react'

export function Features() {
    return (
        <section className="py-12 md:py-20">
            <div className="mx-auto max-w-5xl space-y-8 px-6 md:space-y-16">
                <div className="relative z-10 mx-auto max-w-xl space-y-6 text-center md:space-y-12">
                    <h2 className="text-balance text-4xl font-medium lg:text-5xl">The foundation for autonomous observability</h2>
                    <p className="text-gray-400">AstraWatch is evolving to be more than just telemetry. It supports an entire platform of agents, APIs, and tools helping developers and SRE teams observe, detect, and heal faster.</p>
                </div>

                <div className="relative mx-auto grid max-w-2xl lg:max-w-4xl divide-x divide-y divide-white/15 border border-white/15 *:p-12 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Zap className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Faaast</h3>
                        </div>
                        <p className="text-sm text-gray-400">Kernel-level eBPF probes capture telemetry with sub-millisecond overhead, no sidecars required.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Cpu className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Powerful</h3>
                        </div>
                        <p className="text-sm text-gray-400">Multi-model ML anomaly detection over metrics, traces, and logs with confidence scoring.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Fingerprint className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Security</h3>
                        </div>
                        <p className="text-sm text-gray-400">Zero sidecars, kernel CO-RE binaries, and 100% on-premise VPC-safe deployment by default.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Pencil className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Customization</h3>
                        </div>
                        <p className="text-sm text-gray-400">Drag-and-drop dashboards, custom SLOs, and runbooks tailored to your exact stack.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Settings2 className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Control</h3>
                        </div>
                        <p className="text-sm text-gray-400">Blast-radius limits and idempotency locks on every auto-healing action keep you in command.</p>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-blue-400" />
                            <h3 className="text-sm font-medium">Built for AI</h3>
                        </div>
                        <p className="text-sm text-gray-400">LLM-powered root-cause analysis and autonomous remediation across your entire fleet.</p>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default Features
