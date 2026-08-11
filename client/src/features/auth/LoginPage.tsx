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
  // so it renders in the same phone frame as every in-app screen. The old
  // lg:grid-cols-2 split with a marketing panel down the left was a website
  // pattern — fine for a page you arrive at from an ad, wrong for the first
  // screen of an application.
  return (
   <AppFrame>
      <div className="relative flex flex-1 items-center justify-center p-6">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8"><Logo /></div>
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
        </motion.div>
      </div>

      <ForgotPasswordFlow open={forgotOpen} onClose={() => setForgotOpen(false)} mode="user" />
    </AppFrame>
  );
}