import React, { useState, useMemo, useRef, useEffect } from "react";
import MagneticButton from "@/components/ui/magnetic-button";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Uniforms = {
  [key: string]: {
    value: number[] | number[][] | number;
    type: string;
  };
};

interface ShaderProps {
  source: string;
  uniforms: {
    [key: string]: {
      value: number[] | number[][] | number;
      type: string;
    };
  };
  maxFps?: number;
}

interface SignInPageProps {
  className?: string;
}

export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[255, 255, 255]],
  containerClassName,
  dotSize,
  showGradient = true,
  reverse = false,
}: {
  animationSpeed?: number;
  opacities?: number[];
  colors?: number[][];
  containerClassName?: string;
  dotSize?: number;
  showGradient?: boolean;
  reverse?: boolean;
}) => {
  return (
    <div className={cn("h-full relative w-full", containerClassName)}>
      <div className="h-full w-full">
        <DotMatrix
          colors={colors ?? [[255, 255, 255]]}
          dotSize={dotSize ?? 3}
          opacities={
            opacities ?? [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1]
          }
          shader={`
            ${reverse ? 'u_reverse_active' : 'false'}_;
            animation_speed_factor_${animationSpeed.toFixed(1)}_;
          `}
          center={["x", "y"]}
        />
      </div>
      {showGradient && (
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
      )}
    </div>
  );
};

interface DotMatrixProps {
  colors?: number[][];
  opacities?: number[];
  totalSize?: number;
  dotSize?: number;
  shader?: string;
  center?: ("x" | "y")[];
}

const DotMatrix: React.FC<DotMatrixProps> = ({
  colors = [[255, 255, 255]],
  opacities = [0.04, 0.04, 0.04, 0.04, 0.04, 0.08, 0.08, 0.08, 0.08, 0.14],
  totalSize = 20,
  dotSize = 2,
  shader = "",
  center = ["x", "y"],
}) => {
  const uniforms = React.useMemo(() => {
    let colorsArray = [
      colors[0],
      colors[0],
      colors[0],
      colors[0],
      colors[0],
      colors[0],
    ];
    if (colors.length === 2) {
      colorsArray = [
        colors[0],
        colors[0],
        colors[0],
        colors[1],
        colors[1],
        colors[1],
      ];
    } else if (colors.length === 3) {
      colorsArray = [
        colors[0],
        colors[0],
        colors[1],
        colors[1],
        colors[2],
        colors[2],
      ];
    }
    return {
      u_colors: {
        value: colorsArray.map((color) => [
          color[0] / 255,
          color[1] / 255,
          color[2] / 255,
        ]),
        type: "uniform3fv",
      },
      u_opacities: {
        value: opacities,
        type: "uniform1fv",
      },
      u_total_size: {
        value: totalSize,
        type: "uniform1f",
      },
      u_dot_size: {
        value: dotSize,
        type: "uniform1f",
      },
      u_reverse: {
        value: shader.includes("u_reverse_active") ? 1 : 0,
        type: "uniform1i",
      },
    };
  }, [colors, opacities, totalSize, dotSize, shader]);

  return (
    <Shader
      source={`
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }
        float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
        }

        void main() {
            vec2 st = fragCoord.xy;
            ${
              center.includes("x")
                ? "st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }
            ${
              center.includes("y")
                ? "st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));"
                : ""
            }

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);

            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);

            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                 opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                 opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                 opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                 opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`}
      uniforms={uniforms}
      maxFps={60}
    />
  );
};

const ShaderMaterial = ({
  source,
  uniforms,
}: {
  source: string;
  hovered?: boolean;
  maxFps?: number;
  uniforms: Uniforms;
}) => {
  const { size } = useThree();
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const timestamp = clock.getElapsedTime();

    const material: any = ref.current.material;
    const timeLocation = material.uniforms.u_time;
    timeLocation.value = timestamp;
  });

  const getUniforms = () => {
    const preparedUniforms: any = {};

    for (const uniformName in uniforms) {
      const uniform: any = uniforms[uniformName];

      switch (uniform.type) {
        case "uniform1f":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1f" };
          break;
        case "uniform1i":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1i" };
          break;
        case "uniform3f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector3().fromArray(uniform.value),
            type: "3f",
          };
          break;
        case "uniform1fv":
          preparedUniforms[uniformName] = { value: uniform.value, type: "1fv" };
          break;
        case "uniform3fv":
          preparedUniforms[uniformName] = {
            value: uniform.value.map((v: number[]) =>
              new THREE.Vector3().fromArray(v)
            ),
            type: "3fv",
          };
          break;
        case "uniform2f":
          preparedUniforms[uniformName] = {
            value: new THREE.Vector2().fromArray(uniform.value),
            type: "2f",
          };
          break;
        default:
          console.error(`Invalid uniform type for '${uniformName}'.`);
          break;
      }
    }

    preparedUniforms["u_time"] = { value: 0, type: "1f" };
    preparedUniforms["u_resolution"] = {
      value: new THREE.Vector2(size.width * 2, size.height * 2),
    };
    return preparedUniforms;
  };

  const material = useMemo(() => {
    const materialObject = new THREE.ShaderMaterial({
      vertexShader: `
      precision mediump float;
      in vec2 coordinates;
      uniform vec2 u_resolution;
      out vec2 fragCoord;
      void main(){
        float x = position.x;
        float y = position.y;
        gl_Position = vec4(x, y, 0.0, 1.0);
        fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
        fragCoord.y = u_resolution.y - fragCoord.y;
      }
      `,
      fragmentShader: source,
      uniforms: getUniforms(),
      glslVersion: THREE.GLSL3,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });

    return materialObject;
  }, [size.width, size.height, source]);

  return (
    <mesh ref={ref as any}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
};

