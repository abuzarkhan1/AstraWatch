# AstraWatch Frontend — Impeccable Audit Report
**Mode: Persuade (Landing) + Operate (Dashboard/Auth)**

---

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 1 / 4 | Missing ARIA, semantic HTML violations, no keyboard focus rings, form inputs unlabeled |
| 2 | Performance | 2 / 4 | WebGL Canvas on auth page, un-memoized setState loops in LiveDemoPreview, no `prefers-reduced-motion` guard |
| 3 | Responsive Design | 2 / 4 | Dashboard breaks on mobile (no responsive wrapper), LiveDemoPreview grid collapses poorly |
| 4 | Theming | 2 / 4 | **Critical consistency gap**: Landing sections use DESIGN.md tokens; Dashboard/AuthPage use an entirely different visual system |
| 5 | Implementation Integrity | 1 / 4 | Dashboard and internal pages are plainly off-brand — zero connection to the "Luminous Obsidian & Electric Indigo Blue" world |
| **Total** | | **8 / 20** | **Poor — Major Overhaul on Internal Pages** |

---

## Implementation Integrity Verdict

**FAIL on internal pages. PASS on landing components.**

The landing page (Hero, Features, Architecture, LiveDemo, Pricing, FAQ, Footer) cohesively expresses the "Luminous Obsidian & Electric Indigo Blue" design system. Evidence: consistent `bg-black`, `border-white/10`, `bg-blue-500/10` pill labels, `from-neutral-900 via-neutral-800` card gradients, `text-blue-400` accents, and `VerticalCutReveal` entrance animations.

**However**, the moment a user clicks "Launch Dashboard" or visits any internal page, they land in a completely different visual world:

- `Dashboard.tsx` uses `bg-gray-900`, `border-gray-800` — generic gray, zero blue glow, no glassmorphism
- `AuthPage` (`sign-in-flow-1.tsx`) is acceptable but uses white dots instead of the brand's `#3131f5` blue — it feels like a different product
- No internal page (Dashboard, Incidents, Topology, SLO, etc.) inherits the landing page's design language whatsoever

This is a **conversion and trust killer**: users who are persuaded by the stunning landing will feel betrayed by the flat, generic dashboard interior.

---

## Executive Summary

- **Audit Score: 8/20 — Poor**
- **Issues: P0×2 · P1×6 · P2×5 · P3×3**
- **Top Critical Issues:**
  1. Dashboard is completely off-brand (gray-900 vs pitch black, zero blue accents)
  2. Auth page background uses white dots — wrong color, should be `#3131f5` blue
  3. No `prefers-reduced-motion` guard on any animation (WCAG 2.3.3 violation)
  4. Email input on auth page has no `<label>` — WCAG 1.3.1 failure
  5. Section heading hierarchy jumps h2→h4 in cards without h3 — fails WCAG 1.3.1

---

## Detailed Findings by Severity

### P0 — Blocking

---

**[P0] Dashboard is completely off-brand and visually broken**
- **Location:** `src/features/dashboard/Dashboard.tsx` — entire file
- **Category:** Theming / Implementation Integrity
- **Impact:** Users who convert through the stunning landing page arrive at a generic gray admin UI. `bg-gray-900`, `border-gray-800`, plain `text-gray-300` — zero connection to the pitch-black + electric-blue brand. Instantly destroys trust and perceived quality.
- **Recommendation:** Redesign with: `bg-black` root, `border-white/10` card borders, `from-neutral-900 via-neutral-800` card gradients, `#3131f5` accent color, blue metric glows, glassmorphism stat cards, and `JetBrains Mono` for metric numbers. Match the card language from `FeaturesSection.tsx` and `PricingSection.tsx`.
- **Suggested command:** `$impeccable bolder dashboard`

---

**[P0] Auth page uses white dot animation — wrong brand color**
- **Location:** `src/components/ui/sign-in-flow-1.tsx` L534-L557, CanvasRevealEffect colors prop
- **Category:** Theming
- **Impact:** The `CanvasRevealEffect` renders white dots `[255,255,255]` on a black background. The brand color is `#3131f5` (Electric Indigo Blue). The auth page feels like a different, generic product rather than AstraWatch. The "G" text in the Google sign-in button is a plain letter with no Google icon — looks broken.
- **Recommendation:** Change CanvasRevealEffect `colors` to `[[49, 49, 245]]` (the `#3131f5` RGB equivalent) for both forward and reverse canvases. Replace the `<span>G</span>` Google button with the actual Google SVG logo. Update the CTA button gradient to use the brand blue (`from-blue-500 to-blue-600`) instead of `from-gray-100 to-gray-300`.
- **Suggested command:** `$impeccable colorize auth`

