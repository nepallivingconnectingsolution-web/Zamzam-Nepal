import { useEffect, useRef } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Clock, LogOut, ShieldAlert } from "lucide-react";
import { AppFrame } from "@/components/layout/app-frame";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BUSINESS_ROLES } from "@/components/auth/RequireRole";
import { useResource } from "@/hooks/useResource";
import { api, endpoints } from "@/api/client";
import { ROLE_HOME } from "@/config";
import { useAuthStore } from "@/stores/auth.store";
import { toast } from "@/stores/toast.store";
import { PartnerDocumentsPage, type PartnerType } from "@/features/partner/PartnerDocumentsPage";

interface Me {
  kycStatus: "PENDING" | "APPROVED" | "SUSPENDED";
  businessName: string | null;
  businessAddress: string | null;
  profileComplete: boolean;
}

const POLL_MS = 8_000;

/**
 * Where a business partner lands until a super admin approves it. It can
 * confirm its details and upload the required documents, and nothing else: the
 * server closes every other partner route to it. The page polls the account, so
 * the moment the super admin approves, it opens the real portal.
 */
export function PartnerVerificationPage() {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  // Only unapproved businesses belong here; everyone else has a real home.
  if (!BUSINESS_ROLES.includes(user.role) || user.kycStatus === "APPROVED") {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }
  return <Verification role={user.role as PartnerType} />;
}

function Verification({ role }: { role: PartnerType }) {
  const { updateUser, signOut } = useAuthStore();
  const navigate = useNavigate();
  const me = useResource<Me>(() => api.get<Me>(endpoints.profile.me), [], { refreshInterval: POLL_MS });

  const status = me.data?.kycStatus;
  // Once only: updateUser replaces `user`, so anything depending on it would
  // re-trigger itself.
  const handedOver = useRef(false);
  useEffect(() => {
    if (status !== "APPROVED" || handedOver.current) return;
    handedOver.current = true;
    updateUser({ kycStatus: "APPROVED" });
    toast.success("You're approved!", "Your business is now live on Zamzam.");
    navigate(ROLE_HOME[role], { replace: true });
  }, [status, role, updateUser, navigate]);

  const profile = me.data;
  const rejected = status === "SUSPENDED";

  return (
    <AppFrame>
      <div className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16 sm:p-6">
        <header className="flex items-center justify-between">
          <Logo />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              signOut();
              navigate("/login", { replace: true });
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </header>

        {rejected ? (
          <Card className="flex items-start gap-3 border-l-4 border-l-danger p-5">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-danger" />
            <div>
              <h1 className="font-display text-xl font-bold">Your application wasn't approved</h1>
              <p className="mt-1 text-sm text-muted-fg">
                Contact support if you think this is a mistake. You can't publish anything on Zamzam until it's approved.
              </p>
            </div>
          </Card>
        ) : (
          <>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Verify your business</h1>
              <p className="mt-1 text-sm text-muted-fg">
                Upload the documents below. Our team reviews them and approves your business, usually within a day. This page
                updates by itself.
              </p>
            </div>

            <Card className="flex items-start gap-3 border-l-4 border-l-warning p-4">
              <Clock className="mt-0.5 size-5 shrink-0 text-warning" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Awaiting approval</p>
                <p className="mt-0.5 text-sm text-muted-fg">
                  {profile?.businessName ? (
                    <>
                      {profile.businessName}
                      {profile.businessAddress ? `, ${profile.businessAddress}` : ""}
                    </>
                  ) : (
                    "Add your business name and address so we know who you are."
                  )}
                  {" "}
                  {profile && !profile.businessName && (
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => navigate("/profile/setup")}>
                      Add details
                    </button>
                  )}
                </p>
              </div>
            </Card>

            <PartnerDocumentsPage partnerType={role} onboarding />
          </>
        )}
      </div>
    </AppFrame>
  );
}
