import { useEffect } from "react";
import { motion, useReducedMotion, useMotionValue, useTransform, animate } from "framer-motion";
import glyph from "@/assets/brand/logo-glyph.png";

/**
 * Cold-start launch animation — "The Ascent".
 *
 * The signature is THE TERRAIN LINE — the app's one ownable visual idea (a
 * route drawn as a rising/falling mountain ridge, evoking Nepal's Himalayas).
 * On launch a comet of light climbs that route, drawing the ridge behind it as
 * it goes, while the brand lockup resolves above and a distant range gives the
 * scene depth. It's the app's own "a journey, drawn as a mountain trail" idea
 * played out in motion. The scene then does a slow cinematic push-in to hand
 * off to the home screen — where the same ridge waits on the hero, so the
 * launch reads as one continuous move into the app.
 *
 * Amber (THE accent) is the warm light on a cool teal ground; it's spent on the
 * Z mark and the traveling comet, so the eye always has one hot focal point.
 */

// Shared with components/ui/terrain-line.tsx — normalized 0-100 x / 0-40 y.
const RIDGE = "M0 30 L12 22 L22 27 L34 12 L44 20 L56 8 L68 18 L78 14 L88 24 L100 19";
// A flatter, lower silhouette sitting behind the main ridge, for depth.
const RANGE = "M0 40 L0 33 L16 28 L30 32 L46 23 L60 30 L74 22 L86 28 L100 26 L100 40 Z";

// Structural easing from the design system (transitionTimingFunction.standard).
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
// Micro easing — a confident settle with the faintest overshoot.
const SPRING: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

