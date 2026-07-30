# DESIGN.md — Visual Design System for AstraWatch

## Visual World: "Luminous Obsidian & Electric Indigo Blue (#3131f5 / #206ce8)"

### Core Design Principles
1. **Luminous Dark Canvas**: Pure Pitch Black (`#000000`) background elevated with blurred indigo/blue radial spotlights (`#3131f5` blur-92px & `#206ce8` radial gradients).
2. **Card & Surface System**:
   - Dark Obsidian Cards: `bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 border-neutral-800`.
   - Featured Spotlight Cards: `border-blue-500/50 shadow-[0px_-13px_300px_0px_#0900ff]`.
3. **Typography & Motion System**:
   - Headers: `Plus Jakarta Sans` / `Helvetica` with `VerticalCutReveal` staggered text entrance.
   - Body & Description: `Inter` (`text-gray-300 font-light`).
   - Numbers & Metrics: `JetBrains Mono` with `@number-flow/react` spring transitions.
4. **Button & Pill Component Language**:
   - Primary Glowing CTA: `bg-gradient-to-t from-blue-500 to-blue-600 border border-blue-500 shadow-lg shadow-blue-800 text-white hover:from-blue-600 hover:to-blue-700`.
   - Capsule Switchers: `rounded-full bg-neutral-900 border border-gray-700 p-1` with animated `layoutId="switch"` spring indicator (`border-4 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600`).
