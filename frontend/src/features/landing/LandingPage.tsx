import React from 'react';
import { HeroSection } from '@/components/ui/hero-section-9';
import { Features } from '@/components/ui/features-4';
import ArchitectureSection from './components/ArchitectureSection';
import LiveDemoPreview from './components/LiveDemoPreview';
import PricingSection from './components/PricingSection';
import { TestimonialsSection } from '@/components/ui/testimonials-with-marquee';
import FAQSection from './components/FAQSection';
import ContactSection from './components/ContactSection';
import LandingFooter from './components/LandingFooter';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans w-full max-w-full overflow-x-hidden selection:bg-white selection:text-black">
      {/* 
        PERFORMANCE DIRECTIVE: 
        HeroSection & LandingFooter are strictly preserved as per user directive.
        Off-screen landing sections use CSS content-visibility: auto and contain-intrinsic-size 
        to ensure zero-lag 60fps scrolling performance.
      */}
      <main className="flex-grow w-full max-w-full overflow-x-hidden">
        <HeroSection />
        
        <div id="features" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <Features />
        </div>

        <div id="architecture" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <ArchitectureSection />
        </div>

        <div id="demo" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <LiveDemoPreview />
        </div>

        <div id="pricing" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <PricingSection />
        </div>

        <div className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <TestimonialsSection
            title="Trusted by SRE Leaders Worldwide"
            description="4.9/5.0 from 120+ SRE reviews — enterprise teams running AstraWatch in production"
            testimonials={[
              {
                author: {
                  name: 'Sarah Chen',
                  handle: '@sarahchen · VP Platform Eng, Fintech',
                  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
                },
                text: 'AstraWatch eBPF probes caught memory leaks in our payment gateway before Prometheus could even scrape a single metric tick. The auto-healing CRD saved us during Black Friday.',
                href: 'https://twitter.com/astrawatch',
              },
              {
                author: {
                  name: 'Marcus Vance',
                  handle: '@marcusvance · Principal SRE, E-Commerce',
                  avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
                },
                text: 'We replaced Datadog sidecars with AstraWatch. Cluster CPU overhead dropped from 8% to under 0.3%, saving over $420k annually on AWS EKS compute alone.',
              },
              {
                author: {
                  name: 'Elena Rostova',
                  handle: '@elenaml · Head of Infra, Cloud SaaS',
                  avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face',
                },
                text: 'The Isolation Forest ML engine detects microsecond latency spikes with zero false positives. Our SRE on-call pages dropped by 74% in the first 30 days.',
              },
              {
                author: {
                  name: 'David Kim',
                  handle: '@davidops · Lead DevOps, Media Streaming',
                  avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
                },
                text: 'We run over 1,200 microservices. AstraWatch mapped our entire TCP flow topology in under 10 seconds without adding a single line of instrumentation code.',
              },
              {
                author: {
                  name: 'Rachel Adams',
                  handle: '@rachelsec · Director Security & SRE, HealthTech',
                  avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&h=150&fit=crop&crop=face',
                },
                text: 'Because AstraWatch runs directly in kernel space on-premise, no sensitive patient data ever leaves our VPC. It\u2019s the gold standard for enterprise compliance.',
                href: 'https://twitter.com/astrawatch',
              },
            ]}
          />
        </div>

        <div id="faq" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
          <FAQSection />
        </div>

        <div id="contact" className="w-full max-w-full overflow-x-hidden [content-visibility:auto] [contain-intrinsic-size:1px_900px]">
          <ContactSection />
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
