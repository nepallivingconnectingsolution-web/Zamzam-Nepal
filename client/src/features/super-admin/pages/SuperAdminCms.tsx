import { useEffect, useState } from "react";
import { Megaphone, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResource } from "@/hooks/useResource";
import { useSuperAdminApi } from "@/features/super-admin/useSuperAdminApi";
import { toast } from "@/stores/toast.store";

interface CmsBanner {
  id: string;
  title: string;
  message: string;
  active: boolean;
}

interface CmsContent {
  banners: CmsBanner[];
  serviceFlags: Record<string, boolean>;
  services: string[];
  updatedAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  bike: "Bike rides",
  taxi: "Taxi",
  parcel: "Parcel delivery",
  freight: "Freight",
  bus: "Intercity buses",
  hotel: "Hotels",
  food: "Food delivery",
  grocery: "Groceries",
};

export function SuperAdminCms() {
  const { saApi } = useSuperAdminApi();
  const cms = useResource<CmsContent>(() => saApi("/super-admin/cms"));

  // Editable working copy. `dirty` guards it: fresh server data only
  // overwrites the editor when there are no unsaved changes, so a background
  // refetch can never clobber an admin's in-progress edits.
  const [banners, setBanners] = useState<CmsBanner[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    if (cms.data && !dirty) {
      setBanners(cms.data.banners);
      setFlags(cms.data.serviceFlags);
    }
  }, [cms.data, dirty]);

  function addBanner() {
    const title = newTitle.trim();
    if (!title) return;
    setBanners((b) => [
      ...b,
      { id: `bnr_${Date.now()}`, title, message: newMessage.trim(), active: true },
    ]);
    setNewTitle("");
    setNewMessage("");
    setDirty(true);
  }

  function toggleBanner(id: string) {
    setBanners((b) => b.map((x) => (x.id === id ? { ...x, active: !x.active } : x)));
    setDirty(true);
  }

  function removeBanner(id: string) {
    setBanners((b) => b.filter((x) => x.id !== id));
    setDirty(true);
  }

  function toggleService(key: string) {
    setFlags((f) => ({ ...f, [key]: !f[key] }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await saApi("/super-admin/cms", {
        method: "PATCH",
        body: { banners, serviceFlags: flags },
      });
      setDirty(false);
      toast.success("CMS saved", "Storefront content updated.");
      cms.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save CMS content.");
    } finally {
      setSaving(false);
    }
  }

  const services = cms.data?.services ?? Object.keys(SERVICE_LABELS);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CMS"
        subtitle="Services, banners, promotions, pricing."
        actions={
          <Button variant="accent" onClick={save} disabled={!dirty || saving}>
            <Save /> {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      {cms.state === "error" ? (
        <Card className="p-6 text-sm text-muted-fg">
          Couldn't load CMS content.{" "}
          <button className="font-medium text-accent hover:underline" onClick={() => cms.refetch()}>
            Try again
          </button>
        </Card>
      ) : (
        <>
          {/* ── Service availability ── */}
          <Card>
            <CardHeader>
              <CardTitle>Service availability</CardTitle>
              <CardDescription>
                Switch a service off to hide it from customers instantly — e.g. during a partner
                outage. New bookings for a disabled service stop; existing bookings are unaffected.
              </CardDescription>
            </CardHeader>
            <div className="grid gap-3 p-5 pt-0 sm:grid-cols-2 xl:grid-cols-4">
              {services.map((key) => {
                const on = flags[key] ?? true;
                return (
                  <button
                    key={key}
                    onClick={() => toggleService(key)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                      on ? "border-accent/40 bg-accent/5" : "border-border bg-surface opacity-70"
                    }`}
                  >
                    <span className="font-medium">{SERVICE_LABELS[key] ?? key}</span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        on ? "bg-accent/15 text-accent" : "bg-muted text-muted-fg"
                      }`}
                    >
                      {on ? "Live" : "Off"}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
          
          {/* ── Banners & promotions ── */}
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Banners & promotions</CardTitle>
              <CardDescription>
                Announcements shown to customers. Only banners marked Live are served to the app
                (via GET /cms); paused ones stay here as drafts.
              </CardDescription>
            </CardHeader>

            <div className="min-w-0 space-y-3 p-5 pt-0">
              {banners.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-fg">
                  No banners yet — add your first promotion below.
                </p>
              )}
              {banners.map((b) => (
                <div key={b.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-border p-4">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-700 dark:bg-white/10 dark:text-accent">
                    <Megaphone className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-semibold">{b.title}</p>
                    {b.message && <p className="mt-0.5 truncate text-sm text-muted-fg">{b.message}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant={b.active ? "subtle" : "outline"} size="sm" onClick={() => toggleBanner(b.id)}>
                      {b.active ? "Live" : "Paused"}
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete banner" onClick={() => removeBanner(b.id)}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Banner title — e.g. “20% off intercity buses this Dashain”"
                  maxLength={80}
                />
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Optional message shown under the title"
                  maxLength={200}
                />
                <Button variant="outline" onClick={addBanner} disabled={!newTitle.trim()}>
                  <Plus /> Add
                </Button>
              </div>
            </div>
          </Card>

          {/* ── Pricing pointer ── */}
          <Card className="p-5 text-sm text-muted-fg">
            Platform pricing (the service fee % applied to fares) lives with the other platform-wide
            knobs in{" "}
            <a href="/x-admin/settings" className="font-medium text-accent hover:underline">
              Settings
            </a>{" "}
            — kept in one place so there's a single audited source of truth for fees.
          </Card>
        </>
      )}
    </div>
  );
}