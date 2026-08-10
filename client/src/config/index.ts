import type { ServiceVertical, NavItem, Role } from "@/types";
import { icon } from "leaflet";

/**
 * The Zamzam marketplace catalog. This is product configuration — the set of
 * verticals the app offers — NOT business data. Inventory inside each vertical
 * (drivers, listings, prices) comes from the backend at runtime.
 */
export const SERVICES: ServiceVertical[] = [
  { id: "taxi", name: "Taxi", tagline: "On-demand cars, valley-wide", group: "Mobility", icon: "Car", to: "/app/book/taxi", accent: "from-vertical-taxi/15 to-vertical-taxi/0", live: true },
  { id: "bike", name: "Bike", tagline: "Beat the traffic", group: "Mobility", icon: "Bike", to: "/app/book/bike", accent: "from-vertical-bike/15 to-vertical-bike/0", live: true },
  // → /app/buses (the real schedule-search + seat-selection flow), NOT
  //   /app/book/bus. That route is the generic point-to-point ride form,
  //   which for "bus" only renders a "coming soon" dead end — so this tile
  //   used to be the one marketplace tile that led nowhere, and the bus
  //   booking feature was unreachable by tapping anything in the app.
  { id: "bus", name: "Intercity bus", tagline: "Book seats across Nepal", group: "Mobility", icon: "Bus", to: "/app/buses", accent: "from-vertical-bus/15 to-vertical-bus/0", live: true },
  { id: "freight", name: "Freight", tagline: "Post loads, get bids", group: "Logistics", icon: "Truck", to: "/app/book/freight", accent: "from-vertical-freight/15 to-vertical-freight/0", live: true },
  { id: "parcel", name: "Parcel", tagline: "Same-day delivery", group: "Logistics", icon: "Package", to: "/app/book/parcel", accent: "from-vertical-freight/15 to-vertical-freight/0", live: true },
  { id: "hotels", name: "Hotels", tagline: "Stays from trek to city", group: "Tourism", icon: "BedDouble", to: "/app/hotels", accent: "from-vertical-hotel/15 to-vertical-hotel/0", live: true },
  { id: "tours", name: "Tours", tagline: "Guided trips & guides", group: "Tourism", icon: "Mountain", to: "/app/book/tours", accent: "from-vertical-hotel/15 to-vertical-hotel/0", live: true },
  { id: "food", name: "Food", tagline: "Order from local kitchens", group: "Commerce", icon: "UtensilsCrossed", to: "/app/restaurants", accent: "from-vertical-restaurant/15 to-vertical-restaurant/0", live: true },
  { id: "grocery", name: "Grocery", tagline: "Daily essentials", group: "Commerce", icon: "ShoppingBasket", to: "/app/grocery", accent: "from-vertical-grocery/15 to-vertical-grocery/0", live: true },
];

export const SERVICE_GROUPS = ["Mobility", "Logistics", "Tourism", "Commerce"] as const;

/**
 * Roles whose navigation lives in this config. Customer and driver are
 * deliberately absent: they render `CustomerShell` / `DriverShell`, which own
 * their own tab-bar + "More"-sheet navigation, so a nav list here would be
 * read by nothing and silently drift out of sync with what ships.
 *
 * That drift already happened once — this config listed a "Buses" entry long
 * after the customer sidebar was replaced, which made the bus flow look
 * present in config while being unreachable in the running app. The type now
 * makes re-adding them a compile error rather than a silent trap.
 */
export type PortalNavRole = Exclude<Role, "guest" | "customer" | "driver">;

