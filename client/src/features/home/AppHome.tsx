import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, MapPin, Navigation, ShieldCheck, Wallet } from "lucide-react";
import { AppFrame } from "@/components/layout/app-frame";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { TerrainLine } from "@/components/ui/terrain-line";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SERVICES } from "@/config";
import { useAuthStore } from "@/stores/auth.store";
import type { ServiceVertical } from "@/types";

/**
 * The signed-out front door.
 *
 * This replaced the marketing hero, which opened with an eyebrow, a headline
 * and a paragraph of pitch copy and only reached the service picker below the
 * fold. That is the shape of a landing page: it sells before it lets you do
 * anything. An app's first screen is a control surface — the nine things you
 * can do are the first thing you see, and the pitch is a link.
 *
 * It renders inside AppFrame like every in-app screen (see CustomerShell), so
 * a desktop browser gets the app centred at phone width rather than a hero
 * stretched across 1400px. The header here is deliberately NOT PublicNavbar:
 * that one is `fixed inset-x-0`, so it escapes the frame and spans the whole
 * viewport — a full-bleed nav bar above a phone-width app is the single
 * loudest "this is a website" signal a screen can send.
 *
 * The marketing page still exists in full at /about for links that need it.
 */
export function AppHome() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  // Carried over verbatim from the old hero: tapping a service while signed
  // out routes through /login carrying where you meant to go, so choosing a
  // service is what prompts the account and the tap survives sign-in.
  function handleServiceClick(service: ServiceVertical) {
    if (isAuthenticated && user?.role === "customer") {
      navigate(service.to);
    } else {
      navigate("/login", { state: { from: service.to } });
    }
  }

  const liveCount = SERVICES.filter((s) => s.live).length;

  return (
    <AppFrame fill>
      <header className="sticky top-0 z-30 flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 border-b border-border bg-bg/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <Link to="/" aria-label="Zamzam home">
          <Logo />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
            Sign in
          </Button>
        </div>
      </header>

      <main className="flex-1 pb-[calc(2.5rem+env(safe-area-inset-bottom))] lg:overflow-y-auto">
        {/* The teal band — same surface treatment and pb-8 as MarketplaceHome's
            hero, which the Services card below simply follows rather than
            overlapping. An earlier version pulled the card up into this band
            to read as "a sheet resting on the hero," but in practice it read
            as a layout bug instead — the ridge line poking out in the narrow
            gutters on either side of the card looked like a rendering glitch,
            not a deliberate effect. Plain stacking, matching the rest of the
            app, is what actually looks intentional. */}
        <div className="relative overflow-hidden bg-teal-700 px-4 pb-8 pt-6 text-white">
          <TerrainLine variant="hero" animate />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-sm bg-white/10 px-2.5 py-1 text-caption font-semibold uppercase tracking-wider text-white/80">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
              </span>
              Kathmandu Valley
            </span>

            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-4 font-display text-display font-extrabold text-balance"
            >
              Where to?
            </motion.h1>
            <p className="mt-1 text-body text-white/70">Pick a service to get started.</p>
          </div>
        </div>

        {/* The marketplace itself, directly below the band — this sits exactly
            where the deleted headline used to. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="relative z-10 mt-5 px-4"
        >
          <div className="rounded-xl border border-border bg-card p-3 shadow-e2">
            <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
              <h2 className="font-display text-h2 font-bold">Services</h2>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-teal-100 px-2 py-1 text-caption font-semibold text-teal-700 dark:bg-white/10 dark:text-white/80">
                <MapPin className="size-3" /> {liveCount} live
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {SERVICES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleServiceClick(s)}
                  className="group flex flex-col items-center gap-2 rounded-xl px-1 py-3 text-center transition-transform duration-fast ease-standard active:scale-[0.96] hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 dark:focus-visible:ring-accent"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg transition-colors group-hover:bg-teal-100 group-hover:text-teal-700 dark:group-hover:bg-white/10 dark:group-hover:text-accent">
                    <Icon name={s.icon} className="size-5" />
                  </span>
                  <span className="text-body-sm font-medium leading-tight">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Full-width and stacked. Centred pills side by side are a landing-page
            shape; app actions run the width of the screen. Amber is spent here,
            once — the partner button is deliberately the outline variant. */}
        <div className="mt-5 space-y-2.5 px-4">
          <Button variant="accent" size="lg" className="w-full" onClick={() => navigate("/app")}>
            Explore the marketplace <ArrowRight className="size-4" />
          </Button>
          {/* Sign-UP, not sign-in: whoever taps this has no account yet.
              `intent` opens the partner door straight away, so they get the
              business-type picker rather than the customer form. */}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => navigate("/register", { state: { intent: "partner" } })}
          >
            Partner with Zamzam
          </Button>
        </div>

        {/* Three facts about how the product works, as a settings-style list.
            Not a features section: no headline, no illustrations, no scroll
            reveal. It answers "what is this" for a first-time visitor in the
            space an app would use for an info list. */}
        <div className="mt-8 px-4">
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {[
              {
                icon: Wallet,
                title: "One wallet",
                body: "Rides, tickets, stays and orders all settle from a single balance.",
              },
              {
                icon: ShieldCheck,
                title: "Verified partners",
                body: "Every driver, operator and business is reviewed before it goes live.",
              },
              {
                icon: Navigation,
                title: "Live tracking",
                body: "Follow your ride, parcel or bus while it's on the way.",
              },
            ].map(({ icon: RowIcon, title, body }) => (
              <div key={title} className="flex items-start gap-3 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-fg">
                  <RowIcon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-body font-semibold">{title}</p>
                  <p className="mt-0.5 text-body-sm text-muted-fg">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The whole marketing site, reduced to the one link that belongs on an
            app screen. Everything it used to inline — AI, partners, investors,
            contact — still lives at /about. */}
        <div className="mt-6 text-center">
          <Link
            to="/about"
            className="text-body-sm font-medium text-muted-fg underline-offset-4 hover:text-fg hover:underline"
          >
            About Zamzam
          </Link>
        </div>
      </main>
    </AppFrame>
  );
}
