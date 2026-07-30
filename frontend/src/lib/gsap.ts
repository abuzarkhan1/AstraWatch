/**
 * GSAP Plugin Registry
 * Register all GSAP plugins once, globally.
 * Import this file once at the app root before any GSAP usage.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { TextPlugin } from 'gsap/TextPlugin';

gsap.registerPlugin(ScrollTrigger, TextPlugin);

export { gsap, ScrollTrigger, TextPlugin };