/** Per-portal sidebar navigation, keyed by role. */
export const PORTAL_NAV: Record<PortalNavRole, { title: string; items: NavItem[] }> = {
  bus_operator: {
    title: "Bus operator",
    items: [
      { label: "Dashboard", to: "/operator", icon: "Gauge" },
      { label: "Routes", to: "/operator/routes", icon: "Milestone" },
      { label: "Schedules", to: "/operator/schedules", icon: "CalendarClock" },
      { label: "Fleet", to: "/operator/fleet", icon: "Bus" },
      { label: "Bookings", to: "/operator/bookings", icon: "Ticket" },
      { label: "Reviews", to: "/operator/reviews", icon: "Star" },
      { label: "Revenue", to: "/operator/revenue", icon: "TrendingUp" },
      { label: "Documents", to: "/operator/documents", icon: "FileCheck" },   
    ],
  },
  freight: {
    title: "Freight",
    items: [
     { label: "Dashboard", to: "/freight", icon: "Gauge" },
      { label: "Load market", to: "/freight/bids", icon: "PackageSearch" },
      { label: "Shipments", to: "/freight/shipments", icon: "Truck" },
      { label: "Reviews", to: "/freight/reviews", icon: "Star" },
      { label: "Revenue", to: "/freight/revenue", icon: "TrendingUp" },
      { label: "Documents", to: "/freight/documents", icon: "FileCheck" },
    ],
  },

  restaurant: {
    title: "Restaurant partner",
    items: [
      { label: "Dashboard", to: "/restaurant", icon: "Gauge" },
      { label: "Orders", to: "/restaurant/orders", icon: "ClipboardList" },
      { label: "Restaurants & menu", to: "/restaurant/menu", icon: "UtensilsCrossed" },
      { label: "Reviews", to: "/restaurant/reviews", icon: "Star" },
      { label: "Revenue", to: "/restaurant/revenue", icon: "TrendingUp" },
      { label: "Documents", to: "/restaurant/documents", icon: "FileCheck" }, 
    ],
  },

  grocery: {
    title: "Grocery partner",
    items: [
      { label: "Dashboard", to: "/grocery", icon: "Gauge" },
      { label: "Orders", to: "/grocery/orders", icon: "ClipboardList" },
      { label: "Stores & catalog", to: "/grocery/catalog", icon: "ShoppingBasket" },
      { label: "Reviews", to: "/grocery/reviews", icon: "Star" },
      { label: "Revenue", to: "/grocery/revenue", icon: "TrendingUp" },
      { label: "Documents", to: "/grocery/documents", icon: "FileCheck" }, 
    ],
  },

  hotel: {
    title: "Hotel partner",
    items: [
      { label: "Dashboard", to: "/hotel", icon: "Gauge" },
      { label: "Bookings", to: "/hotel/bookings", icon: "CalendarCheck" },
      { label: "Properties",  to: "/hotel/properties",   icon: "Building2" },
      { label: "Reviews", to: "/hotel/reviews", icon: "Star" },
      { label: "Revenue", to: "/hotel/revenue", icon: "TrendingUp" },
      { label: "Documents", to: "/hotel/documents", icon: "FileCheck" },
    ],
  },
  
  admin: {
    title: "Command center",
    items: [
      { label: "Overview", to: "/admin", icon: "Gauge" },
      { label: "Users", to: "/admin/users", icon: "Users" },
      { label: "Drivers", to: "/admin/drivers", icon: "Car" },
      { label: "Partners", to: "/admin/partners", icon: "Building2" },
      { label: "Wallet & ledger", to: "/admin/wallet", icon: "Wallet" },
      { label: "Transactions", to: "/admin/transactions", icon: "ArrowLeftRight" },
      { label: "Disputes", to: "/admin/disputes", icon: "ShieldAlert" },
      { label: "AI & fraud", to: "/admin/ai", icon: "BrainCircuit" },
      { label: "Demand heatmap", to: "/admin/heatmap", icon: "Map" },
      { label: "Revenue", to: "/admin/revenue", icon: "TrendingUp" },
      { label: "CMS", to: "/admin/cms", icon: "LayoutTemplate" },
      { label: "Roles", to: "/admin/roles", icon: "KeyRound" },
      { label: "Audit log", to: "/admin/audit", icon: "ScrollText" },
      { label: "Settings", to: "/admin/settings", icon: "Settings" },
    ],
  },
};

export const ROLE_HOME: Record<Role, string> = {
  guest: "/login",
  customer: "/app",
  driver: "/driver",
  bus_operator: "/operator",
  freight: "/freight",
  hotel: "/hotel",
  restaurant: "/restaurant",
  grocery: "/grocery",
  admin: "/admin",
};

export const ROLE_LABEL: Record<Exclude<Role, "guest">, string> = {
  customer: "Customer",
  driver: "Driver",
  bus_operator: "Bus operator",
  freight: "Freight partner",
  hotel: "Hotel partner",
  restaurant: "Restaurant partner",
  grocery: "Grocery partner",
  admin: "Administrator",
};