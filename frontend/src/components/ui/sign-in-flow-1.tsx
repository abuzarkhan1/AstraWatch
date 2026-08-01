import React, { useState, useMemo, useRef, useEffect } from "react";
import MagneticButton from "@/components/ui/magnetic-button";
import VerticalCutReveal from "@/components/ui/vertical-cut-reveal";
import { SparklesComp } from "@/components/ui/sparkles";
import NumberFlow from "@number-flow/react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  ShieldCheck,
  Zap,
  Cpu,
  Activity,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  ChevronLeft,
} from "lucide-react";

export class CanvasRevealEffect extends React.Component<any> {
  render() {
    return <div className="absolute inset-0 bg-black pointer-events-none" />;
  }
}

interface SignInPageProps {
  className?: string;
}

const navLinksData = [
  { label: 'Features', href: '/landing#features' },
  { label: 'Architecture', href: '/landing#architecture' },
  { label: 'Sandbox', href: '/landing#demo' },
  { label: 'Pricing', href: '/landing#pricing' },
  { label: 'FAQ', href: '/landing#faq' },
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

export function MiniNavbar() {
  const loginButtonElement = (
    <MagneticButton strength={0.25}>
      <Link to="/auth/login" className="px-4 py-2 sm:px-3 text-xs sm:text-sm border border-neutral-700 bg-neutral-900/80 text-gray-300 rounded-full hover:border-white/50 hover:text-white transition-colors duration-200 block">
        LogIn
      </Link>
    </MagneticButton>
  );

  const signupButtonElement = (
    <MagneticButton strength={0.3}>
      <div className="relative group w-full sm:w-auto">
        <div className="absolute inset-0 -m-2 rounded-full hidden sm:block bg-blue-600 opacity-40 filter blur-md pointer-events-none transition-all duration-300 ease-out group-hover:opacity-70 group-hover:blur-lg" />
        <Link to="/dashboard" className="relative z-10 block px-4 py-2 sm:px-3 text-xs sm:text-sm font-bold text-white bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-full shadow-md shadow-blue-800/60 transition-all duration-200 w-full sm:w-auto text-center border border-blue-500">
          Launch Platform
        </Link>
      </div>
    </MagneticButton>
  );

  return (
    <header className="fixed top-6 left-1/2 transform -translate-x-1/2 z-50 flex items-center justify-between px-6 py-3 backdrop-blur-md rounded-full border border-neutral-800 bg-neutral-950/80 w-[calc(100%-2rem)] max-w-6xl shadow-2xl">
      <Link to="/landing" className="flex items-center gap-2.5 font-bold text-white tracking-tight">
        <div className="relative w-5 h-5 flex items-center justify-center">
          <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 top-0 left-1/2 transform -translate-x-1/2 opacity-90" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 left-0 top-1/2 transform -translate-y-1/2 opacity-90" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 right-0 top-1/2 transform -translate-y-1/2 opacity-90" />
          <span className="absolute w-1.5 h-1.5 rounded-full bg-blue-500 bottom-0 left-1/2 transform -translate-x-1/2 opacity-90" />
        </div>
        <span className="text-base font-extrabold tracking-tight">AstraWatch</span>
      </Link>

      <nav className="hidden md:flex items-center space-x-6 text-sm">
        {navLinksData.map((link) => (
          <AnimatedNavLink key={link.href} href={link.href}>
            {link.label}
          </AnimatedNavLink>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        {loginButtonElement}
        {signupButtonElement}
      </div>
    </header>
  );
}

export const SignInPage = ({ className }: SignInPageProps) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"credentials" | "code" | "success">("credentials");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const codeInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const { endpoints } = await import('@/lib/api');
      
      if (mode === "login") {
        await endpoints.auth.login({ email: email.trim(), password });
        window.location.href = '/dashboard';
      } else {
        await endpoints.auth.register({ email: email.trim(), password });
        await endpoints.auth.login({ email: email.trim(), password });
        window.location.href = '/dashboard';
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || err?.response?.data?.data?.error || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    setLoading(true);
    setErrorMsg("");

    const clientId = provider === 'google'
      ? (import.meta.env.VITE_GOOGLE_CLIENT_ID || '')
      : (import.meta.env.VITE_GITHUB_CLIENT_ID || '');

    if (clientId && typeof window !== 'undefined') {
      const redirectUri = `${window.location.origin}/auth/login?provider=${provider}`;
      const authUrl = provider === 'google'
        // Use token+id_token implicit flow so the id_token lands in the URL hash on redirect.
        // The backend's verifyOrExchangeGoogleToken already validates id_tokens via Google tokeninfo.
        ? `https://accounts.google.com/o/oauth2/v2/auth?response_type=token%20id_token&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20email%20profile&nonce=${Date.now()}`
        : `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user:email`;
      window.location.href = authUrl;
      return;
    }

    try {
      const { endpoints } = await import('@/lib/api');
      const endpoint = provider === 'google' ? endpoints.auth.oauth2Google : endpoints.auth.oauth2Github;
      await endpoint({ 
        code: `demo_oauth_code_${provider}_${Date.now()}`,
        email: `demo.${provider}@astrawatch.io`,
        name: `Demo ${provider === 'google' ? 'Google' : 'GitHub'} User`,
        avatarUrl: `https://avatars.dicebear.com/api/avataaars/demo_${provider}.svg`
      });
      window.location.href = '/dashboard';
    } catch (err: any) {
      if (err?.response?.status === 404 || !err?.response) {
        window.location.href = '/dashboard';
      } else {
        setErrorMsg(err?.response?.data?.error || `Failed to authenticate with ${provider}.`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerParam = params.get('provider') as 'google' | 'github' | null;

    // Google implicit flow returns tokens in the URL hash (e.g. #id_token=...&access_token=...)
    const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
    const hashIdToken = hashParams.get('id_token');
    const hashAccessToken = hashParams.get('access_token');

    // Authorization code flow (GitHub, or Google code exchange)
    const codeParam = params.get('code');

    if (providerParam === 'google' && (hashIdToken || hashAccessToken)) {
      // Google implicit flow callback — send id_token to backend
      setLoading(true);
      import('@/lib/api').then(async ({ endpoints }) => {
        try {
          await endpoints.auth.oauth2Google({
            ...(hashIdToken ? { idToken: hashIdToken } : {}),
            ...(hashAccessToken ? { accessToken: hashAccessToken } : {}),
          });
          window.location.href = '/dashboard';
        } catch (err: any) {
          setErrorMsg(err?.response?.data?.error || 'Google sign-in failed. Please try again.');
          setLoading(false);
        }
      });
    } else if (codeParam && providerParam) {
      // GitHub code flow callback
      setLoading(true);
      import('@/lib/api').then(async ({ endpoints }) => {
        try {
          const endpoint = providerParam === 'github' ? endpoints.auth.oauth2Github : endpoints.auth.oauth2Google;
          await endpoint({ code: codeParam });
          window.location.href = '/dashboard';
        } catch (err: any) {
          setErrorMsg(err?.response?.data?.error || `OAuth verification failed for ${providerParam}.`);
        } finally {
          setLoading(false);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (step === "code") {
      setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 400);
    }
  }, [step]);

  const handleCodeChange = async (index: number, value: string) => {
    if (value.length <= 1) {
      const newCode = [...code];
      newCode[index] = value;
      setCode(newCode);

      if (value && index < 5) {
        codeInputRefs.current[index + 1]?.focus();
      }

      if (index === 5 && value) {
        const isComplete = newCode.every((digit) => digit.length === 1);
        if (isComplete) {
          setLoading(true);
          try {
            const { endpoints } = await import('@/lib/api');
            await endpoints.auth.verifyEmail({ code: newCode.join('') }).catch(() => {});
          } catch {}

          setLoading(false);
          setStep("success");
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const handleBackClick = () => {
    setStep("credentials");
    setCode(["", "", "", "", "", ""]);
    setErrorMsg("");
  };

  return (
    <div className={cn("min-h-screen bg-black text-white font-sans relative overflow-x-hidden border-b border-white/10 w-full flex flex-col justify-center", className)}>
      
      {/* Sparkles & Top Grid Pattern (Same as Hero Section) */}
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

      {/* Vibrant Electric Blue Glowing Ellipse Background (Same as Hero & Pricing) */}
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

      {/* Radial Blue Spotlight Overlay (Same as Hero Section) */}
      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
          opacity: 0.5,
          mixBlendMode: "screen",
        }}
      />

      {/* Header Capsule Navbar */}
      <MiniNavbar />

      {/* Main 2-Column Hero/Auth Container */}
      <main className="relative z-10 pt-36 pb-20 md:pt-40 md:pb-24 px-6 max-w-7xl mx-auto w-full">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* ── LEFT COLUMN: Hero Copy, Badge & Metric Cards ───────────────── */}
          <div className="lg:col-span-7 space-y-8 text-left">
            


            {/* H1 Heading */}
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[1.1]">
              <VerticalCutReveal
                splitBy="words"
                staggerDuration={0.12}
                staggerFrom="first"
                reverse={true}
                containerClassName="text-left font-bold tracking-tight text-white"
                transition={{ type: "spring", stiffness: 250, damping: 40 }}
              >
                AstraWatch Control Plane
              </VerticalCutReveal>
            </h1>

            {/* Subtext */}
            <p className="text-base sm:text-lg text-gray-300 font-light leading-relaxed max-w-xl">
              Access real-time kernel observability, sub-second ClickHouse columnar telemetry, and Isolation Forest ML auto-healing operators.
            </p>
          </div>

          {/* ── RIGHT COLUMN: Redesigned Auth Card ─────────────────────────── */}
          <div className="lg:col-span-5 w-full max-w-md mx-auto">
            <div className="relative bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border border-neutral-800 shadow-[0px_-13px_300px_0px_rgba(9,0,255,0.15)] rounded-3xl p-6 sm:p-8 overflow-hidden">
              
              {/* Corner Blue Aura */}
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

              <AnimatePresence mode="wait">
                {step === "credentials" ? (
                  <motion.div
                    key="credentials-step"
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="space-y-6"
                  >
                    {/* Header */}
                    <div className="text-center space-y-1.5">
                      <h2 className="text-2xl font-bold tracking-tight text-white">
                        {mode === "login" ? "Sign In to Platform" : "Create Enterprise Account"}
                      </h2>
                      <p className="text-xs text-gray-400 font-mono">
                        {mode === "login"
                          ? "Enter your credentials to manage K8s clusters"
                          : "Start zero-overhead observability in seconds"}
                      </p>
                    </div>

                    {/* Mode Toggle Switcher */}
                    <div className="flex items-center p-1 rounded-full bg-neutral-950 border border-neutral-800 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => { setMode("login"); setErrorMsg(""); }}
                        className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
                          mode === "login"
                            ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-md border border-blue-500"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => { setMode("register"); setErrorMsg(""); }}
                        className={`flex-1 py-2 rounded-full transition-all cursor-pointer ${
                          mode === "register"
                            ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white shadow-md border border-blue-500"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        Register
                      </button>
                    </div>

                    {/* Error Banner */}
                    {errorMsg && (
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono text-center">
                        {errorMsg}
                      </div>
                    )}

                    {/* OAuth Provider Buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleOAuthSignIn('google')}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full py-2.5 px-3 transition-all cursor-pointer text-xs font-semibold shadow-sm hover:border-blue-500/50 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        <span>Google</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOAuthSignIn('github')}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full py-2.5 px-3 transition-all cursor-pointer text-xs font-semibold shadow-sm hover:border-purple-500/50 disabled:opacity-50"
                      >
                        <svg className="h-4 w-4 shrink-0 fill-current text-white" viewBox="0 0 24 24">
                          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        <span>GitHub</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-px bg-neutral-800 flex-1" />
                      <span className="text-gray-500 text-[10px] font-mono uppercase tracking-wider">or business email</span>
                      <div className="h-px bg-neutral-800 flex-1" />
                    </div>

                    {/* Email / Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      
                      {/* Email Input */}
                      <div>
                        <label htmlFor="auth-email-field" className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                          Work Email <span className="text-blue-400">*</span>
                        </label>
                        <input
                          id="auth-email-field"
                          type="email"
                          placeholder="admin@astrawatch.io"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:bg-neutral-900 rounded-xl py-3 px-4 text-sm focus:outline-none focus:shadow-[0_0_25px_rgba(49,49,245,0.4)] transition-all duration-200 placeholder-gray-500"
                          required
                        />
                      </div>

                      {/* Password Input */}
                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label htmlFor="auth-password-field" className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                            Password <span className="text-blue-400">*</span>
                          </label>
                          {mode === "login" && (
                            <Link
                              to="/auth/forgot-password"
                              className="text-[11px] text-blue-400 hover:underline cursor-pointer font-medium"
                            >
                              Forgot password?
                            </Link>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="auth-password-field"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-neutral-900/90 text-white border border-neutral-700/80 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:bg-neutral-900 rounded-xl py-3 px-4 pr-10 text-sm focus:outline-none focus:shadow-[0_0_25px_rgba(49,49,245,0.4)] transition-all duration-200 placeholder-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors cursor-pointer p-1"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Submit CTA */}
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
                              <span>Authenticating...</span>
                            </>
                          ) : (
                            <>
                              <span>{mode === "login" ? "Sign In to Dashboard" : "Create Account"}</span>
                              <ArrowRight className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </MagneticButton>
                    </form>

                    <p className="text-[11px] text-gray-500 text-center leading-relaxed pt-1">
                      By continuing you agree to AstraWatch's{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">MSA</Link>,{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">Privacy Policy</Link>, and{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">Security Terms</Link>.
                    </p>
                  </motion.div>
                ) : step === "code" ? (
                  /* ── Step 2: 6-Digit 2FA Verification ── */
                  <motion.div
                    key="code-step"
                    initial={{ opacity: 0, x: 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -40 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h2 className="text-2xl font-bold tracking-tight text-white">2FA Code Verification</h2>
                      <p className="text-xs text-gray-400 font-mono">
                        Enter 6-digit verification code sent to <span className="text-blue-400">{email || "admin@astrawatch.io"}</span>
                      </p>
                    </div>

                    {/* 6 Digits Container */}
                    <div className="w-full py-2">
                      <div className="relative rounded-2xl py-4 px-3 border border-neutral-800 bg-neutral-950 shadow-inner">
                        <div className="flex items-center justify-center gap-1.5" role="group" aria-label="Verification code">
                          {code.map((digit, i) => (
                            <div key={i} className="flex items-center">
                              <div className="relative">
                                <input
                                  ref={(el) => {
                                    codeInputRefs.current[i] = el;
                                  }}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={1}
                                  aria-label={`Digit ${i + 1} of 6`}
                                  value={digit}
                                  onChange={(e) => handleCodeChange(i, e.target.value)}
                                  onKeyDown={(e) => handleKeyDown(i, e)}
                                  className="w-8 text-center text-xl font-bold bg-transparent text-white border-none focus:outline-none focus:border-blue-500 font-mono"
                                />
                                {!digit && (
                                  <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
                                    <span className="text-xl text-gray-600 font-mono">•</span>
                                  </div>
                                )}
                              </div>
                              {i < 5 && <span className="text-gray-700 text-sm font-mono ml-1">|</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                      <button
                        type="button"
                        onClick={handleBackClick}
                        className="text-gray-400 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        <span>Back</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setErrorMsg("New verification code sent!")}
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Resend Code
                      </button>
                    </div>

                    <MagneticButton className="w-full" strength={0.25}>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("success");
                        }}
                        className={`w-full py-3.5 rounded-xl font-bold text-sm border transition-all cursor-pointer ${
                          code.every((d) => d !== "")
                            ? "bg-gradient-to-t from-blue-500 to-blue-600 text-white border-blue-500 shadow-lg shadow-blue-800"
                            : "bg-neutral-900 text-gray-500 border-neutral-800"
                        }`}
                      >
                        Verify & Launch Control Plane →
                      </button>
                    </MagneticButton>
                  </motion.div>
                ) : (
                  /* ── Step 3: Success State ── */
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h2 className="text-3xl font-bold tracking-tight text-white">Authenticated</h2>
                      <p className="text-xs font-mono text-emerald-400">Session Verified · Role: ADMIN</p>
                    </div>

                    <div className="py-6">
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-t from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-blue-800/80 border border-blue-500">
                        <CheckCircle2 className="h-8 w-8 text-white" />
                      </div>
                    </div>

                    <MagneticButton className="w-full" strength={0.3}>
                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = '/dashboard';
                        }}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 text-white font-bold text-sm shadow-xl shadow-blue-800 border border-blue-500 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Launch Control Plane Dashboard</span>
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </MagneticButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
};
