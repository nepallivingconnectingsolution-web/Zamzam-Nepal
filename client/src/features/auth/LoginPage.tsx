import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Mail, Lock, ShieldCheck, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import { ROLE_HOME } from "@/config";
import { api, endpoints, ApiError } from "@/api/client";
import type { User } from "@/types";

type LoginResponse = { accessToken: string; refreshToken: string; user: User; profileComplete: boolean };


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

  async function login() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setLoading(true); setError(null); setPending(null);
    try {
      const res = await api.post<LoginResponse>(endpoints.auth.login, { email, password }, { auth: false });
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
      } else if (detail?.code === "SUSPENDED") {
        setError(detail.message ?? "Account suspended.");
      } else {
        setError(detail?.message ?? "Invalid email or password.");
      }
    } finally { setLoading(false); }
  }

  return (
   <div className="grid min-h-[calc(100vh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 valley-grid opacity-20" aria-hidden />
        <div
          className="pointer-events-none absolute -left-20 top-1/3 size-96 rounded-full bg-accent/20 blur-[120px]"
          aria-hidden
        />
        <Link to="/" className="relative"><Logo /></Link>
        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-display text-4xl font-bold leading-tight">One account for<br />all of Zamzam.</h1>
          <p className="mt-4 max-w-sm text-white/60">
            Sign in with your email and password. Partners register and go live once our team verifies the business.
          </p>
          <div className="mt-6 flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck className="size-4 text-accent" /> Secured with your password
          </div>
        </motion.div>
        <div className="relative text-xs text-white/40">© {new Date().getFullYear()} Zamzam Technologies</div>
      </div>

      <div className="relative flex items-center justify-center p-6">
        <div className="absolute right-4 top-4"><ThemeToggle /></div>
        <motion.div
          className="w-full max-w-sm"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8 lg:hidden"><Logo /></div>
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
            <Button variant="accent" className="w-full" size="lg" onClick={login} disabled={loading}>
              {loading ? "Signing in…" : <>Sign in <ArrowRight className="size-4" /></>}
            </Button>

            {pending && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                <Clock className="mt-0.5 size-3.5 shrink-0" /> {pending}
              </div>
            )}
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>
            )}

            <p className="text-center text-xs text-muted-fg">
              New here? <Link to="/register" state={{ from }} className="text-accent hover:underline">Create an account</Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}