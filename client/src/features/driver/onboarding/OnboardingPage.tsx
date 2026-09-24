import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/shared/async-states";
import { useAuthStore } from "@/stores/auth.store";
import { useOnboarding } from "./useOnboarding";
import { StepProgress } from "./StepProgress";
import { ApplicationStatusPage } from "./ApplicationStatusPage";
import { PhoneStep } from "./steps/PhoneStep";
import { PersonalStep } from "./steps/PersonalStep";
import { LicenceStep } from "./steps/LicenceStep";
import { VehicleStep } from "./steps/VehicleStep";
import { DocumentsStep } from "./steps/DocumentsStep";
import { ReviewStep, stepForBlocker } from "./steps/ReviewStep";
import type { ApplicationView } from "./onboarding.types";

/** Resume where the data says the driver left off: the first thing the server still needs. */
export function startStep(view: ApplicationView): number {
  const first = view.blockers[0];
  return first ? stepForBlocker(first.code, first.message) : 5;
}

/**
 * The driver's front door. While the application is a draft it is a six-step
 * wizard (each step saves to the server, so closing the app loses nothing);
 * in every other state it shows where the application stands.
 */
export function OnboardingPage() {
  const ob = useOnboarding();
  const navigate = useNavigate();
  const signOut = useAuthStore((s) => s.signOut);

  const [step, setStep] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const view = ob.view;
  const status = view?.application.status;

  useEffect(() => {
    if (view && step === null) setStep(startStep(view));
  }, [view, step]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step, editing, status]);

  const go = (n: number) => setStep(Math.max(0, Math.min(5, n)));
  const showWizard = !!view && (status === "DRAFT" || editing);

  function continueLater() {
    signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="min-h-screen bg-bg pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-3 px-4">
          <Logo />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={continueLater}>
              <LogOut className="size-4" /> {showWizard ? "Continue later" : "Sign out"}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6">
        {ob.state === "loading" && (
          <div className="space-y-4" role="status" aria-label="Loading your application">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {ob.state === "error" && <ErrorState onRetry={ob.reload} message={ob.error ?? undefined} />}

        {ob.state === "ready" && view && showWizard && step !== null && (
          <div className="space-y-6">
            <StepProgress step={step} onJump={go} />
            {step === 0 && <PhoneStep view={view} sendOtp={ob.sendOtp} verifyOtp={ob.verifyOtp} onNext={() => go(1)} />}
            {step === 1 && <PersonalStep view={view} saveProfile={ob.saveProfile} upload={ob.upload} onBack={() => go(0)} onNext={() => go(2)} />}
            {step === 2 && <LicenceStep view={view} saveProfile={ob.saveProfile} upload={ob.upload} removeUpload={ob.removeUpload} onBack={() => go(1)} onNext={() => go(3)} />}
            {step === 3 && <VehicleStep view={view} saveVehicle={ob.saveVehicle} onBack={() => go(2)} onNext={() => go(4)} />}
            {step === 4 && <DocumentsStep view={view} upload={ob.upload} removeUpload={ob.removeUpload} onBack={() => go(3)} onNext={() => go(5)} />}
            {step === 5 && (
              <ReviewStep
                view={view}
                submit={ob.submit}
                onBack={() => go(4)}
                onEdit={go}
                onSubmitted={() => {
                  setEditing(false);
                  setJustSubmitted(true);
                }}
              />
            )}
          </div>
        )}

        {ob.state === "ready" && view && !showWizard && (
          <ApplicationStatusPage
            ob={ob}
            view={view}
            justSubmitted={justSubmitted}
            onEdit={(toStep) => {
              setEditing(true);
              setStep(toStep ?? startStep(view));
            }}
          />
        )}
      </main>
    </div>
  );
}
