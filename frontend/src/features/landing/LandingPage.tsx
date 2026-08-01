import React from 'react';
import { HeroSection } from '@/components/ui/hero-section-9';
import { Features } from '@/components/ui/features-4';
import ArchitectureSection from './components/ArchitectureSection';
import LiveDemoPreview from './components/LiveDemoPreview';
import PricingSection from './components/PricingSection';
import TestimonialsSection from './components/TestimonialsSection';
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
          <TestimonialsSection />
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