---

### P1 — Major

---

**[P1] No `prefers-reduced-motion` guard — WCAG 2.3.3 violation**
- **Location:** All landing sections — `FeaturesSection.tsx`, `ArchitectureSection.tsx`, `LiveDemoPreview.tsx`, `TestimonialsSection.tsx`, `FAQSection.tsx`, and `sign-in-flow-1.tsx`
- **Category:** Accessibility
- **Impact:** WCAG 2.3.3 (AAA) and broadly WCAG 2.3.1 (AA for seizures). Users with vestibular disorders will experience all Framer Motion animations, auto-cycling steppers, and the WebGL shader canvas regardless of their OS-level preference. The `setInterval` auto-cycle in `ArchitectureSection` runs unconditionally.
- **Standard:** WCAG 2.3.3, WCAG 2.3.1
- **Recommendation:** Wrap all `motion.*` variants and the `setInterval` in `ArchitectureSection` with a `useReducedMotion()` hook (Framer Motion provides this built-in). Apply `@media (prefers-reduced-motion: reduce)` in CSS to disable the WebGL Canvas and background glow animations.
- **Suggested command:** `$impeccable harden landing`

---

**[P1] Email input has no `<label>` — WCAG 1.3.1 failure**
- **Location:** `src/components/ui/sign-in-flow-1.tsx` L603-L626
- **Category:** Accessibility
- **Impact:** The email input (`type="email"`) has a `placeholder` but no associated `<label>` element. Screen readers cannot announce what this field is. Fails WCAG 1.3.1 (Info and Relationships) and 3.3.2 (Labels or Instructions).
- **Standard:** WCAG 1.3.1, WCAG 3.3.2
- **Recommendation:** Add `<label htmlFor="email-input" className="sr-only">Email address</label>` and `id="email-input"` on the input.
- **Suggested command:** `$impeccable harden auth`

---

**[P1] OTP digit inputs have no accessible label**
- **Location:** `src/components/ui/sign-in-flow-1.tsx` L653-L666
- **Category:** Accessibility
- **Impact:** Six digit inputs for the 6-digit OTP have no labels. Screen readers announce them as blank inputs. A user with a screen reader cannot know these are for a verification code.
- **Standard:** WCAG 1.3.1
- **Recommendation:** Add `aria-label={`Digit ${i + 1} of 6`}` to each input. Add `role="group"` and `aria-label="Verification code"` on the wrapping div.
- **Suggested command:** `$impeccable harden auth`

---

**[P1] Section heading hierarchy violations throughout landing**
- **Location:** `TestimonialsSection.tsx` L123, `ArchitectureSection.tsx` L276, `LiveDemoPreview.tsx` multiple card headings
- **Category:** Accessibility
- **Impact:** Inside grid cards, heading levels jump from `h2` (section title) directly to `h4` (card titles), skipping `h3`. This breaks WCAG 1.3.1 document structure and confuses screen reader navigation.
- **Standard:** WCAG 1.3.1
- **Recommendation:** Change all card-level `h4` headings inside sections to `h3`. Reserve `h4` only for sub-headings within cards.
- **Suggested command:** `$impeccable harden landing`

---

**[P1] Interactive pipeline step buttons missing `aria-pressed` / `aria-selected`**
- **Location:** `src/features/landing/components/ArchitectureSection.tsx` L258-L295
- **Category:** Accessibility
- **Impact:** The 6 pipeline step `<button>` elements act as a tab/selection group but have no ARIA state. A keyboard user activating Step 3 gets no feedback that it's now selected. Screen readers cannot convey which step is active.
- **Standard:** WCAG 4.1.2
- **Recommendation:** Add `aria-pressed={isSelected}` to each button, or convert to a `role="tablist"` / `role="tab"` pattern with `aria-selected`.
- **Suggested command:** `$impeccable harden architecture`

---

