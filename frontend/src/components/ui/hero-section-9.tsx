import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { HeroSection as ShadcnHeroSection } from "@/components/ui/hero-section-shadcnui";
import { SparklesComp } from "@/components/ui/sparkles";
import { TimelineContent } from "@/components/ui/timeline-animation";
import {
  Zap,
  Activity,
  Cpu,
  Server,
  Terminal,
  Database,
  X,
} from "lucide-react";

const navLinksData = [
  { label: 'Features', href: '#features' },
  { label: 'Architecture', href: '#architecture' },
  { label: 'Sandbox', href: '#demo' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

const AnimatedNavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  return (
    <a href={href} className="group relative inline-block overflow-hidden h-5 flex items-center text-sm">
      <div className="flex flex-col transition-transform duration-300 ease-out transform group-hover:-translate-y-1/2">
        <span className="text-gray-300">{children}</span>
        <span className="text-white font-medium">{children}</span>
      </div>
    </a>
  );
};

export function FloatingNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState('rounded-full');
  const shapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    if (isOpen) {
      setHeaderShapeClass('rounded-2xl');
    } else {
      shapeTimeoutRef.current = setTimeout(() => {
        setHeaderShapeClass('rounded-full');
      }, 300);
    }
    return () => {
      if (shapeTimeoutRef.current) clearTimeout(shapeTimeoutRef.current);
    };
  }, [isOpen]);

  return (
    <header className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-50
                       flex flex-col items-center
                       px-6 py-3 backdrop-blur-md
                       ${headerShapeClass}
                       border border-neutral-800 bg-neutral-950/80
                       w-[calc(100%-2rem)] max-w-5xl
                       transition-[border-radius] duration-300 ease-in-out shadow-2xl`}>

      <div className="flex items-center justify-between w-full gap-x-6 sm:gap-x-10">
        {/* Brand Logo */}
        <Link to="/landing" className="flex items-center gap-2.5 font-bold text-white tracking-tight">
          <div className="relative w-5 h-5 flex items-center justify-center">
            <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 top-0 left-1/2 transform -translate-x-1/2 opacity-90"></span>
            <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 left-0 top-1/2 transform -translate-y-1/2 opacity-90"></span>
            <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 right-0 top-1/2 transform -translate-y-1/2 opacity-90"></span>
            <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 bottom-0 left-1/2 transform -translate-x-1/2 opacity-90"></span>
          </div>
          <span className="text-base font-extrabold tracking-tight">AstraWatch</span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center space-x-6 text-sm">
          {navLinksData.map((link) => (
            <AnimatedNavLink key={link.href} href={link.href}>
              {link.label}
            </AnimatedNavLink>
          ))}
        </nav>

        {/* Buttons */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            to="/auth/login"
            className="px-4 py-2 text-xs sm:text-sm border border-neutral-700 bg-neutral-900 text-gray-200 rounded-full hover:border-neutral-500 hover:text-white transition-colors duration-200"
          >
            LogIn
          </Link>
          <div className="relative group">
            <div className="absolute inset-0 -m-1 rounded-full hidden sm:block bg-blue-600 opacity-50 filter blur-md pointer-events-none transition-all duration-300 ease-out group-hover:opacity-80 group-hover:blur-lg" />
            <Link
              to="/dashboard"
              className="relative z-10 block px-5 py-2 text-xs sm:text-sm font-bold text-white bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 rounded-full transition-all duration-200 shadow-md shadow-blue-800"
            >
              Launch Platform
            </Link>
          </div>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden flex items-center justify-center w-8 h-8 text-gray-300 focus:outline-none cursor-pointer"
          onClick={toggleMenu}
          aria-label={isOpen ? 'Close Menu' : 'Open Menu'}
        >
          {isOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown */}
      {isOpen && (
        <div className="md:hidden flex flex-col items-center w-full pt-4 space-y-3">
          <nav className="flex flex-col items-center space-y-3 text-sm w-full">
            {navLinksData.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="text-gray-300 hover:text-white transition-colors w-full text-center py-1"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col items-center space-y-2 pt-2 w-full border-t border-neutral-800">
            <Link
              to="/auth/login"
              className="w-full text-center py-2 text-xs border border-neutral-700 bg-neutral-900 text-gray-200 rounded-full"
            >
              LogIn
            </Link>
            <Link
              to="/dashboard"
              className="w-full text-center py-2 text-xs font-bold text-white bg-gradient-to-t from-blue-500 to-blue-600 rounded-full"
            >
              Launch Dashboard
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export const HeroSection = () => {
  return (
    <div className="relative min-h-screen bg-black text-white font-sans overflow-hidden border-b border-white/10 w-full flex flex-col justify-center">
      
      {/* Background Sparkles & Grid Layer */}
      <div className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none z-0">
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]" />
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </div>

      {/* Vibrant Electric Blue Glowing Ellipse Background (Identical to Pricing Section 4) */}
      <div className="absolute left-0 top-[-114px] w-full h-[113.625vh] flex flex-col items-start justify-start content-start flex-none flex-nowrap gap-2.5 overflow-hidden p-0 z-0 pointer-events-none">
        <div>
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: "200px solid #3131f5",
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
          />
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{
              border: "200px solid #3131f5",
              filter: "blur(92px)",
              WebkitFilter: "blur(92px)",
            }}
          />
        </div>
      </div>

      {/* Radial Blue Spotlight Overlay (Identical to Pricing Section 4) */}
      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
          opacity: 0.5,
          mixBlendMode: "screen",
        }}
      />

      {/* Floating Capsule Navbar */}
      <FloatingNavbar />

      {/* Hero Content */}
      <main className="relative z-10 pt-36 pb-20 md:pt-40 md:pb-24 px-4 max-w-7xl mx-auto w-full">
        {/* Render Shadcn Hero Component */}
        <ShadcnHeroSection />
      </main>

      {/* Enterprise Partner Logos Bar */}
      <section className="py-10 border-t border-neutral-800 bg-black/90 relative z-10">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-center text-xs font-semibold text-gray-500 mb-6 uppercase tracking-wider font-mono">
            Trusted by SREs at High-Growth Enterprise SaaS
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 opacity-75 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Cpu className="h-5 w-5 text-blue-400" />
              <span>NVIDIA</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Server className="h-5 w-5 text-blue-400" />
              <span>GitHub</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Zap className="h-5 w-5 text-blue-400" />
              <span>OpenAI</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Activity className="h-5 w-5 text-blue-400" />
              <span>Vercel</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Terminal className="h-5 w-5 text-blue-400" />
              <span>Tailwind CSS</span>
            </div>
            <div className="flex items-center gap-2.5 text-gray-300 font-bold text-sm">
              <Database className="h-5 w-5 text-blue-400" />
              <span>Datadog</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
