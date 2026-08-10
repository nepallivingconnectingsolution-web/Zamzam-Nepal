import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Real, interactive map surface built on Leaflet + free CARTO dark tiles —
 * no Mapbox/Google API key required. Replaces the static "Live map" preview
 * card across the customer marketplace and driver portal.
 *
 * Markers are kept in a ref map keyed by id and updated in place
 * (`marker.setLatLng`) instead of being torn down and recreated on every
 * poll — this is what makes a driver's dot glide across the map every few
 * seconds instead of flickering. The map only re-fits its bounds when the
 * *set* of marker ids changes (e.g. a driver gets assigned), not on every
 * position update, so it doesn't yank the view while someone's looking at it.
 */

export type LiveMapMarkerVariant = "pickup" | "drop" | "driver" | "you" | "nearby";

export interface LiveMapMarker {
  /** Stable id — reuse the same id across polls so the marker glides. */
  id: string;
  lat: number;
  lng: number;
  variant: LiveMapMarkerVariant;
  label?: string;
}

interface LiveMapProps {  
  markers: LiveMapMarker[];
  /** Optional straight route line, as [lat, lng] pairs. */
  route?: [number, number][];
  className?: string;
  /** Fallback center used only when there are no markers yet (defaults to Kathmandu). */
  fallbackCenter?: [number, number];
}

// Colors here are literal (not CSS-var surface tokens) on purpose: the
// CARTO dark basemap never changes with the app's light/dark toggle, so
// markers need fixed brand hex values rather than theme-reactive ones —
// success/danger/accent already compile to fixed hex in tailwind.config.ts,
// so bg-success/bg-danger/bg-accent are safe to use as-is here.
const ICON_HTML: Record<LiveMapMarkerVariant, string> = {
  pickup: `
    <span class="relative grid size-6 place-items-center">
      <span class="absolute size-6 animate-pulse-ring rounded-full bg-success/30"></span>
      <span class="grid size-3.5 place-items-center rounded-full bg-success ring-2 ring-white/85 shadow"></span>
    </span>`,
  drop: `
    <span class="grid size-6 place-items-center">
      <span class="size-3.5 rotate-45 rounded-sm bg-danger ring-2 ring-white/85 shadow"></span>
    </span>`,
  driver: `
    <span class="relative grid size-8 place-items-center">
      <span class="absolute size-8 animate-pulse-ring rounded-full bg-accent/35"></span>
      <span class="grid size-6 place-items-center rounded-full bg-accent text-[12px] text-accent-fg shadow-lg ring-2 ring-white/70">🚘</span>
    </span>`,
  you: `
    <span class="relative grid size-8 place-items-center">
      <span class="absolute size-8 animate-pulse-ring rounded-full bg-brand-600/35"></span>
      <span class="grid size-6 place-items-center rounded-full bg-brand-700 text-[12px] text-white shadow-lg ring-2 ring-white/70">➤</span>
    </span>`,
  nearby: `
    <span class="grid size-5 place-items-center rounded-full bg-[#8C8074]/90 ring-2 ring-white/70 shadow"></span>`,
};

const ICON_SIZE: Record<LiveMapMarkerVariant, number> = {
  pickup: 24,
  drop: 24,
  driver: 32,
  you: 32,
  nearby: 20,
};

function iconFor(variant: LiveMapMarkerVariant) {
  const size = ICON_SIZE[variant];
  return L.divIcon({
    html: ICON_HTML[variant],
    className: "", // clear Leaflet's default marker box/shadow classes
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const KATHMANDU: [number, number] = [27.7172, 85.324];

export function LiveMap({ markers, route, className, fallbackCenter }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<globalThis.Map<string, L.Marker>>(new globalThis.Map());
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const idsKeyRef = useRef<string>("");

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = markers[0] ? ([markers[0].lat, markers[0].lng] as [number, number]) : (fallbackCenter ?? KATHMANDU);
    const map = L.map(containerRef.current, {
      center: start,
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    mapRef.current = map;

    // Layout can settle a frame after mount (grid/flex parents) — without
    // this, Leaflet sometimes measures a 0-height container and renders a
    // blank tile grid until the next manual pan/zoom.
    const raf = requestAnimationFrame(() => map.invalidateSize());
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current.clear();
      routeLayerRef.current = null;
      idsKeyRef.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers in place; only re-fit bounds when the id set changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = markerLayerRef.current;
    const nextIds = new Set(markers.map((m) => m.id));

    for (const [id, marker] of layer) {
      if (!nextIds.has(id)) {
        marker.remove();
        layer.delete(id);
      }
    }

    for (const m of markers) {
      const existing = layer.get(m.id);
      if (existing) {
        existing.setLatLng([m.lat, m.lng]);
      } else {
        const marker = L.marker([m.lat, m.lng], { icon: iconFor(m.variant) }).addTo(map);
        if (m.label) marker.bindTooltip(m.label, { direction: "top", offset: [0, -16] });
        layer.set(m.id, marker);
      }
    }

    const idsKey = [...nextIds].sort().join("|");
    if (markers.length > 0 && idsKey !== idsKeyRef.current) {
      idsKeyRef.current = idsKey;
      if (markers.length === 1) {
        map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), 14));
      } else {
        const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15 });
      }
    }
  }, [markers]);

  // Route line.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }
    if (route && route.length >= 2) {
      routeLayerRef.current = L.polyline(route, {
        color: "#E2952B", // brand marigold (accent.500) — matches the driver marker
        weight: 3,
        opacity: 0.85,
        dashArray: "6 8",
      }).addTo(map);
    }
  }, [route]);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}