**[P1] Internal pages (Incidents, Topology, SLO, etc.) are completely unstyled / generic**
- **Location:** `src/features/incidents/IncidentsPage.tsx`, `src/features/topology/TopologyPage.tsx`, `src/features/slo/SLOPage.tsx`, and all other internal pages
- **Category:** Implementation Integrity / Theming
- **Impact:** These pages are placeholder-level stubs with no connection to the brand. A user navigating the product after sign-in sees a completely different, generic UI. This is the single largest credibility gap in the project.
- **Recommendation:** Apply the AstraWatch design system consistently: `bg-black` layout, `from-neutral-900 via-neutral-800` cards, `border-white/10` borders, `text-blue-400` accents, `JetBrains Mono` for data, blue status pills.
- **Suggested command:** `$impeccable bolder` (on all internal pages)

---

### P2 — Minor

---

**[P2] WebGL Canvas on auth page runs on every render — performance risk**
- **Location:** `src/components/ui/sign-in-flow-1.tsx` — `CanvasRevealEffect` / `ShaderMaterial` / `useFrame`
- **Category:** Performance
- **Impact:** A Three.js WebGL Canvas with a custom GLSL fragment shader runs continuously at 60fps on the auth page background. On mobile or low-power devices, this can drain battery and cause thermal throttling. There is no fallback for devices that fail WebGL context creation.
- **Recommendation:** Add a static CSS radial gradient fallback behind the Canvas. Detect WebGL support and skip Canvas on failure. Cap `maxFps` to 30 on mobile via a `useMediaQuery` check.
- **Suggested command:** `$impeccable optimize auth`

---

**[P2] `setTimeout` chains in `LiveDemoPreview.tsx` without cleanup**
- **Location:** `src/features/landing/components/LiveDemoPreview.tsx` L57-L78, `handleSimulateSpike`
- **Category:** Performance
- **Impact:** `handleSimulateSpike` fires multiple `setTimeout` calls with no cleanup refs. If the user navigates away mid-simulation, all scheduled state updates fire against unmounted components, triggering React warnings and potential memory leaks.
- **Recommendation:** Track all `setTimeout` IDs in a `useRef<number[]>` array and clear them in a `useEffect` cleanup function.
- **Suggested command:** `$impeccable optimize livedemo`

---

**[P2] Unsplash avatar images have no `loading="lazy"` and no explicit width/height**
- **Location:** `src/features/landing/components/TestimonialsSection.tsx` L117-L121
- **Category:** Performance
- **Impact:** 5 external Unsplash images load eagerly with no dimensions specified. This causes layout shift (CLS) and wastes bandwidth on initial load since testimonials are below the fold.
- **Recommendation:** Add `loading="lazy"`, `width="44"`, `height="44"` to each `<img>`. Consider replacing with locally generated avatar illustrations to eliminate the external network dependency.
- **Suggested command:** `$impeccable optimize testimonials`

---

**[P2] No keyboard focus ring on any interactive element**
- **Location:** All landing components — `ArchitectureSection.tsx` buttons, `LiveDemoPreview.tsx` buttons, `FAQSection.tsx` accordion triggers
- **Category:** Accessibility
- **Impact:** No `focus-visible:ring` styles exist on any button or interactive element. Keyboard-only users have no visual indicator of their current focus position. Fails WCAG 2.4.7 (Focus Visible).
- **Standard:** WCAG 2.4.7
- **Recommendation:** Add `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-black` to all interactive elements globally via `index.css`.
- **Suggested command:** `$impeccable harden landing`

---

**[P2] `FeaturesSection` badge pill says "Futuristic Glassmorphism Architecture" — misleading copy**
- **Location:** `src/features/landing/components/FeaturesSection.tsx` L49
- **Category:** Implementation Integrity
- **Impact:** The label pill describes the UI style ("Futuristic Glassmorphism") rather than the product feature. This is self-referential meta-copy that doesn't communicate value to an SRE evaluating the platform. Compare to the superior "Sub-Millisecond Pipeline" pill in ArchitectureSection.
- **Recommendation:** Change to a product-truth pill: `"eBPF + ML + Autonomous Healing"` or `"Zero-Agent Kernel Observability"`.
- **Suggested command:** `$impeccable clarify features`

---

### P3 — Polish

---

