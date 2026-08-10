import { cn } from "@/lib/utils";

/**
 * THE TERRAIN LINE — ZamZam's signature element.
 *
 * Every route in this app is drawn as a ridge that rises and falls like the
 * country it crosses, not as the straight dashed rule every transit app
 * uses. It is the one recurring visual idea that makes a ZamZam screen
 * recognizable with the logo cropped out.
 *
 * It appears on exactly the four surfaces that carry route context:
 *   hero     → home search widget, draws itself in on load
 *   mini     → bus/trip result cards, flat, connects departure → arrival
 *   progress → live-tracking header, origin ● ─ current ─ ● destination
 *   (ticket perforation lives in globals.css as .ticket-divider, since a
 *    repeating background-image tiles cleanly at any card width)
 *
 * It deliberately does NOT appear on Profile, Settings, Notifications or
 * Wallet. Restraint is what keeps a signature a signature instead of
 * wallpaper — a motif on every surface is decoration, not identity.
 */

/* Ridge profile. Hand-tuned rather than generated: the peaks need to read
   as a skyline at 300px wide AND at 96px wide, which random walks don't do
   reliably. Normalized to a 0-100 x / 0-40 y box and scaled per variant. */
const RIDGE = "M0 30 L12 22 L22 27 L34 12 L44 20 L56 8 L68 18 L78 14 L88 24 L100 19";

export type TerrainVariant = "hero" | "mini" | "progress";

export interface TerrainLineProps {
  variant?: TerrainVariant;
  className?: string;
  /** Draw-in animation. Off for list rows — 20 cards each animating is noise. */
  animate?: boolean;
}

export function TerrainLine({ variant = "mini", className, animate = false }: TerrainLineProps) {
  if (variant === "hero") return <TerrainHero className={className} animate={animate} />;
  if (variant === "progress") return <TerrainProgress className={className} />;
  return <TerrainMini className={className} />;
}

/**
 * Hero — sits behind the home search widget on teal. Amber ridge with a
 * soft fill beneath it, drawing in on mount. This is the app's first
 * impression, so it's the only variant that animates by default.
 */
function TerrainHero({ className, animate }: { className?: string; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      /* Anchored to the bottom edge as a horizon. Kept short (h-14) and low
         opacity so it reads as ground the content sits on, not as a stray
         line crossing the card above it. */
      className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-14 w-full", className)}
    >
      <defs>
        <linearGradient id="terrain-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#EF9F27" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#EF9F27" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Fill sits under the stroke so the ridge edge stays crisp */}
      <path d={`${RIDGE} L100 40 L0 40 Z`} fill="url(#terrain-fill)" />
      <path
        d={RIDGE}
        fill="none"
        stroke="#EF9F27"
        strokeWidth="1"
        strokeOpacity="0.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className={cn(animate && "terrain-stroke animate-draw-terrain")}
      />
    </svg>
  );
}

/**
 * Mini — inside a result card, connecting departure time to arrival time.
 * Endpoint dots are filled so the eye reads it as "from → to" instantly;
 * the ridge between them is what makes it ZamZam's and not a generic
 * dotted line.
 */
function TerrainMini({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-4 w-full", className)}
    >
      <path
        d={RIDGE}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.55"
      />
      <circle cx="0" cy="30" r="2.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
      <circle cx="100" cy="19" r="2.5" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Progress — live-tracking header. The ridge runs origin → destination with
 * the vehicle's current position marked on it, so "how far along am I" is
 * legible at a glance instead of needing a percentage label.
 */
function TerrainProgress({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-8 w-full", className)}
    >
      <path
        d={RIDGE}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity="0.35"
      />
      <circle cx="0" cy="30" r="3" fill="currentColor" vectorEffect="non-scaling-stroke" />
      <circle cx="100" cy="19" r="3" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
