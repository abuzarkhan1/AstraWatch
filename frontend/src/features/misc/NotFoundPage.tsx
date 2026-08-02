import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />
      
      {/* Abstract 404 Vector Illustration */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 mb-8"
      >
        <svg
          width="400"
          height="300"
          viewBox="0 0 400 300"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="mx-auto drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]"
        >
          {/* Constellation / Nodes Background */}
          <motion.g
            animate={{ rotate: 360 }}
            transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: "200px 150px" }}
          >
            <circle cx="100" cy="80" r="2" fill="#60A5FA" opacity="0.6" />
            <circle cx="300" cy="100" r="3" fill="#60A5FA" opacity="0.4" />
            <circle cx="250" cy="220" r="2" fill="#60A5FA" opacity="0.8" />
            <circle cx="120" cy="240" r="3" fill="#60A5FA" opacity="0.5" />
            <path d="M100 80 L300 100 L250 220 Z" stroke="#3B82F6" strokeWidth="1" strokeDasharray="4 4" opacity="0.2" />
          </motion.g>

          {/* Main 404 Text Graphic */}
          <text
            x="50%"
            y="55%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="font-black"
            fill="url(#gradient-404)"
            style={{ fontSize: '140px', letterSpacing: '-0.05em' }}
          >
            404
          </text>
          
          {/* Orbital rings */}
          <motion.ellipse
            cx="200"
            cy="150"
            rx="160"
            ry="60"
            fill="none"
            stroke="url(#gradient-ring)"
            strokeWidth="2"
            initial={{ rotate: -15, scale: 0.9, opacity: 0 }}
            animate={{ rotate: -10, scale: 1, opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            style={{ transformOrigin: "200px 150px" }}
          />
          <motion.ellipse
            cx="200"
            cy="150"
            rx="120"
            ry="40"
            fill="none"
            stroke="url(#gradient-ring)"
            strokeWidth="1.5"
            strokeDasharray="8 8"
            initial={{ rotate: 30, scale: 0.9, opacity: 0 }}
            animate={{ rotate: 45, scale: 1, opacity: 0.8 }}
            transition={{ duration: 1, delay: 0.4 }}
            style={{ transformOrigin: "200px 150px" }}
          />

          <defs>
            <linearGradient id="gradient-404" x1="0" y1="0" x2="400" y2="300" gradientUnits="userSpaceOnUse">
              <stop stopColor="#93C5FD" />
              <stop offset="0.5" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#1E3A8A" />
            </linearGradient>
            <linearGradient id="gradient-ring" x1="40" y1="90" x2="360" y2="210" gradientUnits="userSpaceOnUse">
              <stop stopColor="#60A5FA" stopOpacity="0" />
              <stop offset="0.5" stopColor="#3B82F6" stopOpacity="0.8" />
              <stop offset="1" stopColor="#1E3A8A" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
        className="relative z-10 text-center max-w-lg px-6"
      >
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-4">
          Lost in the Data Stream
        </h1>
        <p className="text-gray-400 text-lg mb-8 leading-relaxed">
          The page you are looking for has been moved, deleted, or never existed in this dimension.
        </p>
        
        <Link 
          to="/landing"
          className="inline-flex items-center justify-center px-8 py-3.5 text-sm font-semibold text-white transition-all bg-gradient-to-t from-blue-600 to-blue-500 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] hover:scale-105 active:scale-95 border border-blue-400/50"
        >
          Return to Mission Control
        </Link>
      </motion.div>
      
      {/* Footer minimal branding */}
      <div className="absolute bottom-8 text-center text-xs text-neutral-600 font-mono tracking-widest uppercase">
        System Error 404 • AstraWatch
      </div>
    </div>
  );
}
