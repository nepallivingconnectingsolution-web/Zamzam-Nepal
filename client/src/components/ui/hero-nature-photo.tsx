import heroPhoto from "@/assets/hero/pashupatinath-valley.jpg";
import { cn } from "@/lib/utils";

/**
 * Home hero backdrop — a real photograph of Pashupatinath's gold pagoda roof
 * rising over the Kathmandu valley, replacing the earlier flat SVG skyline.
 * One HD source photo rather than a stitched composite: it already carries
 * the temple, the terraced valley hills behind it, a mountain silhouette on
 * the skyline and the city in one authentic frame, so nothing here fights
 * the ridge-line stroke drawn on top of it.
 *
 * A teal multiply wash pulls the photo's neutral daylight into the app's own
 * palette instead of leaving it looking like a stock photo pasted onto a
 * teal UI, and a bottom-anchored gradient keeps the headline readable
 * without needing a solid color plate under it.
 *
 * Credit: "Pashupatinath Temple-2020.jpg" by Bijay Chaurasia, Wikimedia
 * Commons, CC BY-SA 4.0 — resized and compressed for web; the color grade is
 * applied on display, the stored file is untouched.
 */
export function HeroNaturePhoto({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <img
        src={heroPhoto}
        alt=""
        aria-hidden="true"
        loading="eager"
        fetchPriority="high"
        className="h-full w-full object-cover object-[50%_38%]"
      />
      {/* Brand color grade — multiply keeps photo detail, shifts its native
          daylight tones into ZamZam teal. */}
      <div className="absolute inset-0 bg-teal-900/35 mix-blend-multiply" aria-hidden="true" />
      {/* Legibility gradient for the headline anchored at the bottom. Never
          fades to fully transparent — the hero is short enough now that the
          eyebrow pill sits near the top edge too, which can land on a pale
          sky in the source photo without a floor here. */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-teal-900/90 via-teal-900/55 to-teal-900/25"
        aria-hidden="true"
      />
      <a
        href="https://commons.wikimedia.org/wiki/File:Pashupatinath_Temple-2020.jpg"
        target="_blank"
        rel="noreferrer noopener"
        className="absolute bottom-1 right-2 text-[9px] leading-none text-white/40 transition-colors hover:text-white/70"
      >
        Photo: Bijay Chaurasia / CC BY-SA 4.0
      </a>
    </div>
  );
}
