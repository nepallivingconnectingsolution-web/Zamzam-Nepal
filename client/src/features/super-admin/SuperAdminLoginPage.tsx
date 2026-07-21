import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useSuperAdminStore } from "@/stores/super-admin.store";
import { api } from "@/api/client";

interface LoginResponse {
  accessToken: string;
  admin: { id: string; name: string; email: string };
}

export function SuperAdminLoginPage() {
  const navigate = useNavigate();
  const { setSession } = useSuperAdminStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      setError("Both fields are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<LoginResponse>(
        "/super-admin/auth/login",
        { email, password },
        { auth: false },
      );
      setSession(res.accessToken, res.admin);
      navigate("/x-admin");
    } catch (err: unknown) {
      const e = err as { message?: string };
      const msg = e?.message ?? "Login failed.";
      setError(
        msg.includes("401") || msg.includes("Unauthorized")
          ? "Invalid credentials."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-900 text-white shadow-lg">
            <ShieldAlert className="size-7" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Super Admin
            </h1>
            <p className="mt-1 text-sm text-muted-fg">Zamzam Platform Control</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-fg">
              Admin email
            </label>
            <Input
              type="email"
              placeholder="admin@zamzam.com.np"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-fg">
              Password
            </label>
            <PasswordInput
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLogin(); }}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          <Button
            variant="accent"
            className="w-full"
            size="lg"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Authenticating…
              </>
            ) : (
              <>
                <Lock className="size-4" /> Sign in securely
              </>
            )}
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-fg/50">
          Restricted access · All sessions are logged
        </p>
      </div>
    </div>
  );
}