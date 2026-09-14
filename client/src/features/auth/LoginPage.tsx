import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Mail, Lock, ShieldCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Logo } from "@/components/layout/logo";
import { AppFrame } from "@/components/layout/app-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { HeroNaturePhoto } from "@/components/ui/hero-nature-photo";
import { TerrainLine } from "@/components/ui/terrain-line";
import { ForgotPasswordFlow } from "@/components/auth/ForgotPasswordFlow";
import { useAuthStore } from "@/stores/auth.store";
import { useSuperAdminStore } from "@/stores/super-admin.store";
import { toast } from "@/stores/toast.store";
import { ROLE_HOME } from "@/config";
import { api, endpoints, ApiError } from "@/api/client";
import type { User } from "@/types";

type SuperAdmin = { id: string; name: string; email: string };

/**
 * Two shapes from one endpoint. A super admin is a different identity — its own
 * table, its own JWT secret, its own guard — so the server answers with
 * `superAdmin: true` and an admin instead of a user, and never a refresh token.
 * The discriminant is what keeps the two apart at the call site.
 */
type LoginResponse =
  | { superAdmin: true; accessToken: string; admin: SuperAdmin }
  | {
      // `?: undefined` rather than `?: false` — the server omits the field
      // entirely for a normal user, and this is the spelling that lets a plain
      // `if (res.superAdmin)` narrow the union at the call site.
      superAdmin?: undefined;
      accessToken: string;
      refreshToken: string;
      user: User;
      profileComplete: boolean;
    };


export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthStore();
  // If the user got here by tapping a service tile (or hitting a protected
  // /app URL directly) while signed out, this carries where they meant to go.
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    try {
      const reason = sessionStorage.getItem("zz_signout_reason");
      if (reason) {
        sessionStorage.removeItem("zz_signout_reason");
        toast.info("Signed out", reason);
      }
    } catch {
      // ignore
    }
  }, []);

  /** Hands the tab to the super-admin console. Shared by both paths below. */
  function enterSuperAdmin(accessToken: string, admin: SuperAdmin) {
    useSuperAdminStore.getState().setSession(accessToken, admin);
    toast.success("Signed in", `Welcome back, ${admin.name.split(" ")[0]}.`);
    navigate("/x-admin");
  }

  async function login() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setLoading(true); setError(null); setPending(null);
    try {
      const res = await api.post<LoginResponse>(endpoints.auth.login, { email, password }, { auth: false });

      // Super-admin credentials in the ordinary form. The server recognises
      // them and answers with an admin session instead of a user one, so the
      // hidden /x-admin/login URL is no longer something you have to know.
      if (res.superAdmin) return enterSuperAdmin(res.accessToken, res.admin);

      setSession(res.accessToken, res.user, res.refreshToken);
      toast.success("Signed in", `Welcome back, ${res.user.name.split(" ")[0]}.`);
      // New partners finish their business profile on first sign-in; everyone
      // whose profile is already complete goes straight to their portal.
      if (!res.profileComplete) {
        navigate("/profile/setup", { state: { from } });
      } else if (from && res.user.role === "customer") {
        // Only customers use the /app/* service pages, so only honor `from`
        // for that role — a driver/partner/admin login always goes to their
        // own portal home.
        navigate(from);
      } else {
        navigate(ROLE_HOME[res.user.role]);
      }
    } catch (e) {
      const detail = e instanceof ApiError ? (e.detail as { code?: string; message?: string }) : null;
      if (detail?.code === "PENDING_APPROVAL") {
        setPending(detail.message ?? "Your account is awaiting super-admin verification.");
        return;
      }
      if (detail?.code === "SUSPENDED") {
        setError(detail.message ?? "Account suspended.");
        return;
      }

      // Plain invalid-credentials. Before showing it, retry once against the
      // dedicated super-admin endpoint.
      //
      // This exists because the client and the API deploy independently: until
      // the server carrying the check above is live, /auth/login rejects admin
      // credentials outright, and this fallback is what makes signing in
      // through this form work anyway. It stays afterwards as the safety net
      // for that same skew in the other direction.
      try {
        const sa = await api.post<{ accessToken: string; admin: SuperAdmin }>(
          "/super-admin/auth/login",
          { email, password },
          { auth: false },
        );
        return enterSuperAdmin(sa.accessToken, sa.admin);
      } catch {
        // Deliberately the ORIGINAL error, never anything derived from the
        // admin attempt. "Invalid email or password." has to read identically
        // whether the address is unknown, a user with a bad password, or a
        // real admin who mistyped — anything else turns this form into an
        // oracle for discovering that an address is a super admin.
        setError(detail?.message ?? "Invalid email or password.");
      }
    } finally { setLoading(false); }
  }

  // Sign-in is the app's front door now (see RootEntry in routes/index.tsx),
  // so it renders in the same phone frame as every in-app screen. It borrows
  // the home screen's hero treatment — the Pashupatinath valley photo and
  // the terrain-ridge line — so the first and second screens a signed-out
  // visitor sees read as one place, not a website login bolted onto an app.
  //
  // Below lg it's the stacked phone layout: a short photo band over a card.
  // At lg+ that band would have to stretch edge-to-edge to avoid looking like
  // a stray floating strip, and a band that wide but still short crops the
  // photo down to a sliver (see HeroNaturePhoto usage below). So at lg the
  // photo instead becomes a full-height LEFT PANE next to the form, the
  // classic split-screen shape — tall enough that object-cover has real
  // room to work with, and it fills the desktop viewport properly instead
  // of leaving the photo band an odd, narrow ribbon over a wide blank page.
  return (
   <AppFrame>
    <div className="flex flex-1 flex-col lg:flex-row">
      {/* Desktop-only left pane. Hidden below lg — the mobile layout gets
          its own shorter photo band further down instead. */}
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
          <div className="mx-auto w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-fg">Sign in with your email and password.</p>

          <div className="mt-6 space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
              <Input placeholder="you@example.com" type="email" className="pl-9"
                value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && login()} />
            </div>
          <PasswordInput
            leadingIcon={<Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />}
            placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()} />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-xs font-medium text-accent-600 hover:underline dark:text-accent"
              >
                Forgot password?
              </button>
            </div>

            <Button variant="accent" className="w-full" size="lg" onClick={login} disabled={loading}>
              {loading ? "Signing in…" : <>Sign in <ArrowRight className="size-4" /></>}
            </Button>

            {pending && (
              <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                <Clock className="mt-0.5 size-3.5 shrink-0" /> {pending}
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>
            )}

            <p className="text-center text-xs text-muted-fg">
              New here? <Link to="/register" state={{ from }} className="text-accent hover:underline">Create an account</Link>
            </p>
          </div>
          </div>
        </motion.div>
      </div>
    </div>

    <ForgotPasswordFlow open={forgotOpen} onClose={() => setForgotOpen(false)} mode="user" />
   </AppFrame>
  );
}