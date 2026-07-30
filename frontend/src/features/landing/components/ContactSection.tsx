import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Send, Check, Mail } from 'lucide-react';
import MagneticButton from '@/components/ui/magnetic-button';
import { TimelineContent } from '@/components/ui/timeline-animation';
import { VerticalCutReveal } from '@/components/ui/vertical-cut-reveal';
import { Sparkles as SparklesComp } from '@/components/ui/sparkles';

type FormState = 'idle' | 'sending' | 'sent';

export default function ContactSection() {
  const [formState, setFormState] = useState<FormState>('idle');
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    type: 'Enterprise Sales',
  });

  const sectionRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: 'blur(0px)',
      transition: { delay: i * 0.2, duration: 0.4 },
    }),
    hidden: {
      filter: 'blur(10px)',
      y: -20,
      opacity: 0,
    },
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormState('sending');
    setTimeout(() => setFormState('sent'), 1400);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div
      id="contact"
      ref={sectionRef}
      className="min-h-screen mx-auto relative bg-black overflow-x-hidden border-b border-white/10"
    >
      {/* ── Pricing-style sparkle + grid top background ── */}
      <TimelineContent
        animationNum={4}
        timelineRef={sectionRef}
        customVariants={revealVariants}
        className="absolute top-0 h-96 w-screen overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] pointer-events-none"
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px]" />
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </TimelineContent>

      {/* ── Pricing-style #3131f5 ring glow ── */}
      <TimelineContent
        animationNum={5}
        timelineRef={sectionRef}
        customVariants={revealVariants}
        className="absolute left-0 top-[-114px] w-full h-[113.625vh] flex flex-col items-start justify-start content-start flex-none flex-nowrap gap-2.5 overflow-hidden p-0 z-0 pointer-events-none"
      >
        <div className="framer-1i5axl2">
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{ border: '200px solid #3131f5', filter: 'blur(92px)', WebkitFilter: 'blur(92px)' }}
          />
          <div
            className="absolute left-[-568px] right-[-568px] top-0 h-[2053px] flex-none rounded-full"
            style={{ border: '200px solid #3131f5', filter: 'blur(92px)', WebkitFilter: 'blur(92px)' }}
          />
        </div>
      </TimelineContent>

      {/* ── Pricing-style radial overlay ── */}
      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at center, #206ce8 0%, transparent 70%)',
          opacity: 0.4,
          mixBlendMode: 'screen',
        }}
      />

      {/* ── 2-Column Layout: text left, card right ── */}
      <div className="max-w-7xl mx-auto px-6 pt-32 pb-24 relative z-50">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* LEFT: Heading + subtext */}
          <div className="flex flex-col gap-6 text-left justify-center">
            <h2 className="text-4xl font-medium text-white">
              <VerticalCutReveal
                splitBy="words"
                staggerDuration={0.15}
                staggerFrom="first"
                reverse={true}
                containerClassName="text-left font-bold tracking-tight text-4xl sm:text-5xl"
                transition={{ type: 'spring', stiffness: 250, damping: 40, delay: 0 }}
              >
                Let's Build Together
              </VerticalCutReveal>
            </h2>

            <TimelineContent
              as="p"
              animationNum={0}
              timelineRef={sectionRef}
              customVariants={revealVariants}
              className="text-gray-300 max-w-md text-sm sm:text-base font-light leading-relaxed"
            >
              Whether you're evaluating AstraWatch for your Kubernetes fleet, need a proof-of-concept,
              or have a technical question — we respond fast.
            </TimelineContent>
          </div>

          {/* RIGHT: Form Card */}
          <div>
        <TimelineContent
          as="div"
          animationNum={2}
          timelineRef={sectionRef}
          customVariants={revealVariants}
        >
          <div className="relative bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-blue-500/50 rounded-2xl shadow-[0px_-13px_300px_0px_#0900ff] overflow-hidden">

            {formState === 'sent' ? (
              /* ── Success State ── */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col items-center justify-center py-20 text-center gap-6 px-8"
              >
                <div className="h-16 w-16 rounded-full bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 flex items-center justify-center shadow-2xl shadow-blue-800/60">
                  <Check className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white tracking-tight">Message Sent!</h3>
                  <p className="text-gray-400 text-sm mt-2 font-light">
                    We'll get back to you shortly at{' '}
                    <span className="text-blue-400 font-mono">{form.email}</span>
                  </p>
                </div>
                <button
                  onClick={() => {
                    setFormState('idle');
                    setForm({ name: '', email: '', company: '', message: '', type: 'Enterprise Sales' });
                  }}
                  className="px-6 py-2.5 rounded-full bg-gradient-to-t from-neutral-950 to-neutral-700 border border-neutral-700 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-neutral-900"
                >
                  Send Another Message
                </button>
              </motion.div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit} className="p-8 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3 pb-5 border-b border-neutral-700">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-t from-blue-600/20 to-blue-500/10 border border-blue-500/40 flex items-center justify-center text-blue-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">Contact Us</h3>
                    <p className="text-xs text-gray-400 font-mono">We'll respond within one business day</p>
                  </div>
                </div>

                {/* Inquiry Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Inquiry Type
                  </label>
                  <select
                    name="type"
                    value={form.type}
                    onChange={handleChange}
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all cursor-pointer"
                    style={{ backgroundImage: 'none' }}
                  >
                    <option value="Enterprise Sales" className="bg-neutral-900">Enterprise Sales</option>
                    <option value="Technical Support" className="bg-neutral-900">Technical Support</option>
                    <option value="Partnership" className="bg-neutral-900">Partnership</option>
                    <option value="Press / Media" className="bg-neutral-900">Press / Media</option>
                    <option value="Other" className="bg-neutral-900">Other</option>
                  </select>
                </div>

                {/* Name + Company */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="contact-name" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                      Full Name <span className="text-blue-400">*</span>
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      name="name"
                      required
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      className="w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label htmlFor="contact-company" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                      Company
                    </label>
                    <input
                      id="contact-company"
                      type="text"
                      name="company"
                      value={form.company}
                      onChange={handleChange}
                      placeholder="Acme Corp"
                      className="w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Work Email <span className="text-blue-400">*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    name="email"
                    required
                    value={form.email}
                    onChange={handleChange}
                    placeholder="jane@acmecorp.com"
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition-all"
                  />
                </div>

                {/* Message */}
                <div>
                  <label htmlFor="contact-message" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                    Message <span className="text-blue-400">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    name="message"
                    required
                    rows={5}
                    value={form.message}
                    onChange={handleChange}
                    placeholder="Tell us about your infrastructure scale, current observability stack, or what you'd like to evaluate..."
                    className="w-full bg-neutral-900 border border-neutral-700 focus:border-blue-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition-all resize-none"
                  />
                </div>

                {/* Submit — exact pricing CTA style */}
                <MagneticButton className="w-full" strength={0.25}>
                  <button
                    type="submit"
                    disabled={formState === 'sending'}
                    className="w-full p-3.5 text-lg rounded-xl font-bold transition-all cursor-pointer bg-gradient-to-t from-blue-500 to-blue-600 shadow-lg shadow-blue-800 border border-blue-500 text-white hover:from-blue-600 hover:to-blue-700 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {formState === 'sending' ? (
                      <>
                        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        Send Message
                      </>
                    )}
                  </button>
                </MagneticButton>

                <p className="text-center text-xs text-gray-500 pt-1">
                  By submitting you agree to our{' '}
                  <a href="#" className="text-gray-400 underline hover:text-white transition-colors">Privacy Policy</a>.
                  We never share your data.
                </p>
              </form>
            )}
          </div>
        </TimelineContent>
          </div>

        </div>
      </div>
    </div>
  );
}
