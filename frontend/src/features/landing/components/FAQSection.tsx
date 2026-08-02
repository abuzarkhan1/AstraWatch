import React, { useState, useMemo } from 'react';

import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import VerticalCutReveal from "@/components/ui/vertical-cut-reveal";
import { BackgroundSnippets } from "@/components/ui/background-snippets";

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'eBPF Probes' | 'Auto-Healing' | 'Pricing & Scale' | 'Security';
}

const FAQS: FAQItem[] = [
  {
    id: 'ebpf-overhead',
    category: 'eBPF Probes',
    question: 'How does AstraWatch achieve <0.32% CPU overhead without sidecars?',
    answer: 'AstraWatch uses eBPF CO-RE (Compile Once – Run Everywhere) probes loaded directly into Linux kernel space. Instead of routing traffic through user-space proxies like Envoy or sidecars, telemetry is captured at tracepoints and emitted directly via ring buffers, eliminating memory copying and CPU context switches.'
  },
  {
    id: 'k8s-auto-healing',
    category: 'Auto-Healing',
    question: 'Is autonomous K8s auto-healing safe for production environments?',
    answer: 'Yes! AstraWatch auto-healing rules run via Kubernetes Custom Resource Definitions (CRDs) with strict safety bounds: configurable blast radius caps (e.g. max 10% pod restarts/hr), canary verification checks, and PostgreSQL idempotency locks that prevent cascading execution loops.'
  },
  {
    id: 'clickhouse-retention',
    category: 'Pricing & Scale',
    question: 'Why is there zero log ingestion tax or per-gigabyte billing?',
    answer: 'Unlike traditional APM vendors that charge per gigabyte ingested, AstraWatch stores compressed telemetry inside high-density ClickHouse columnar storage on your own cloud infrastructure or managed cluster. You only pay per node flat rate.'
  },
  {
    id: 'hipaa-security',
    category: 'Security',
    question: 'Does telemetry data ever leave our cloud or VPC boundary?',
    answer: 'No. AstraWatch can be deployed fully on-premises or within your private VPC (AWS EKS, GCP GKE, Azure AKS, Bare-Metal). All ring-buffer data remains within your security perimeter to comply with SOC2 Type II, HIPAA, and GDPR standards.'
  },
  {
    id: 'prometheus-migration',
    category: 'eBPF Probes',
    question: 'Can we integrate AstraWatch with existing Grafana or OpenTelemetry pipelines?',
    answer: 'Absolutely. AstraWatch exports standard OTLP (OpenTelemetry Protocol) metrics, traces, and logs. It seamlessly exposes Prometheus endpoints and integrates into Grafana dashboards without requiring pipeline overhauls.'
  },
  {
    id: 'isolation-forest',
    category: 'Auto-Healing',
    question: 'How does the Isolation Forest ML model prevent false positives?',
    answer: 'The ML engine evaluates telemetry across 12 feature dimensions simultaneously—including socket TCP RTT, EWMA latency drift, and Z-score anomaly confidence. Auto-healing actions are only triggered when ensemble confidence exceeds 85%.'
  }
];

export default function FAQSection() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const categories = ['All', 'eBPF Probes', 'Auto-Healing', 'Pricing & Scale', 'Security'];

  const filteredFaqs = useMemo(() => {
    return FAQS.filter((faq) => {
      const matchesSearch =
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <section id="faq" className="w-full py-24 lg:py-36 relative border-b border-neutral-800 text-white font-sans overflow-hidden">
      {/* Background Snippet Component rendering [background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] */}
      <BackgroundSnippets />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Structural Layout: 2-Column Grid matching Contact & Pricing */}
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          
          {/* LEFT COLUMN: Title & Subtitle vertically centered */}
          <div className="flex flex-col gap-6 text-left justify-center self-center">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
                <VerticalCutReveal
                  splitBy="words"
                  staggerDuration={0.12}
                  staggerFrom="first"
                  reverse={true}
                  containerClassName="text-left font-bold tracking-tight text-white"
                  transition={{
                    type: "spring",
                    stiffness: 250,
                    damping: 40,
                  }}
                >
                  Everything You Need to Know
                </VerticalCutReveal>
              </h2>
              <p className="text-base sm:text-lg max-w-xl lg:max-w-lg leading-relaxed text-gray-300 font-light">
                Discover how AstraWatch eliminates sidecar overhead with kernel-level eBPF probes, sub-second ClickHouse analytics, and autonomous K8s auto-healing.
              </p>
            </div>

          {/* RIGHT COLUMN: Single Vertical Radix Accordion with All FAQs */}
          <div className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)]">
            <Accordion type="single" collapsible defaultValue="ebpf-overhead" className="w-full space-y-2">
              {FAQS.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id} className="border-b border-neutral-800 last:border-none">
                  <AccordionTrigger className="hover:no-underline py-5 text-left font-bold text-white text-base sm:text-lg">
                    <div className="flex items-center gap-3 pr-2">
                      <span className="px-2.5 py-0.5 rounded-full backdrop-blur-md bg-blue-500/10 text-blue-300 font-mono text-[10px] font-bold border border-blue-500/30 shrink-0">
                        {faq.category}
                      </span>
                      <span>{faq.question}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-gray-300 font-light text-sm leading-relaxed pb-6 pt-1">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

        </div>

      </div>
    </section>
  );
}
