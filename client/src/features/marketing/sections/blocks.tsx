import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  Building2,
  Car,
  Gauge,
  Map,
  ShieldCheck,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import { Section } from "@/components/shared/section";
import { ServiceGrid } from "@/components/shared/service-grid";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

/* ----------------------------- Services ----------------------------------- */
export function ServicesSection() {
  return (
    <Section
      id="services"
      eyebrow="The marketplace"
      title="One identity. One wallet. Every service."
      intro="Mobility, logistics, tourism and commerce live under a single roof — so demand flows naturally from one journey to the next."
    >
      <ServiceGrid />
    </Section>
  );
}

/* ------------------------------- AI brain --------------------------------- */
const AI_CAPABILITIES = [
  {
    icon: BrainCircuit,
    title: "Smart matching",
    body: "Predicted arrival curves and driver-compliance scores pick the right vehicle, not just the nearest dot on a map.",
  },
  {
    icon: Gauge,
    title: "Dynamic pricing",
    body: "Fares tune to live demand, vehicle density, traffic and weather — with a hard surge ceiling built in.",
  },
  {
    icon: ShieldCheck,
    title: "Risk & fraud guard",
    body: "Passive telemetry flags spoofed locations, impossible speeds and multi-account abuse, then locks the trip down.",
  },
  {
    icon: Sparkles,
    title: "Cross-sell engine",
    body: "Booked a bus to Pokhara? The assistant surfaces a hotel bundle and a terminal taxi before you arrive.",
  },
];

