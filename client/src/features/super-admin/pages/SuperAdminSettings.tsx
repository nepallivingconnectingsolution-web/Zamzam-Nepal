import { useEffect, useState } from "react";
import { AlertTriangle, Percent, Save, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/async-states";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi, SuperAdminApiError } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";

interface PlatformSettings {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  serviceFeePercent: number;
  maintenanceMode: boolean;
  updatedAt: string;
}

export function SuperAdminSettings() {
  const { saApi } = useSuperAdminApi();
  const settings = useResource<PlatformSettings>(() => saApi<PlatformSettings>("/super-admin/settings"), []);

  const [form, setForm] = useState<PlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed the editable form once the real settings load; re-seeding on every
  // render would blow away in-progress edits.
  useEffect(() => {
    if (settings.data && !form) setForm(settings.data);
  }, [settings.data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const updated = await saApi<PlatformSettings>("/super-admin/settings", {
        method: "PATCH",
        body: {
          platformName: form.platformName,
          supportEmail: form.supportEmail,
          supportPhone: form.supportPhone,
          serviceFeePercent: Number(form.serviceFeePercent),
          maintenanceMode: form.maintenanceMode,
        },
      });
      setForm(updated);
      toast.success("Settings saved", "Platform-wide configuration has been updated.");
    } catch (err) {
      const message = err instanceof SuperAdminApiError ? err.message : "Couldn't save settings. Try again.";
      toast.error("Save failed", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Platform-wide configuration for the Zamzam marketplace." />

      {settings.state === "loading" || settings.state === "idle" ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : settings.state === "error" ? (
        <ErrorState onRetry={settings.refetch} message={settings.error?.message} />
      ) : form ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>General</CardTitle>
              <CardDescription>Platform identity and support contact shown to customers and partners.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Platform name</label>
                <Input
                  value={form.platformName}
                  onChange={(e) => setForm({ ...form, platformName: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Support email</label>
                  <Input
                    type="email"
                    value={form.supportEmail}
                    onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Support phone</label>
                  <Input
                    value={form.supportPhone}
                    onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Percent className="size-4 text-muted-fg" /> Commission
              </CardTitle>
              <CardDescription>
                The service fee percentage applied on top of bus and hotel bookings — this is Zamzam's
                platform commission, shown transparently on every partner's revenue page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-w-xs space-y-1.5">
                <label className="text-sm font-medium">Service fee (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={form.serviceFeePercent}
                  onChange={(e) => setForm({ ...form, serviceFeePercent: Number(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="size-4 text-muted-fg" /> Maintenance mode
              </CardTitle>
              <CardDescription>
                Temporarily flags the platform as under maintenance. Toggle off before going live.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <button
                type="button"
                role="switch"
                aria-checked={form.maintenanceMode}
                onClick={() => setForm({ ...form, maintenanceMode: !form.maintenanceMode })}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                  form.maintenanceMode
                    ? "border-danger/30 bg-danger/10 text-danger"
                    : "border-border bg-surface-2 text-muted-fg"
                }`}
              >
                {form.maintenanceMode && <AlertTriangle className="size-4" />}
                {form.maintenanceMode ? "Maintenance mode is ON" : "Maintenance mode is OFF"}
                <span
                  className={`ml-2 inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    form.maintenanceMode ? "bg-danger" : "bg-border"
                  }`}
                >
                  <span
                    className={`size-4 rounded-full bg-white shadow-sm transition-transform ${
                      form.maintenanceMode ? "translate-x-[18px]" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </button>
            </CardContent>
            <CardFooter className="justify-between">
              <p className="text-xs text-muted-fg">
                Last updated {new Date(form.updatedAt).toLocaleString("en-NP")}
              </p>
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
              </Button>
            </CardFooter>
          </Card>
        </>
      ) : null}
    </div>
  );
}