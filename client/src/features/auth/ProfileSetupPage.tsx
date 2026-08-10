import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/layout/logo";
import { AppFrame } from "@/components/layout/app-frame";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import { ROLE_HOME } from "@/config";
import { api, endpoints, ApiError } from "@/api/client";

export function ProfileSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const isBusiness = !!user && user.role !== "customer" && user.role !== "admin";
  // The service page the person originally tapped (e.g. /app/book/taxi),
  // carried all the way from the homepage tile through login/register.
  const from = (location.state as { from?: string } | null)?.from;

  const [fullName, setFullName] = useState(user?.name && user.name !== "Zamzam user" ? user.name : "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [businessName, setBusinessName] = useState("");
  const [address, setAddress] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) { navigate("/login", { state: { from } }); return null; }

  async function save() {
    setLoading(true); setError(null);
    try {
      if (isBusiness) {
        if (!businessName.trim()) throw new Error("Business name is required.");
        await api.post(endpoints.profile.business, { businessName, address, documentRef });
      } else {
        if (!fullName.trim()) throw new Error("Your name is required.");
        await api.post(endpoints.profile.customer, { fullName, email: email || undefined });
      }
      toast.success(isBusiness ? "Business saved" : "Profile saved", "You're all set.");
      if (!isBusiness && user!.role === "customer" && from) {
        navigate(from);
      } else {
        navigate(ROLE_HOME[user!.role as keyof typeof ROLE_HOME] ?? "/app");
      }
    } catch (e) {
      setError(e instanceof ApiError ? "Couldn't save your profile." : (e as Error).message);
    } finally { setLoading(false); }
  }

  // In the frame like sign-in and sign-up: this is the screen immediately
  // after creating an account, so a full-width web layout here would be a
  // visible seam in the middle of the flow.
  return (
    <AppFrame>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo />
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {isBusiness ? "Set up your business" : "Complete your profile"}
          </h1>
          <p className="text-sm text-muted-fg text-center">
            {isBusiness ? "Tell customers about your business." : "A couple of details and you're ready to go."}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-4">
          {isBusiness ? (
            <>
              <Field label="Business name"><Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Himalayan Rides" /></Field>
              <Field label="Address"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Kathmandu, Nepal" /></Field>
              <Field label="License / registration doc URL (optional)"><Input value={documentRef} onChange={(e) => setDocumentRef(e.target.value)} placeholder="https://…" /></Field>
            </>
          ) : (
            <>
              <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" /></Field>
              <Field label="Email (optional)"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
            </>
          )}
          {error && <p className="rounded-lg bg-danger/10 px-3 py-2 text-xs font-medium text-danger">{error}</p>}
          <Button variant="accent" size="lg" className="w-full" onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save & continue"}
          </Button>
        </div>
        </div>
      </div>
    </AppFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-muted-fg">{label}</label>
      {children}
    </div>
  );
}