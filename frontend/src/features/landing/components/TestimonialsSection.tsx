import React from 'react';
import { motion } from 'framer-motion';
import { Star, ShieldCheck, Quote, Building2, CheckCircle2 } from 'lucide-react';

interface Testimonial {
  name: string;
  role: string;
  company: string;
  avatar: string;
  metric: string;
  quote: string;
  featured?: boolean;
}

const TESTIMONIALS: Testimonial[] = [
  {
    name: 'Sarah Chen',
    role: 'VP of Platform Engineering',
    company: 'Fintech Scaleup',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    metric: '90% MTTR Reduction',
    quote: 'AstraWatch eBPF probes caught memory leaks in our payment gateway before Prometheus could even scrape a single metric tick. The auto-healing CRD saved us during Black Friday.',
    featured: true,
  },
  {
    name: 'Marcus Vance',
    role: 'Principal SRE Architect',
    company: 'Global E-Commerce',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    metric: '0.25% CPU Overhead',
    quote: 'We replaced Datadog sidecars with AstraWatch. Our cluster CPU overhead dropped from 8% to less than 0.3%, saving us over $420k annually on AWS EKS compute alone.',
  },
  {
    name: 'Elena Rostova',
    role: 'Head of Infrastructure',
    company: 'Cloud Native SaaS',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
    metric: '1.4s Auto-Healing',
    quote: 'The Isolation Forest ML engine detects microsecond latency spikes with zero false positives. Our SRE on-call pages dropped by 74% in the first 30 days.',
  },
  {
    name: 'David Kim',
    role: 'Lead DevOps Specialist',
    company: 'Media Streaming Enterprise',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    metric: '10M+ Events/Sec',
    quote: 'We run over 1,200 microservices. AstraWatch automatically mapped our entire TCP flow topology in under 10 seconds without adding a single line of instrumentation code.',
  },
  {
    name: 'Rachel Adams',
    role: 'Director of Security & SRE',
    company: 'HealthTech Platform',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=150&q=80',
    metric: '100% HIPAA & SOC2 Safe',
    quote: 'Because AstraWatch runs directly in kernel space on-premise, no sensitive patient data ever leaves our VPC. It’s the gold standard for enterprise compliance.',
  },
];

export default function TestimonialsSection() {
  return (
    <section className="py-24 md:py-32 bg-black border-b border-white/10 text-white font-sans relative overflow-hidden">
      {/* Background ambient spotlight effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-96 bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(32,108,232,0.12),transparent)] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-400 mb-4 shadow-sm shadow-blue-500/20">
              <Quote className="h-3.5 w-3.5 text-blue-400" />
              <span>Customer Verification & Impact</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
              Trusted by SRE Leaders Worldwide
            </h2>
          </div>
          <div className="flex items-center gap-2 text-yellow-400 font-mono text-sm">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              ))}
            </div>
            <span className="font-bold text-white ml-2">4.9/5.0</span>
            <span className="text-gray-400 font-sans text-xs">(120+ SRE Reviews)</span>
          </div>
        </div>

        {/* Masonry Staggered Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -3 }}
              transition={{ duration: 0.2 }}
              className={`bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border rounded-3xl p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden transition-colors duration-200 ${
                t.featured
                  ? 'md:col-span-2 border-blue-500/50 shadow-2xl shadow-blue-950/40 bg-neutral-900/90'
                  : 'border-neutral-800 hover:border-blue-500/40 shadow-xl'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-400 font-mono text-xs font-bold border border-blue-500/30 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
                    {t.metric}
                  </span>
                  <Building2 className="h-5 w-5 text-gray-500" />
                </div>

                <p className="text-gray-200 text-sm sm:text-base leading-relaxed font-light mb-8">
                  "{t.quote}"
                </p>
              </div>

              <div className="flex items-center gap-4 pt-6 border-t border-neutral-800">
                <img
                  src={t.avatar}
                  alt={t.name}
                  className="h-11 w-11 rounded-full object-cover border border-neutral-700"
                />
                <div>
                  <h4 className="text-sm font-bold text-white tracking-tight">{t.name}</h4>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{t.role} • {t.company}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
