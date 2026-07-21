import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div className="max-w-md">
        <Logo className="justify-center" />
        <p className="mt-8 font-display text-6xl font-extrabold tracking-tight text-accent">404</p>
        <h1 className="mt-2 font-display text-2xl font-bold">This route went off the map</h1>
        <p className="mt-2 text-muted-fg">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="accent" onClick={() => navigate("/")}>
            Back home
          </Button>
          <Button variant="outline" onClick={() => navigate("/app")}>
            Open the app
          </Button>
        </div>
      </div>
    </div>
  );
}
