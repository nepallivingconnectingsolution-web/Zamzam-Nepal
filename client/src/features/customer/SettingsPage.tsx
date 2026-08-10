import { useState } from "react";
import { KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { api, ApiError, endpoints } from "@/api/client";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";

/**
 * Account settings — profile details, password, and account status.
 * Mobile number is intentionally read-only: it is the login identifier
 * and is unique per account, so changing it needs an OTP re-verification
 * flow (planned) rather than a plain text edit.
 */
export function SettingsPage() {
  const { user, updateUser } = useAuthStore();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Your profile, security and account status." />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProfileSection
          initialName={user?.name ?? ""}
          initialEmail={user?.email ?? ""}
          onSaved={(name, email) => updateUser({ name, email })}
        />
        <PasswordSection />
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-fg" />
          <h2 className="font-display text-base font-semibold">Account</h2>
        </div>
        <dl className="grid gap-4 text-sm">
          <div>
            <dt className="text-xs text-muted-fg">Mobile (login ID)</dt>
            <dd className="mt-1 font-medium">{user?.mobile ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-fg">Role</dt>
            <dd className="mt-1">
              <Badge variant="outline" className="text-[10px]">
                {user?.role ?? "—"}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-fg">Verification</dt>
            <dd className="mt-1">
              <Badge
                variant={user?.kycStatus === "APPROVED" ? "success" : user?.kycStatus === "SUSPENDED" ? "danger" : "outline"}
                className="text-[10px]"
              >
                {user?.kycStatus ?? "—"}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function ProfileSection({
  initialName,
  initialEmail,
  onSaved,
}: {
  initialName: string;
  initialEmail: string;
  onSaved: (name: string, email: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);

  const dirty = name.trim() !== initialName || email.trim() !== initialEmail;

  async function save() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) {
      toast.error("Your name can't be empty.");
      return;
    }
    setSaving(true);
    try {
      await api.post(endpoints.profile.customer, {
        fullName: trimmedName,
        ...(trimmedEmail ? { email: trimmedEmail } : {}),
      });
      onSaved(trimmedName, trimmedEmail);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <UserRound className="size-4 text-muted-fg" />
        <h2 className="font-display text-base font-semibold">Profile</h2>
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-name" className="text-sm font-medium">
          Full name
        </label>
        <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-email" className="text-sm font-medium">
          Email
        </label>
        <Input
          id="settings-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <Button variant="primary" onClick={save} disabled={saving || !dirty}>
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await api.patch(endpoints.profile.password, { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. Other devices have been signed out.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't change your password. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-fg" />
        <h2 className="font-display text-base font-semibold">Password</h2>
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-current-pw" className="text-sm font-medium">
          Current password
        </label>
        <PasswordInput
          id="settings-current-pw"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-new-pw" className="text-sm font-medium">
          New password
        </label>
        <PasswordInput
          id="settings-new-pw"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="settings-confirm-pw" className="text-sm font-medium">
          Confirm new password
        </label>
        <PasswordInput
          id="settings-confirm-pw"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <Button variant="primary" onClick={save} disabled={saving || !current || !next || !confirm}>
        {saving ? "Changing…" : "Change password"}
      </Button>
    </Card>
  );
}