**[P3] `ArchitectureSection` auto-cycle interval doesn't reset on step selection**
- **Location:** `src/features/landing/components/ArchitectureSection.tsx` L191-L201`
- **Category:** Performance
- **Impact:** When a user manually clicks a pipeline step (which sets `isPlaying = false`), resuming auto-play does not restart the timer from the current step — it continues from wherever the internal counter was. Minor UX friction for engaged users.
- **Recommendation:** Reset `activeStep` to 0 (or the current step) when auto-play is resumed.
- **Suggested command:** `$impeccable polish architecture`

---

**[P3] Testimonials section has no viewport-triggered animation**
- **Location:** `src/features/landing/components/TestimonialsSection.tsx`
- **Category:** Implementation Integrity
- **Impact:** Cards use `whileHover={{ y: -3 }}` but no scroll-triggered entrance animation. Every other section (Features, Architecture) has staggered entrance animations. Testimonials feel static by comparison.
- **Recommendation:** Add `initial={{ opacity: 0, y: 20 }}` / `whileInView={{ opacity: 1, y: 0 }}` / `viewport={{ once: true }}` to each testimonial card with staggered `transition={{ delay: idx * 0.1 }}`.
- **Suggested command:** `$impeccable animate testimonials`

---

**[P3] `sign-in-flow-1.tsx` MiniNavbar logo is 4 white dots — not the AstraWatch brand mark**
- **Location:** `src/components/ui/sign-in-flow-1.tsx` L379-L386
- **Category:** Implementation Integrity
- **Impact:** The auth page navbar shows 4 white circles as a "logo". This is a generic placeholder with no relation to AstraWatch's brand identity. Minor but chips away at first impressions.
- **Recommendation:** Replace with the AstraWatch wordmark or a proper SVG logo mark using the brand blue `#3131f5`.
- **Suggested command:** `$impeccable polish auth`

---

## Patterns & Systemic Issues

1. **Two-world problem**: The landing page and all internal pages are built with entirely different design vocabularies. This is the root cause of the user's observation that "other pages don't feel as good."
2. **Accessibility was not considered during implementation**: No ARIA states, no focus rings, no `prefers-reduced-motion`, unlabeled inputs — these are systemic gaps, not one-off mistakes.
3. **No design token abstraction**: Colors are hardcoded as Tailwind utilities throughout (`text-blue-400`, `border-blue-500/30`). There is no central token file. Changing the accent color requires finding and replacing across 15+ files.

---

## Positive Findings

- ✅ **Landing sections are visually world-class**: Hero, Pricing, Footer — genuinely impressive enterprise dark theme
- ✅ **`content-visibility: auto`** on all landing sections in `LandingPage.tsx` — excellent performance optimization
- ✅ **`VerticalCutReveal` entrance animations** used consistently in landing hero/features sections — premium feel
- ✅ **Interactive components have real substance**: ArchitectureSection's 6-phase stepper with live code payload and simulated terminal output is exceptional
- ✅ **`useCallback` / `useMemo`** used appropriately in ArchitectureSection and LiveDemoPreview — good re-render discipline
- ✅ **`overflow-x-hidden`** at every level in LandingPage — no horizontal scroll bleed
- ✅ **`@number-flow/react`** spring number animations in FeaturesSection — premium micro-interaction

---

## Recommended Actions (Priority Order)

1. **[P0] `$impeccable bolder dashboard`** — Redesign Dashboard.tsx with the full Luminous Obsidian design system: pitch-black bg, gradient cards, blue stat glows, JetBrains Mono metrics, glassmorphism borders
2. **[P0] `$impeccable colorize auth`** — Change CanvasRevealEffect to `#3131f5` blue, fix Google button icon, update CTA to brand blue gradient
3. **[P1] `$impeccable bolder` internal pages** — Apply brand theme to Incidents, Topology, SLO, Healing, Runbooks, Postmortems, Catalog pages
4. **[P1] `$impeccable harden landing`** — Add `prefers-reduced-motion` guards, fix h2→h3→h4 heading hierarchy, add `aria-pressed` to stepper, add global `focus-visible:ring` in index.css
5. **[P1] `$impeccable harden auth`** — Add `<label>` to email input, add `aria-label` to OTP digits, add `role="group"` to OTP container
6. **[P2] `$impeccable optimize`** — Add `loading="lazy"` to testimonial images, clean up `setTimeout` refs in LiveDemoPreview, add WebGL fallback in auth
7. **[P2] `$impeccable clarify features`** — Fix "Futuristic Glassmorphism Architecture" pill to product-truth copy
8. **[P3] `$impeccable animate testimonials`** — Add scroll-triggered staggered entrance to testimonial cards
9. **[P3] `$impeccable polish auth`** — Replace 4-dot placeholder logo with AstraWatch brand mark
10. **`$impeccable polish`** — Final pass across all pages after above fixes

---

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> The single highest-impact action is **#1 — the Dashboard redesign**. It will make the biggest visible difference immediately.
>
> Re-run `$impeccable audit` after fixes to see your score improve.
