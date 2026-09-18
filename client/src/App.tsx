import { Suspense, useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";
import { Toaster } from "@/components/ui/toaster";
import { RouteFallback } from "@/components/shared/route-fallback";
import { SplashScreen } from "@/components/layout/splash-screen";
import { adjustMarginsForEdgeToEdge } from "@/lib/native/safeArea";
import { setStatusBarTheme } from "@/lib/native/statusBar";
import { useUiStore } from "@/stores/ui.store";

export default function App() {
  const theme = useUiStore((s) => s.theme);
  // The cold-start launch animation. The router mounts underneath it right
  // away, so the home screen is fully rendered by the time the splash lifts.
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void adjustMarginsForEdgeToEdge();
  }, []);

  // Default status bar content follows the app's light/dark theme. Screens
  // with a full-bleed surface that doesn't match the ambient theme (a dark
  // petrol hero on an otherwise light screen, say) can call
  // setStatusBarTheme() themselves to override for as long as they're
  // mounted — see lib/native/statusBar.ts. While the deep-teal splash is up,
  // force light status-bar icons for contrast, then revert to the theme.
  useEffect(() => {
    if (booting) {
      void setStatusBarTheme("light-content");
      return;
    }
    void setStatusBarTheme(theme === "dark" ? "light-content" : "dark-content");
  }, [theme, booting]);

  return (
    <>
      <Suspense fallback={<RouteFallback fullScreen />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
      {booting && <SplashScreen onDone={() => setBooting(false)} />}
    </>
  );
}
