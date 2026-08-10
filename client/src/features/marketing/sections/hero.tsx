import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SERVICES } from "@/config";
import { Icon } from "@/components/ui/icon";
import { useAuthStore } from "@/stores/auth.store";
import type { ServiceVertical } from "@/types";

export function Hero() {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  // Already signed in as a customer -> go straight to that service.
  // Anyone else (guest, or signed in as a driver/partner/admin) -> sign in
  // first, then land on the exact service they tapped instead of the
  // generic marketplace home.
  function handleServiceClick(service: ServiceVertical) {
    if (isAuthenticated && user?.role === "customer") {
      navigate(service.to);
    } else {
      navigate("/login", { state: { from: service.to } });
    }
  }

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-36">
      {/* Valley grid + ambient glow — the spatial / demand motif */}
      <div className="pointer-events-none absolute inset-0 valley-grid" aria-hidden />
      <div
        className="pointer-events-none absolute left-1/2 top-0 -z-0 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]"
        aria-hidden
      />

      <div className="container relative">
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-fg"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
            </span>
            Live in the Kathmandu Valley
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-balance sm:text-6xl"
          >
            Nepal's whole day,
            <br />
            <span className="text-accent">in one app.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mx-auto mt-5 max-w-xl text-lg text-muted-fg text-balance"
          >
            Hail a ride, book the bus to Pokhara, ship a load, reserve a hotel — pay for all of it
            from one wallet. Zamzam is a marketplace first: every service, one tap away.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button size="lg" variant="accent" onClick={() => navigate("/app")}>
              Explore the marketplace <ArrowRight className="size-4" />
            </Button>
            {/* Sign-UP, not sign-in: someone answering this has no account
                yet, and picking hotel / restaurant / bus operator / freight
                only happens on the register screen. */}
            <Button size="lg" variant="outline" onClick={() => navigate("/register")}>
              Partner with Zamzam
            </Button>
          </motion.div>
        </div>

        {/* Marketplace tile cluster — the hero IS the marketplace */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="relative mx-auto mt-16 max-w-4xl"
        >
          <div className="rounded-3xl border border-border bg-card/80 p-3 shadow-lift backdrop-blur-sm">
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-fg">
              <MapPin className="size-3.5 text-accent" />
              Where to? Pick a service.
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {SERVICES.slice(0, 10).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleServiceClick(s)}
                  className="group flex flex-col items-center gap-2 rounded-2xl border border-transparent bg-surface px-2 py-4 text-center transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg transition-colors group-hover:bg-accent/10 group-hover:text-accent-600 dark:group-hover:text-accent">
                    <Icon name={s.icon} className="size-5" />
                  </span>
                  <span className="text-xs font-medium">{s.name}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}