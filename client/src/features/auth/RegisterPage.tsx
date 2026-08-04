import { useState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { ArrowRight, Building2, Phone, Mail, Lock, Clock, User as UserIcon } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { ROLE_LABEL, ROLE_HOME } from "@/config";
import { api, endpoints, ApiError } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import type { Role, User } from "@/types";


type RegisterResponse =
  | { registered: true; pending: true; message: string }
  | { registered: true; accessToken: string; refreshToken: string; user: User };

const ALL_ROLES: { role: Exclude<Role, "guest" | "admin">; icon: string }[] = [
  { role: "customer", icon: "User" },
  { role: "driver", icon: "Car" },
  { role: "hotel", icon: "BedDouble" },
  { role: "restaurant", icon: "UtensilsCrossed" },
    { role: "grocery", icon: "ShoppingBasket" },   // ← add
  { role: "bus_operator", icon: "Bus" },
  { role: "freight", icon: "Truck" },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuthStore();
  // Where the person originally wanted to go (e.g. /app/book/taxi), carried
  // over from the service tile on the homepage via the login page.
  const from = (location.state as { from?: string } | null)?.from;
  const [step, setStep] = useState<"form" | "done">("form");
  const [role, setRole] = useState<typeof ALL_ROLES[number]["role"]>("customer");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (!/^[0-9]{7,15}$/.test(mobile)) return setError("Enter a valid mobile number.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true); setError(null);
    try {
      const res = await api.post<RegisterResponse>(
        endpoints.auth.register,
        { name, email, password, mobile, role },
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

  return (
   <div className="relative min-h-[calc(100vh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] bg-bg flex items-center justify-center p-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="font-display text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-fg text-center">
            Partners are verified by our team before going live. Already have an account?{" "}
            <Link to="/login" state={{ from }} className="text-accent hover:underline">Sign in</Link>.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
          {step === "form" && (
            <>
              <div>
                <p className="mb-2 text-xs font-medium text-muted-fg">Account type</p>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_ROLES.map((r) => (
                    <button key={r.role} onClick={() => setRole(r.role)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[11px] font-medium transition-colors ${
                        role === r.role ? "border-accent bg-accent/10 text-accent-600 dark:text-accent"
                        : "border-border text-muted-fg hover:bg-surface-2"}`}>
                      <Icon name={r.icon} className="size-5" />
                      {ROLE_LABEL[r.role].split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
                <Input placeholder="Full name" className="pl-9" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
                <Input placeholder="Email" type="email" className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />
                <Input placeholder="98XXXXXXXX" inputMode="tel" className="pl-9" value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </div>
               <PasswordInput
                 leadingIcon={<Lock className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-fg" />}
                 placeholder="Password (min 8 characters)"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button variant="accent" size="lg" className="w-full" onClick={submit} disabled={loading}>
                Create account <ArrowRight className="size-4" />
              </Button>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30">
                <Clock className="size-6" />
              </div>
              <h3 className="font-semibold">Registration submitted</h3>
              <p className="text-sm text-muted-fg">
                Your account is awaiting super-admin verification. Once approved, sign in with your email and password.
              </p>
              <Button variant="outline" onClick={() => navigate("/login", { state: { from } })}>Back to sign in</Button>
            </div>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">{error}</p>}
        </div>
      </div>
      
    </div>
  );
}