// Ridge vertices, so the comet can ride the exact line the stroke draws.
const RIDGE_PTS: Array<[number, number]> = [
  [0, 30], [12, 22], [22, 27], [34, 12], [44, 20],
  [56, 8], [68, 18], [78, 14], [88, 24], [100, 19],
];
// Precompute per-segment arc lengths once, so sampling is a cheap lookup.
const SEG_LEN: number[] = [];
let RIDGE_TOTAL = 0;
for (let i = 1; i < RIDGE_PTS.length; i++) {
  const dx = RIDGE_PTS[i][0] - RIDGE_PTS[i - 1][0];
  const dy = RIDGE_PTS[i][1] - RIDGE_PTS[i - 1][1];
  const len = Math.hypot(dx, dy);
  SEG_LEN.push(len);
  RIDGE_TOTAL += len;
}
// Point on the ridge at arc-length fraction t ∈ [0,1], in the 0-100 / 0-40 box.
// This matches SVG pathLength (also arc-length normalized), so the comet stays
// glued to the leading edge of the stroke as it draws.
function sampleRidge(t: number): [number, number] {
  if (t <= 0) return RIDGE_PTS[0];
  if (t >= 1) return RIDGE_PTS[RIDGE_PTS.length - 1];
  let d = t * RIDGE_TOTAL;
  let i = 0;
  while (i < SEG_LEN.length && d > SEG_LEN[i]) {
    d -= SEG_LEN[i];
    i++;
  }
  const p0 = RIDGE_PTS[i];
  const p1 = RIDGE_PTS[i + 1];
  const f = SEG_LEN[i] ? d / SEG_LEN[i] : 0;
  return [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f];
}

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  // Seconds the splash owns the screen before handing off to home.
  const TOTAL = reduce ? 1.4 : 3.5;

  // Draw window for the ridge / comet.
  const RIDGE_DELAY = 0.9;
  const RIDGE_DUR = 1.5;

  // Comet position, derived from a single progress value that tracks the draw.
  const progress = useMotionValue(reduce ? 1 : 0);
  const cometLeft = useTransform(progress, (t) => `${sampleRidge(t)[0]}%`);
  const cometTop = useTransform(progress, (t) => `${(sampleRidge(t)[1] / 40) * 100}%`);

  useEffect(() => {
    const done = window.setTimeout(onDone, TOTAL * 1000);
    if (reduce) return () => window.clearTimeout(done);
    const controls = animate(progress, 1, {
      delay: RIDGE_DELAY,
      duration: RIDGE_DUR,
      ease: EASE,
    });
    return () => {
      window.clearTimeout(done);
      controls.stop();
    };
  }, [onDone, TOTAL, reduce, progress]);

  return (
    <motion.div
      aria-hidden
      data-splash=""
      className="fixed inset-0 z-[100] overflow-hidden"
      // Brand-dark ground — matches the design board's deep-teal surface, so
      // the very first frame is already on-brand (see #boot in index.html).
      style={{
        background:
          "radial-gradient(120% 92% at 50% 8%, #0A4A3D 0%, #04342C 46%, #021B16 100%)",
      }}
      initial={{ opacity: 1, scale: 1 }}
      // Final beat: hold, then a slow cinematic push-in + fade to reveal home.
      animate={reduce ? { opacity: [1, 1, 0] } : { opacity: [1, 1, 0], scale: [1, 1, 1.06] }}
      transition={{ duration: TOTAL, times: reduce ? [0, 0.6, 1] : [0, 0.8, 1], ease: EASE }}
    >
      {/* Distant range — a low silhouette drifting up, for depth. */}
      <motion.div
        className="absolute inset-x-0 bottom-0 h-72"
        initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.25, duration: 1.3, ease: EASE }}
      >
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full" aria-hidden>
          <path d={RANGE} fill="#E1F5EE" fillOpacity="0.05" />
        </svg>
      </motion.div>

      {/* Signature: the terrain ridge, drawn by a climbing comet of light. */}
      <div className="absolute inset-x-0 bottom-0 h-64">
        <svg
          viewBox="0 0 100 40"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <defs>
            <linearGradient id="splash-terrain-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF9F27" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#EF9F27" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Amber wash under the ridge, revealed once the line is drawn. */}
          <motion.path
            d={`${RIDGE} L100 40 L0 40 Z`}
            fill="url(#splash-terrain-fill)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : RIDGE_DELAY + RIDGE_DUR - 0.3, duration: 0.7, ease: EASE }}
          />
          {/* Soft glow trail — a wide, blurred amber stroke drawn in sync. */}
          <motion.path
            d={RIDGE}
            fill="none"
            stroke="#EF9F27"
            strokeWidth="3.5"
            strokeOpacity="0.28"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "blur(2.5px)" }}
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: reduce ? 0 : RIDGE_DELAY, duration: reduce ? 0 : RIDGE_DUR, ease: EASE }}
          />
          {/* The crisp ridge line itself. */}
          <motion.path
            d={RIDGE}
            fill="none"
            stroke="#EF9F27"
            strokeWidth="1.4"
            strokeOpacity="0.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: reduce ? 0 : RIDGE_DELAY, duration: reduce ? 0 : RIDGE_DUR, ease: EASE }}
          />
        </svg>
        {/* The comet — a warm point of light climbing the route. Rides the
            exact leading edge of the stroke via the shared progress value.
            Centering lives in Framer's x/y (not a Tailwind translate) so it
            survives the scale keyframes, which own the transform. */}
        {!reduce && (
          <motion.span
            className="absolute size-3.5 rounded-full"
            style={{
              left: cometLeft,
              top: cometTop,
              x: "-50%",
              y: "-50%",
              background:
                "radial-gradient(circle, #FFF4DE 0%, #EF9F27 42%, rgba(239,159,39,0) 72%)",
              boxShadow: "0 0 22px 7px rgba(239,159,39,0.7)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 0.6] }}
            transition={{
              delay: RIDGE_DELAY - 0.05,
              duration: RIDGE_DUR + 0.25,
              times: [0, 0.12, 0.88, 1],
              ease: EASE,
            }}
          />
        )}
      </div>

      {/* Brand lockup, held just above center so the horizon has room. */}
      <div className="absolute inset-0 flex -translate-y-[6%] flex-col items-center justify-center px-8">
        <div className="relative flex flex-col items-center">
          {/* Mark + its halo, in a box sized to the tile so the glow centers. */}
          <span className="relative flex items-center justify-center">
            {/* Soft radial halo behind the mark — a slow, premium glow.
                Centered with left/top + Framer x/y so the scale keyframes,
                which own the transform, don't knock it off-center. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute size-40 rounded-full"
              style={{
                left: "50%",
                top: "50%",
                x: "-50%",
                y: "-50%",
                background:
                  "radial-gradient(circle, rgba(239,159,39,0.32) 0%, rgba(239,159,39,0) 68%)",
              }}
              initial={reduce ? { opacity: 0.5, scale: 1 } : { opacity: 0, scale: 0.8 }}
              animate={{ opacity: reduce ? 0.5 : [0, 0.55, 0.42], scale: [0.8, 1.06, 1] }}
              transition={{ delay: reduce ? 0 : 0.4, duration: 2.2, ease: EASE }}
            />
            {/* Mark: the brand's dark-surface treatment — white tile, blue Z. */}
            <motion.span
              className="relative grid size-16 place-items-center overflow-hidden rounded-2xl bg-white"
              style={{ boxShadow: "0 12px 44px rgba(0,0,0,0.42)" }}
              initial={reduce ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.82, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.4, duration: 0.7, ease: SPRING }}
            >
              <img src={glyph} alt="" aria-hidden className="size-12 object-contain" />
            </motion.span>
          </span>

          {/* Wordmark — resolves with a gentle focus-in. */}
          <motion.span
            className="relative mt-5 font-display text-4xl font-extrabold tracking-tight text-paper"
            initial={reduce ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 12, filter: "blur(7px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: reduce ? 0 : 0.75, duration: 0.8, ease: EASE }}
          >
            zamzam
          </motion.span>

          {/* Tagline — quiet, cool, in the brand's own words. */}
          <motion.span
            className="relative mt-3 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-teal-100/60"
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 1.9, duration: 0.7, ease: EASE }}
          >
            Nepal&rsquo;s everything app
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
}
