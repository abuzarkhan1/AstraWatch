import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MiniNavbar } from '@/components/ui/sign-in-flow-1';
import { SparklesComp } from '@/components/ui/sparkles';
import MagneticButton from '@/components/ui/magnetic-button';
import VerticalCutReveal from '@/components/ui/vertical-cut-reveal';
import { ArrowRight, Mail, CheckCircle2, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { endpoints } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg('');

    try {
      if (endpoints.auth.forgotPassword) {
        await endpoints.auth.forgotPassword({ email: email.trim() }).catch(() => {});
      } else {
        const { default: api } = await import('@/lib/api');
        await api.post('/api/v1/auth/forgot-password', { email: email.trim() }).catch(() => {});
      }
      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Failed to send reset link. Please verify your email and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-x-hidden border-b border-white/10 w-full flex flex-col justify-center">
      
      {/* Sparkles & Grid Background */}
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

      {/* Electric Blue Aura background */}
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
        </div>
      </div>

      {/* Radial Blue Spotlight Overlay */}
      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
          opacity: 0.5,
          mixBlendMode: "screen",
        }}
      />

      {/* Header Navigation */}
      <MiniNavbar />

      {/* Main Content Container */}
      <main className="relative z-10 pt-36 pb-20 md:pt-40 md:pb-24 px-6 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Column Copy */}
          <div className="lg:col-span-7 space-y-8 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-mono">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Password Recovery Protocol</span>
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              <VerticalCutReveal
                splitBy="words"
                staggerDuration={0.12}
                staggerFrom="first"
                reverse={true}
                containerClassName="text-left font-bold tracking-tight text-white"
                transition={{ type: "spring", stiffness: 250, damping: 40 }}
              >
                Reset Your Access Key
              </VerticalCutReveal>
            </h1>

            <p className="text-base sm:text-lg text-gray-300 font-light leading-relaxed max-w-xl">
              Regain secure control plane access. Enter your registered business email address to receive an encrypted reset link.
            </p>

            <div className="flex items-center gap-4 text-xs text-gray-400 font-mono pt-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-400" />
                <span>256-Bit TLS Encrypted</span>
              </div>
              <div className="w-1 h-1 rounded-full bg-neutral-700" />
              <div><span>Instant Delivery</span></div>
            </div>
          </div>

          {/* Right Column Glassmorphism Card */}
          <div className="lg:col-span-5 w-full max-w-md mx-auto">
            <div className="relative bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] rounded-3xl p-6 sm:p-8 overflow-hidden">
              
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

              <AnimatePresence mode="wait">
                {!submitted ? (
                  <motion.div
                    key="forgot-form"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="space-y-6"
                  >
                    <div className="text-center space-y-2">
                      <div className="mx-auto w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
                        <Mail className="h-6 w-6" />
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-white">Forgot Password?</h2>
                      <p className="text-xs text-gray-400 font-mono">
                        Enter your registered email address to receive password reset instructions.
                      </p>
                    </div>

                    {errorMsg && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono text-center">
                        {errorMsg}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div>
                        <label htmlFor="forgot-email-field" className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                          Work Email <span className="text-blue-400">*</span>
                        </label>
                        <div className="relative">
                          <input
                            id="forgot-email-field"
                            type="email"
                            placeholder="admin@astrawatch.io"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:bg-neutral-900 rounded-xl py-3.5 px-4 text-sm focus:outline-none focus:shadow-[0_0_25px_rgba(49,49,245,0.4)] transition-all duration-200 placeholder-gray-500"
                            required
                          />
                        </div>
                      </div>

                      <MagneticButton className="w-full" strength={0.25}>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-800/80 border border-blue-500 disabled:opacity-60"
                        >
                          {loading ? (
                            <>
                              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                              <span>Sending Instructions...</span>
                            </>
                          ) : (
                            <>
                              <span>Send Reset Link</span>
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </MagneticButton>
                    </form>

                    <div className="pt-2 text-center">
                      <Link
                        to="/auth/login"
                        className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors group"
                      >
                        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-1" />
                        <span>Back to Sign In</span>
                      </Link>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="forgot-success"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="space-y-6 text-center py-4"
                  >
                    <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                      <CheckCircle2 className="h-8 w-8" />
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold tracking-tight text-white">Reset Link Sent!</h2>
                      <p className="text-xs text-gray-300 font-sans leading-relaxed">
                        We sent password reset instructions to <br />
                        <span className="font-mono text-blue-400 font-semibold">{email}</span>
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-neutral-950/80 border border-neutral-800 text-xs text-gray-400 text-left space-y-2 font-mono">
                      <p className="flex items-center gap-2 text-gray-300 font-semibold">
                        <span>Check your inbox & spam folder</span>
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        Click the reset button in the email to create a new password. The link expires in 60 minutes.
                      </p>
                    </div>

                    <div className="pt-2 space-y-3">
                      <Link
                        to="/auth/login"
                        className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 border border-neutral-700"
                      >
                        <ArrowLeft className="h-4 w-4" />
                        <span>Return to Sign In</span>
                      </Link>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