export function AiSection() {
  return (
    <Section
      id="ai"
      className="bg-surface"
      eyebrow="The Zamzam brain"
      title="AI that runs underneath every tap"
      intro="A shared intelligence layer sits beneath the whole ecosystem — allocating, pricing, protecting and connecting across modules."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AI_CAPABILITIES.map((c, i) => (
          <motion.div
            key={c.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="h-full p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent-600 dark:text-accent">
                <c.icon className="size-5" />
              </span>
              <h3 className="mt-4 font-display font-semibold tracking-tight">{c.title}</h3>
              <p className="mt-1.5 text-sm text-muted-fg">{c.body}</p>
            </Card>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------ Partners ---------------------------------- */
const PARTNERS = [
  { icon: Car, title: "Drivers", body: "Keep more of every fare with a 10–12% commission and instant daily settlements.", cta: "Start driving" },
  { icon: Building2, title: "Hotels", body: "List rooms, manage availability and get bookings from travellers already in the app.", cta: "List your hotel" },
  { icon: Truck, title: "Freight", body: "Post loads or bid on shipments in an open B2B marketplace across Nepal.", cta: "Move freight" },
  { icon: Map, title: "Bus operators", body: "Sell intercity seats with live inventory and an 8% flat ticketing fee.", cta: "Add your routes" },
];

export function PartnersSection() {
  const navigate = useNavigate();
  return (
    <Section
      id="partners"
      eyebrow="Grow with Zamzam"
      title="A platform that pays its partners back"
      intro="Lower commissions, faster payouts and a B2B logistics layer competitors don't have."
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {PARTNERS.map((p) => (
          <Card key={p.title} className="flex flex-col p-6">
            <span className="grid size-11 place-items-center rounded-xl bg-brand-900 text-white dark:bg-white dark:text-brand-900">
              <p.icon className="size-5" />
            </span>
            <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-1.5 flex-1 text-sm text-muted-fg">{p.body}</p>
            <Button
              variant="link"
              className="mt-4 self-start px-0"
              onClick={() => navigate("/login")}
            >
              {p.cta} <ArrowRight className="size-4" />
            </Button>
          </Card>
        ))}
      </div>
    </Section>
  );
}

/* ---------------------------- App showcase -------------------------------- */
export function AppShowcase() {
  const navigate = useNavigate();
  return (
    <Section className="bg-surface">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            One app, one wallet
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Pay once. Move through your whole day.
          </h2>
          <p className="mt-4 text-muted-fg">
            Zamzam Pay holds your balance in escrow until a trip completes, releases driver earnings
            instantly, and keeps every receipt in one ledger — across rides, freight, stays and tours.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              { icon: Wallet, t: "One wallet for every service" },
              { icon: ShieldCheck, t: "Escrow-protected payments" },
              { icon: Sparkles, t: "Zamzam Plus: free delivery & priority booking, NPR 499/mo" },
            ].map((row) => (
              <li key={row.t} className="flex items-center gap-3 text-sm">
                <span className="grid size-8 place-items-center rounded-lg bg-accent/10 text-accent-600 dark:text-accent">
                  <row.icon className="size-4" />
                </span>
                {row.t}
              </li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3">
            <Button variant="accent" onClick={() => navigate("/app/wallet")}>
              See the wallet
            </Button>
          </div>
        </div>

        {/* Stylised app frame */}
        <div className="relative mx-auto w-full max-w-sm">
          <div className="rounded-[2.2rem] border border-border bg-card p-3 shadow-lift">
            <div className="rounded-[1.6rem] border border-border bg-bg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-fg">Zamzam Pay balance</p>
                  <p className="font-display text-2xl font-bold">रू —</p>
                </div>
                <Badge variant="accent">
                  <Sparkles className="size-3" /> Plus
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {["Car", "Bus", "Truck", "BedDouble"].map((n) => (
                  <div key={n} className="grid place-items-center rounded-xl bg-surface py-3">
                    <Icon name={n} className="size-5 text-muted-fg" />
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {[0, 1, 2].map((r) => (
                  <div key={r} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <div className="size-8 rounded-lg bg-surface-2" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-2/3 rounded-full bg-surface-2" />
                      <div className="h-2 w-1/3 rounded-full bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ----------------------------- Investors ---------------------------------- */
const MODEL = [
  { seg: "Mobility (taxi / bike)", rule: "12% commission at trip completion" },
  { seg: "Freight exchange", rule: "10% on matched shipments" },
  { seg: "Intercity bus", rule: "8% flat ticketing fee" },
  { seg: "Zamzam Plus", rule: "NPR 499 / month subscription" },
  { seg: "Ad engine", rule: "CPM / CPC contextual placements" },
];

export function InvestorsSection() {
  return (
    <Section
      id="investors"
      eyebrow="For investors"
      title="A super-app economics model"
      intro="Five revenue lines on one shared infrastructure — network effects compound as verticals cross-sell into each other."
    >
      <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
        {MODEL.map((m, i) => (
          <div
            key={m.seg}
            className={`flex items-center justify-between gap-4 px-5 py-4 ${
              i !== MODEL.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span className="font-medium">{m.seg}</span>
            <span className="text-right text-sm text-muted-fg">{m.rule}</span>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-fg">
        Figures reflect the platform's pricing model. Live performance metrics populate from the
        admin analytics layer once operations begin — this product shows real data only.
      </p>
    </Section>
  );
}

/* ------------------------------ Contact ----------------------------------- */
export function ContactSection() {
  const navigate = useNavigate();
  return (
    <Section>
      <Card className="overflow-hidden border-0 bg-brand-900 text-white dark:bg-surface">
        <div className="relative grid items-center gap-8 p-10 sm:p-14 lg:grid-cols-[1.5fr_1fr]">
          <div className="pointer-events-none absolute inset-0 valley-grid opacity-[0.15]" aria-hidden />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Ready to move Nepal forward?
            </h2>
            <p className="mt-3 max-w-lg text-white/70">
              Open the marketplace as a customer, or bring your fleet, hotel or freight business onto
              the platform.
            </p>
          </div>
          <div className="relative flex flex-col gap-3">
            <Button size="lg" variant="accent" onClick={() => navigate("/app")}>
              Open the app <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={() => navigate("/login")}
            >
              Become a partner
            </Button>
          </div>
        </div>
      </Card>
    </Section>
  );
}
