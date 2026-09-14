import { useState } from "react";
import { motion } from "framer-motion";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Mail, Lock, Clock, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { AppFrame } from "@/components/layout/app-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NameInput, PhoneField, isValidPhone, splitPhone } from "@/components/ui/phone-field";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeroNaturePhoto } from "@/components/ui/hero-nature-photo";
import { TerrainLine } from "@/components/ui/terrain-line";
import { Icon } from "@/components/ui/icon";
import taxiImg from "@/assets/services/taxi.webp";
import hotelImg from "@/assets/services/hotels.webp";
import foodImg from "@/assets/services/food.webp";
import groceryImg from "@/assets/services/grocery.webp";
import busImg from "@/assets/services/bus.webp";
import freightImg from "@/assets/services/freight.webp";
import { ROLE_LABEL, ROLE_HOME } from "@/config";
import { api, endpoints, ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import type { Role, User } from "@/types";

type RegisterResponse =
  | { registered: true; pending: true; message: string }
  | { registered: true; accessToken: string; refreshToken: string; user: User };

/**
 * Sign-up has two doors, not one list.
 *
 * Someone who tapped "Book a taxi" is a customer; asking them to first pick
 * their account type from seven options — five of which are businesses they
 * do not run — is friction on the path almost everyone takes, and it invites
 * the wrong pick. So the customer form asks for a name, an email, a phone and
 * a password, and nothing else.
 *
 * Partners get their own door, opened by "Partner with Zamzam" on the landing
 * page (which passes intent through navigation state) or by the switch link at
 * the bottom of the customer form. Only there does the business-type picker
 * appear, because only there is it a question worth asking.
 *
 * Driver sits on the partner side: like a business, a driver is verified by an
 * admin before going live, so grouping it with "just booking" would promise an
 * account that works immediately and then not deliver one.
 */
type Intent = "customer" | "partner";

type PartnerRole = Exclude<Role, "guest" | "admin" | "customer">;

const PARTNER_ROLES: { role: PartnerRole; icon: string; image: string }[] = [
  { role: "driver", icon: "Car", image: taxiImg },
  { role: "hotel", icon: "BedDouble", image: hotelImg },
  { role: "restaurant", icon: "UtensilsCrossed", image: foodImg },
  { role: "grocery", icon: "ShoppingBasket", image: groceryImg },
  { role: "bus_operator", icon: "Bus", image: busImg },
  { role: "freight", icon: "Truck", image: freightImg },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthStore();
  // Where the person originally wanted to go (e.g. /app/book/taxi), carried
  // over from the service tile on the homepage via the login page — plus which
  // door they came through, so "Partner with Zamzam" opens the partner form.
  const state = location.state as { from?: string; intent?: Intent } | null;
  const from = state?.from;

  const [intent, setIntent] = useState<Intent>(state?.intent === "partner" ? "partner" : "customer");
  const [step, setStep] = useState<"form" | "done">("form");
  const [partnerRole, setPartnerRole] = useState<PartnerRole>("driver");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("+977");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const role: Exclude<Role, "guest" | "admin"> = intent === "partner" ? partnerRole : "customer";

  function switchTo(next: Intent) {
    setIntent(next);
    setError(null);
  }

  async function submit() {
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!isValidPhone(mobile)) return setError("Enter your mobile number with its country code.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true); setError(null);
    try {
      // The API takes the number as digits with the country code, no spaces.
      const { dial, national } = splitPhone(mobile);
      const res = await api.post<RegisterResponse>(
        endpoints.auth.register,
        { name, email, password, mobile: `${dial}${national}`.replace("+", ""), role },
        { auth: false },
      );
      if ("accessToken" in res) {
        setSession(res.accessToken, res.user, res.refreshToken);
        toast.success("Account created", "Let's finish setting up your profile.");
        const actualRole = res.user.role;
        if (actualRole === "customer") {
          navigate("/profile/setup", { state: { from } });
        } else {
          navigate(ROLE_HOME[actualRole]);
        }
      } else {
        setStep("done");
        toast.info("Registration submitted", "We'll review your business shortly.");
      }
    } catch (e) {
      setError((e instanceof ApiError && (e.detail as { message?: string })?.message) || "Couldn't create your account.");
    } finally { setLoading(false); }
  }

  // Mirrors LoginPage's shell: a signed-out visitor moving between "Sign in"
  // and "Create an account" should feel like one continuous door, not two
  // different apps — same header, same hero photo/terrain-ridge band below
  // lg, same full-height split pane at lg+. See LoginPage.tsx for the fuller
  // rationale on why the layout forks at that breakpoint.
  return (
    <AppFrame>
     <div className="flex flex-1 flex-col lg:flex-row">
      <div className="relative hidden shrink-0 overflow-hidden bg-teal-700 text-white lg:flex lg:w-[38%] lg:flex-col lg:justify-between xl:w-[34%]">
        <HeroNaturePhoto />
        <TerrainLine variant="hero" animate />
        <div className="relative z-10 p-10"><Logo className="text-white" /></div>
        <div className="relative z-10 p-10">
          <span className="inline-flex items-center gap-2 rounded-sm bg-white/10 px-2.5 py-1 text-caption font-semibold uppercase tracking-wider text-white/80">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
            </span>
            Kathmandu · Nepal
          </span>
          <p className="mt-4 font-display text-display font-extrabold text-balance">Namaste 👋</p>
          <p className="mt-2 text-body text-white/70">Your journey across Nepal starts here.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <header className="flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 px-4 pt-[env(safe-area-inset-top)] lg:px-10">
          <Logo className="lg:hidden" />
          <div className="ml-auto"><ThemeToggle /></div>
        </header>

        {/* Mobile/tablet-only photo band — replaced by the left pane at lg. */}
        <div className="relative shrink-0 overflow-hidden bg-teal-700 px-6 pb-12 pt-3 text-white lg:hidden">
          <HeroNaturePhoto />
          <TerrainLine variant="hero" animate />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-sm bg-white/10 px-2.5 py-1 text-caption font-semibold uppercase tracking-wider text-white/80">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
              </span>
              Kathmandu · Nepal
            </span>
            <p className="mt-3 font-display text-h1 font-extrabold text-balance">Namaste 👋</p>
            <p className="mt-1 text-body-sm text-white/70">Your journey across Nepal starts here.</p>
          </div>
        </div>

        <motion.div
          className="relative z-10 -mt-6 flex-1 rounded-t-2xl bg-bg px-6 pb-8 pt-7 shadow-e2 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-10 lg:shadow-none"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
        <div className="mx-auto w-full max-w-sm py-2">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {intent === "partner" ? "List your business" : "Create your account"}
          </h1>
          <p className="mt-1 text-sm text-muted-fg">
            {intent === "partner"
              ? "Tell us what you run. Our team verifies every partner before you go live."
              : "One account for rides, buses, hotels, food and deliveries."}
          </p>

          {step === "form" && (
            <div className="mt-6 space-y-3">
              {intent === "partner" && (
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-fg">What do you run?</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PARTNER_ROLES.map((r) => (
                      <button
                        key={r.role}
                        type="button"
                        aria-pressed={partnerRole === r.role}
                        onClick={() => setPartnerRole(r.role)}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors duration-fast ease-standard ${
                          partnerRole === r.role
                            ? "border-teal-700 bg-teal-100 text-teal-700 dark:border-accent dark:bg-white/10 dark:text-accent"
                            : "border-border text-muted-fg hover:bg-surface-2"
                        }`}
                      >
                        <span className="grid size-9 place-items-center overflow-hidden rounded-lg bg-surface-2">
                          {r.image ? (
                            <img src={r.image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon name={r.icon} className="size-5" />
                          )}
                        </span>
                        {ROLE_LABEL[r.role].split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <NameInput placeholder="Full name" value={name} onChange={setName} />

              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
                <Input placeholder="Email" type="email" className="pl-9" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>

              <PhoneField value={mobile} onChange={setMobile} />

              <PasswordInput
                leadingIcon={<Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />}
                placeholder="Password (min 8 characters)"
                value={password} onChange={(e) => setPassword(e.target.value)} />

              <Button variant="accent" size="lg" className="w-full" onClick={submit} disabled={loading}>
                {loading ? "Creating account…" : <>Create account <ArrowRight className="size-4" /></>}
              </Button>

              {intent === "partner" && (
                <p className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted-fg">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
                  You'll upload your licence and permits after signing up. They're required before
                  you can publish anything.
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>
              )}

              {/* The other door. Quiet, but always present on both sides. */}
              <div className="border-t border-border pt-3 text-center">
                <button type="button" onClick={() => switchTo(intent === "partner" ? "customer" : "partner")}
                  className="text-xs font-medium text-accent-600 hover:underline dark:text-accent">
                  {intent === "partner" ? "Just want to book? Create a customer account" : "Run a business? Partner with Zamzam"}
                </button>
              </div>

              <p className="text-center text-xs text-muted-fg">
                Already have an account?{" "}
                <Link to="/login" state={{ from }} className="text-accent hover:underline">Sign in</Link>
              </p>
            </div>
          )}

          {step === "done" && (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-6 text-center shadow-e1">
              <div className="flex size-12 items-center justify-center rounded-full bg-warning/10 text-warning">
                <Clock className="size-6" />
              </div>
              <h3 className="font-semibold">Registration submitted</h3>
              <p className="text-sm text-muted-fg">
                Your account is awaiting verification. Once approved, sign in with your email and password.
              </p>
              <Button variant="outline" onClick={() => navigate("/login", { state: { from } })}>Back to sign in</Button>
            </div>
          )}
        </div>
        </motion.div>
      </div>
     </div>
    </AppFrame>
  );
}
