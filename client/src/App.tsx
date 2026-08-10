import { Suspense, useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/routes";
import { Toaster } from "@/components/ui/toaster";
import { RouteFallback } from "@/components/shared/route-fallback";
import { adjustMarginsForEdgeToEdge } from "@/lib/native/safeArea";
import { setStatusBarTheme } from "@/lib/native/statusBar";
import { useUiStore } from "@/stores/ui.store";

export default function App() {
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    void adjustMarginsForEdgeToEdge();
  }, []);

  // Default status bar content follows the app's light/dark theme. Screens
  // with a full-bleed surface that doesn't match the ambient theme (a dark
  // petrol hero on an otherwise light screen, say) can call
  // setStatusBarTheme() themselves to override for as long as they're
  // mounted — see lib/native/statusBar.ts.
  useEffect(() => {
    void setStatusBarTheme(theme === "dark" ? "light-content" : "dark-content");
  }, [theme]);

  return (
    <>
      <Suspense fallback={<RouteFallback fullScreen />}>
        <RouterProvider router={router} />
      </Suspense>
      <Toaster />
    </>
  );
}