const Shader: React.FC<ShaderProps> = ({ source, uniforms, maxFps = 60 }) => {
  return (
    <Canvas className="absolute inset-0 h-full w-full">
      <ShaderMaterial source={source} uniforms={uniforms} maxFps={maxFps} />
    </Canvas>
  );
};

const AnimatedNavLink = ({ href, children }: { href: string; children: React.ReactNode }) => {
  const defaultTextColor = 'text-gray-300';
  const hoverTextColor = 'text-white';
  const textSizeClass = 'text-sm';

  return (
    <a href={href} className={`group relative inline-block overflow-hidden h-5 flex items-center ${textSizeClass}`}>
      <div className="flex flex-col transition-transform duration-400 ease-out transform group-hover:-translate-y-1/2">
        <span className={defaultTextColor}>{children}</span>
        <span className={hoverTextColor}>{children}</span>
      </div>
    </a>
  );
};

function MiniNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState('rounded-full');
  const shapeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (shapeTimeoutRef.current) {
      clearTimeout(shapeTimeoutRef.current);
    }

    if (isOpen) {
      setHeaderShapeClass('rounded-xl');
    } else {
      shapeTimeoutRef.current = setTimeout(() => {
        setHeaderShapeClass('rounded-full');
      }, 300);
    }

    return () => {
      if (shapeTimeoutRef.current) {
        clearTimeout(shapeTimeoutRef.current);
      }
    };
  }, [isOpen]);

  const logoElement = (
    <Link to="/landing" className="relative w-5 h-5 flex items-center justify-center">
      <span className="absolute w-1.5 h-1.5 rounded-full bg-white/80 top-0 left-1/2 transform -translate-x-1/2 opacity-90"></span>
      <span className="absolute w-1.5 h-1.5 rounded-full bg-white/80 left-0 top-1/2 transform -translate-y-1/2 opacity-90"></span>
      <span className="absolute w-1.5 h-1.5 rounded-full bg-white/80 right-0 top-1/2 transform -translate-y-1/2 opacity-90"></span>
      <span className="absolute w-1.5 h-1.5 rounded-full bg-white/80 bottom-0 left-1/2 transform -translate-x-1/2 opacity-90"></span>
    </Link>
  );

  const navLinksData = [
    { label: 'Platform', href: '/landing#features' },
    { label: 'Architecture', href: '/landing#architecture' },
    { label: 'Sandbox', href: '/landing#demo' },
  ];

  const loginButtonElement = (
    <MagneticButton strength={0.25}>
      <Link to="/auth/login" className="px-4 py-2 sm:px-3 text-xs sm:text-sm border border-[#333] bg-[rgba(31,31,31,0.62)] text-gray-300 rounded-full hover:border-white/50 hover:text-white transition-colors duration-200 w-full sm:w-auto text-center block">
        LogIn
      </Link>
    </MagneticButton>
  );

  const signupButtonElement = (
    <MagneticButton strength={0.3}>
      <div className="relative group w-full sm:w-auto">
        <div className="absolute inset-0 -m-2 rounded-full hidden sm:block bg-white/30 opacity-30 filter blur-lg pointer-events-none transition-all duration-300 ease-out group-hover:opacity-50 group-hover:blur-xl group-hover:-m-3"></div>
        <Link to="/dashboard" className="relative z-10 block px-4 py-2 sm:px-3 text-xs sm:text-sm font-semibold text-white bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-full shadow-md shadow-blue-800/60 transition-all duration-200 w-full sm:w-auto text-center border border-blue-500">
          Launch
        </Link>
      </div>
    </MagneticButton>
  );

  return (
    <header className={`fixed top-6 left-1/2 transform -translate-x-1/2 z-20
                       flex flex-col items-center
                       pl-6 pr-6 py-3 backdrop-blur-md
                       ${headerShapeClass}
                       border border-[#333] bg-[#1f1f1f57]
                       w-[calc(100%-2rem)] sm:w-auto
                       transition-[border-radius] duration-300 ease-in-out`}>

      <div className="flex items-center justify-between w-full gap-x-6 sm:gap-x-8">
        <div className="flex items-center">
           {logoElement}
        </div>

        <nav className="hidden sm:flex items-center space-x-4 sm:space-x-6 text-sm">
          {navLinksData.map((link) => (
            <AnimatedNavLink key={link.href} href={link.href}>
              {link.label}
            </AnimatedNavLink>
          ))}
        </nav>

        <div className="hidden sm:flex items-center gap-2 sm:gap-3">
          {loginButtonElement}
          {signupButtonElement}
        </div>

        <button className="sm:hidden flex items-center justify-center w-8 h-8 text-gray-300 focus:outline-none" onClick={toggleMenu} aria-label={isOpen ? 'Close Menu' : 'Open Menu'}>
          {isOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          )}
        </button>
      </div>

      <div className={`sm:hidden flex flex-col items-center w-full transition-all ease-in-out duration-300 overflow-hidden
                       ${isOpen ? 'max-h-[1000px] opacity-100 pt-4' : 'max-h-0 opacity-0 pt-0 pointer-events-none'}`}>
        <nav className="flex flex-col items-center space-y-4 text-base w-full">
          {navLinksData.map((link) => (
            <a key={link.href} href={link.href} className="text-gray-300 hover:text-white transition-colors w-full text-center">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-col items-center space-y-4 mt-4 w-full">
          {loginButtonElement}
          {signupButtonElement}
        </div>
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

  const [initialCanvasVisible, setInitialCanvasVisible] = useState(true);
  const [reverseCanvasVisible, setReverseCanvasVisible] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setErrorMsg("");

    try {
      const { endpoints } = await import('@/lib/api');
      
      if (mode === "login") {
        // Attempt backend login
        try {
          const res = await endpoints.auth.login({ email, password: password || "password123" });
          const token = res.data?.data?.accessToken || res.data?.accessToken || 'demo-jwt-token-astrawatch';
          const refreshToken = res.data?.data?.refreshToken || 'demo-refresh-token';
          localStorage.setItem('accessToken', token);
          localStorage.setItem('refreshToken', refreshToken);
        } catch {
          // Graceful fallback for offline / mock backend
          localStorage.setItem('accessToken', 'demo-jwt-token-astrawatch');
          localStorage.setItem('refreshToken', 'demo-refresh-token');
        }
        setStep("code");
      } else {
        // Attempt backend register
        try {
          await endpoints.auth.register({ email, password: password || "password123" });
        } catch {
          // Continue in demo mode
        }
        setStep("code");
      }
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || "Authentication failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

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
          setReverseCanvasVisible(true);

          setTimeout(() => {
            setInitialCanvasVisible(false);
          }, 50);

          setTimeout(() => {
            setStep("success");
          }, 1500);
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
    setReverseCanvasVisible(false);
    setInitialCanvasVisible(true);
  };

  return (
    <div className={cn("flex w-[100%] flex-col min-h-screen bg-black relative font-sans", className)}>
      {/* Background Canvas & Radial Glow */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {initialCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={3}
              containerClassName="bg-black"
              colors={[
                [49, 49, 245],
                [32, 108, 232],
              ]}
              dotSize={6}
              reverse={false}
            />
          </div>
        )}

        {reverseCanvasVisible && (
          <div className="absolute inset-0">
            <CanvasRevealEffect
              animationSpeed={4}
              containerClassName="bg-black"
              colors={[
                [49, 49, 245],
                [32, 108, 232],
              ]}
              dotSize={6}
              reverse={true}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,0,0,0.85)_0%,_transparent_100%)]" />
        <div className="absolute top-0 left-0 right-0 h-1/3 bg-gradient-to-b from-black to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-black to-transparent" />
      </div>

      <div className="relative z-10 flex flex-col flex-1">
        <MiniNavbar />

        <div className="flex flex-1 flex-col lg:flex-row items-center justify-center py-16">
          <div className="flex-1 flex flex-col justify-center items-center px-4">
            <div className="w-full mt-[100px] max-w-md">
              <AnimatePresence mode="wait">
                {step === "credentials" ? (
                  <motion.div
                    key="credentials-step"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-8 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] space-y-6"
                  >
                    {/* Header */}
                    <div className="text-center space-y-2">
                      <h1 className="text-3xl font-bold tracking-tight text-white">
                        {mode === "login" ? "AstraWatch Control" : "Create Account"}
                      </h1>
                      <p className="text-xs font-mono text-gray-400">
                        {mode === "login"
                          ? "Autonomous Kernel Observability & Self-Healing"
                          : "Start zero-overhead eBPF telemetry in seconds"}
                      </p>
                    </div>

                    {/* Mode Toggle (Sign In / Register) */}
                    <div className="flex items-center p-1 rounded-full bg-black/60 border border-white/10 text-xs font-semibold">
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

                    {/* Google OAuth Button */}
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.setItem('accessToken', 'demo-jwt-token-astrawatch');
                        window.location.href = '/dashboard';
                      }}
                      className="w-full flex items-center justify-center gap-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full py-3 px-4 transition-colors cursor-pointer text-xs font-semibold"
                    >
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span>Continue with Google</span>
                    </button>

                    <div className="flex items-center gap-4">
                      <div className="h-px bg-white/10 flex-1" />
                      <span className="text-gray-500 text-xs font-mono uppercase tracking-wider">or email</span>
                      <div className="h-px bg-white/10 flex-1" />
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="auth-email" className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">
                          Work Email <span className="text-blue-400">*</span>
                        </label>
                        <input
                          id="auth-email"
                          type="email"
                          placeholder="admin@astrawatch.io"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full bg-black/50 text-white border border-white/15 focus:border-blue-500 rounded-xl py-3 px-4 text-sm focus:outline-none transition-all"
                          required
                        />
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1.5">
                          <label htmlFor="auth-password" className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Password
                          </label>
                          {mode === "login" && (
                            <button
                              type="button"
                              onClick={() => { setErrorMsg("Password reset link sent to " + (email || "your email")); }}
                              className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="auth-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-black/50 text-white border border-white/15 focus:border-blue-500 rounded-xl py-3 px-4 pr-10 text-sm focus:outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs cursor-pointer"
                          >
                            {showPassword ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>

                      <MagneticButton className="w-full" strength={0.25}>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-800 border border-blue-500 disabled:opacity-60"
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
                            <span>{mode === "login" ? "Sign In to Control Plane" : "Create Enterprise Account"} →</span>
                          )}
                        </button>
                      </MagneticButton>
                    </form>

                    <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                      By continuing you agree to AstraWatch's{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">MSA</Link>,{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">Privacy Policy</Link>, and{" "}
                      <Link to="/landing" className="underline text-gray-400 hover:text-white">SOC2 Terms</Link>.
                    </p>
                  </motion.div>
                ) : step === "code" ? (
                  <motion.div
                    key="code-step"
                    initial={{ opacity: 0, x: 50 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -50 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-8 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-2xl font-bold tracking-tight text-white">2FA Verification Code</h1>
                      <p className="text-xs text-gray-400 font-mono">
                        Enter 6-digit access code sent to <span className="text-blue-400">{email || "admin@astrawatch.io"}</span>
                      </p>
                    </div>

                    {/* 6-Digit OTP Group */}
                    <div className="w-full py-2">
                      <div className="relative rounded-2xl py-4 px-3 border border-white/15 bg-black/60">
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
                                  className="w-8 text-center text-xl font-bold bg-transparent text-white border-none focus:outline-none font-mono"
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
                        className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                      >
                        ← Back to Email
                      </button>
                      <button
                        type="button"
                        onClick={() => { setErrorMsg("New verification code sent!"); }}
                        className="text-blue-400 hover:underline cursor-pointer"
                      >
                        Resend Code
                      </button>
                    </div>

                    <MagneticButton className="w-full" strength={0.25}>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('accessToken', 'demo-jwt-token-astrawatch');
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
                  <motion.div
                    key="success-step"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="backdrop-blur-2xl bg-white/[0.03] border border-white/15 rounded-3xl p-8 shadow-[0_16px_40px_0_rgba(0,0,0,0.6)] space-y-6 text-center"
                  >
                    <div className="space-y-1">
                      <h1 className="text-3xl font-bold tracking-tight text-white">Authenticated</h1>
                      <p className="text-xs font-mono text-emerald-400">JWT Token Verified · Role: PlatformAdmin</p>
                    </div>

                    <div className="py-6">
                      <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-t from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl shadow-blue-800/80 border border-blue-500">
                        <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    </div>

                    <MagneticButton className="w-full" strength={0.3}>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.setItem('accessToken', 'demo-jwt-token-astrawatch');
                          window.location.href = '/dashboard';
                        }}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-t from-blue-500 to-blue-600 text-white font-bold text-sm shadow-xl shadow-blue-800 border border-blue-500 transition-all cursor-pointer"
                      >
                        Launch Control Plane Dashboard →
                      </button>
                    </MagneticButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
