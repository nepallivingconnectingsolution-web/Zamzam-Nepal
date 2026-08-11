import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { PortalLayout } from "@/components/layout/portal-layout";
import { ScaffoldPage } from "@/components/shared/scaffold-page";
import { RequireRole } from "@/components/auth/RequireRole";
import { useAuthStore } from "@/stores/auth.store";
import { ROLE_HOME } from "@/config";

/* ----------------------------------------------------------------------------
   Every routed page is lazy-loaded so a first-time visitor only downloads the
   JS for the portal they actually land on, instead of every role's dashboard
   plus both chart libraries (recharts + apexcharts) and Leaflet up front (see
   PHASE1_AUDIT.md #12). Only structural pieces that always render as part of
   a route's shell — layouts, role guards, the tiny generic ScaffoldPage — stay
   as eager imports above.

   Each Suspense boundary lives inside the relevant shell (PortalLayout's
   sidebar/topbar, CustomerShell, DriverShell, SuperAdminLayout — see their
   `<Outlet />`), so only the content area swaps while a chunk loads; the
   header/nav never unmounts. App.tsx adds one more top-level boundary for the
   shell-less routes below (landing, auth, super-admin login).
---------------------------------------------------------------------------- */

const AppHome = lazy(() => import("@/features/home/AppHome").then((m) => ({ default: m.AppHome })));
const LandingPage = lazy(() => import("@/features/marketing/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("@/features/auth/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ProfileSetupPage = lazy(() =>
  import("@/features/auth/ProfileSetupPage").then((m) => ({ default: m.ProfileSetupPage })),
);
const NotFound = lazy(() => import("@/features/marketing/NotFound").then((m) => ({ default: m.NotFound })));

const MarketplaceHome = lazy(() =>
  import("@/features/customer/MarketplaceHome").then((m) => ({ default: m.MarketplaceHome })),
);
const ServiceBookingPage = lazy(() =>
  import("@/features/customer/marketplace/ServiceBookingPage").then((m) => ({ default: m.ServiceBookingPage })),
);
const MyTripsPage = lazy(() =>
  import("@/features/customer/marketplace/MyTripsPage").then((m) => ({ default: m.MyTripsPage })),
);
const FreightBookingPage = lazy(() =>
  import("@/features/customer/marketplace/FreightBookingPage").then((m) => ({ default: m.FreightBookingPage })),
);
const FreightLoadMarket = lazy(() =>
  import("@/features/freight/FreightLoadMarket").then((m) => ({ default: m.FreightLoadMarket })),
);
const FreightShipments = lazy(() =>
  import("@/features/freight/FreightShipments").then((m) => ({ default: m.FreightShipments })),
);
const FreightReviewsPage = lazy(() =>
  import("@/features/freight/FreightReviewsPage").then((m) => ({ default: m.FreightReviewsPage })),
);
const FreightRevenuePage = lazy(() =>
  import("@/features/freight/FreightRevenuePage").then((m) => ({ default: m.FreightRevenuePage })),
);
const WalletPage = lazy(() => import("@/features/customer/WalletPage").then((m) => ({ default: m.WalletPage })));
const TransactionsPage = lazy(() =>
  import("@/features/customer/TransactionsPage").then((m) => ({ default: m.TransactionsPage })),
);
const BookingsPage = lazy(() =>
  import("@/features/customer/BookingsPage").then((m) => ({ default: m.BookingsPage })),
);
const SettingsPage = lazy(() =>
  import("@/features/customer/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const SupportPage = lazy(() => import("@/features/customer/SupportPage").then((m) => ({ default: m.SupportPage })));

const BusListPage = lazy(() => import("@/features/buses/BusListPage").then((m) => ({ default: m.BusListPage })));
const BusDetailPage = lazy(() => import("@/features/buses/BusDetailPage").then((m) => ({ default: m.BusDetailPage })));
const BusBookingsPage = lazy(() =>
  import("@/features/buses/BusBookingsPage").then((m) => ({ default: m.BusBookingsPage })),
);
const OperatorBusManager = lazy(() =>
  import("@/features/buses/OperatorBusManager").then((m) => ({ default: m.OperatorBusManager })),
);
const OperatorReviewsPage = lazy(() =>
  import("@/features/buses/OperatorReviewsPage").then((m) => ({ default: m.OperatorReviewsPage })),
);
const OperatorRoutesPage = lazy(() =>
  import("@/features/buses/OperatorRoutesPage").then((m) => ({ default: m.OperatorRoutesPage })),
);
const BusRevenuePage = lazy(() =>
  import("@/features/buses/BusRevenuePage").then((m) => ({ default: m.BusRevenuePage })),
);

const HotelListPage = lazy(() => import("@/features/hotels/HotelListPage").then((m) => ({ default: m.HotelListPage })));
const HotelDetailPage = lazy(() =>
  import("@/features/hotels/HotelDetailPage").then((m) => ({ default: m.HotelDetailPage })),
);
const HotelBookingsPage = lazy(() =>
  import("@/features/hotels/HotelBookingsPage").then((m) => ({ default: m.HotelBookingsPage })),
);
const HotelPartnerManager = lazy(() =>
  import("@/features/hotels/HotelPartnerManager").then((m) => ({ default: m.HotelPartnerManager })),
);
const HotelReviewsPage = lazy(() =>
  import("@/features/hotels/HotelReviewsPage").then((m) => ({ default: m.HotelReviewsPage })),
);
const HotelRevenuePage = lazy(() =>
  import("@/features/hotels/HotelRevenuePage").then((m) => ({ default: m.HotelRevenuePage })),
);

const RestaurantListPage = lazy(() =>
  import("@/features/restaurants/RestaurantListPage").then((m) => ({ default: m.RestaurantListPage })),
);
const RestaurantDetailPage = lazy(() =>
  import("@/features/restaurants/RestaurantDetailPage").then((m) => ({ default: m.RestaurantDetailPage })),
);
const FoodOrdersPage = lazy(() =>
  import("@/features/restaurants/FoodOrdersPage").then((m) => ({ default: m.FoodOrdersPage })),
);
const RestaurantPartnerManager = lazy(() =>
  import("@/features/restaurants/RestaurantPartnerManager").then((m) => ({ default: m.RestaurantPartnerManager })),
);
const RestaurantReviewsPage = lazy(() =>
  import("@/features/restaurants/RestaurantReviewsPage").then((m) => ({ default: m.RestaurantReviewsPage })),
);
const RestaurantRevenuePage = lazy(() =>
  import("@/features/restaurants/RestaurantRevenuePage").then((m) => ({ default: m.RestaurantRevenuePage })),
);

const GroceryListPage = lazy(() =>
  import("@/features/grocery/GroceryListPage").then((m) => ({ default: m.GroceryListPage })),
);
const GroceryDetailPage = lazy(() =>
  import("@/features/grocery/GroceryDetailPage").then((m) => ({ default: m.GroceryDetailPage })),
);
const GroceryOrdersPage = lazy(() =>
  import("@/features/grocery/GroceryOrdersPage").then((m) => ({ default: m.GroceryOrdersPage })),
);
const GroceryPartnerManager = lazy(() =>
  import("@/features/grocery/GroceryPartnerManager").then((m) => ({ default: m.GroceryPartnerManager })),
);
const GroceryReviewsPage = lazy(() =>
  import("@/features/grocery/GroceryReviewsPage").then((m) => ({ default: m.GroceryReviewsPage })),
);
const GroceryRevenuePage = lazy(() =>
  import("@/features/grocery/GroceryRevenuePage").then((m) => ({ default: m.GroceryRevenuePage })),
);

const DriverDashboard = lazy(() =>
  import("@/features/driver/DriverDashboard").then((m) => ({ default: m.DriverDashboard })),
);
const VehiclePage = lazy(() => import("@/features/driver/VehiclePage").then((m) => ({ default: m.VehiclePage })));
const DriverDocumentsPage = lazy(() =>
  import("@/features/driver/DriverDocumentsPage").then((m) => ({ default: m.DriverDocumentsPage })),
);
const DriverPortalProvider = lazy(() =>
  import("@/features/driver/driver-portal.context").then((m) => ({ default: m.DriverPortalProvider })),
);
const RideRequestsPage = lazy(() =>
  import("@/features/driver/RideRequestsPage").then((m) => ({ default: m.RideRequestsPage })),
);
const CurrentTripPage = lazy(() =>
  import("@/features/driver/CurrentTripPage").then((m) => ({ default: m.CurrentTripPage })),
);
const DriverEarningsPage = lazy(() =>
  import("@/features/driver/DriverEarningsPage").then((m) => ({ default: m.DriverEarningsPage })),
);
const DriverRatingsPage = lazy(() =>
  import("@/features/driver/DriverRatingsPage").then((m) => ({ default: m.DriverRatingsPage })),
);
const DriverWalletPage = lazy(() =>
  import("@/features/driver/DriverWalletPage").then((m) => ({ default: m.DriverWalletPage })),
);
const AdminOverview = lazy(() => import("@/features/admin/AdminOverview").then((m) => ({ default: m.AdminOverview })));
const PartnerDashboard = lazy(() =>
  import("@/features/partner/PartnerDashboard").then((m) => ({ default: m.PartnerDashboard })),
);
const PartnerDocumentsPage = lazy(() =>
  import("@/features/partner/PartnerDocumentsPage").then((m) => ({ default: m.PartnerDocumentsPage })),
);

const SuperAdminLoginPage = lazy(() =>
  import("@/features/super-admin/SuperAdminLoginPage").then((m) => ({ default: m.SuperAdminLoginPage })),
);
const SuperAdminGuard = lazy(() =>
  import("@/features/super-admin/SuperAdminGuard").then((m) => ({ default: m.SuperAdminGuard })),
);
const SuperAdminLayout = lazy(() =>
  import("@/features/super-admin/SuperAdminLayout").then((m) => ({ default: m.SuperAdminLayout })),
);
const SuperAdminOverview = lazy(() =>
  import("@/features/super-admin/SuperAdminOverview").then((m) => ({ default: m.SuperAdminOverview })),
);
const SuperAdminUsers = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminUsers").then((m) => ({ default: m.SuperAdminUsers })),
);
const SuperAdminApprovals = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminApprovals").then((m) => ({ default: m.SuperAdminApprovals })),
);
const SuperAdminVehicles = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminVehicles").then((m) => ({ default: m.SuperAdminVehicles })),
);
const SuperAdminPartnerDocuments = lazy(() =>
  import("../features/super-admin/pages/SuperAdminPartnerDocuments").then((m) => ({
    default: m.SuperAdminPartnerDocuments,
  })),
);
const SuperAdminRegistrationReview = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminRegReview").then((m) => ({
    default: m.SuperAdminRegistrationReview,
  })),
);
const SuperAdminPartners = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminPartners").then((m) => ({ default: m.SuperAdminPartners })),
);
const SuperAdminPartnerDetail = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminPartnerDetail").then((m) => ({
    default: m.SuperAdminPartnerDetail,
  })),
);
const SuperAdminRevenue = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminRevenue").then((m) => ({ default: m.SuperAdminRevenue })),
);
const SuperAdminSettings = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminSettings").then((m) => ({ default: m.SuperAdminSettings })),
);
const SuperAdminNotifications = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminNotifications").then((m) => ({
    default: m.SuperAdminNotifications,
  })),
);
const SuperAdminDisputes = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminDisputes").then((m) => ({ default: m.SuperAdminDisputes })),
);
const SuperAdminTransactions = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminTransactions").then((m) => ({
    default: m.SuperAdminTransactions,
  })),
);
const SuperAdminWallet = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminWallet").then((m) => ({ default: m.SuperAdminWallet })),
);
const SuperAdminRides = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminRides").then((m) => ({ default: m.SuperAdminRides })),
);
const SuperAdminHeatmap = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminHeatmap").then((m) => ({ default: m.SuperAdminHeatmap })),
);
const SuperAdminAudit = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminAudit").then((m) => ({ default: m.SuperAdminAudit })),
);
const SuperAdminRoles = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminRoles").then((m) => ({ default: m.SuperAdminRoles })),
);
const SuperAdminReports = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminReports").then((m) => ({ default: m.SuperAdminReports })),
);
const SuperAdminCms = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminCms").then((m) => ({ default: m.SuperAdminCms })),
);
const SuperAdminServices = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminServices").then((m) => ({ default: m.SuperAdminServices })),
);
const SuperAdminFraud = lazy(() =>
  import("@/features/super-admin/pages/SuperAdminFraud").then((m) => ({ default: m.SuperAdminFraud })),
);

/**
 * Entry point, which resolves differently for two kinds of arrival.
 *
 * 1. Already signed in → straight to their own home (customer app, driver hub,
 *    operator console…). Nobody who has an account should be shown a page
 *    trying to sell them the product, on any platform.
 * 2. Signed out → AppHome, the app's front door, on web AND native alike.
 *
 * That used to be a three-way branch: browsers got the marketing landing page
 * and the installed build got /login, because a shopfront selling "Open the
 * app" *inside* the app is absurd. AppHome removes the fork. It leads with the
 * service picker, and its tiles route through /login carrying where you meant
 * to go — so it works as a first impression on the web and as a launcher on a
 * phone, without either audience being shown the wrong thing. The marketing
 * page it replaced is still whole at /about.
 *
 * Reads the persisted auth store directly rather than a hook, because this
 * renders before any provider tree of its own.
 */
function RootEntry() {
  const { isAuthenticated, user } = useAuthStore.getState();
  if (isAuthenticated && user) return <Navigate to={ROLE_HOME[user.role] ?? "/app"} replace />;
  return <AppHome />;
}

export const router = createBrowserRouter([
  // "/" is the app's front door on every platform — see RootEntry.
  // /about is where the marketing site lives now, and stays a permanent route
  // so nav and footer links pointing at it keep resolving for a signed-in
  // user too.
  { path: "/", element: <RootEntry /> },
  { path: "/about", element: <LandingPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/profile/setup", element: <ProfileSetupPage /> },

  /* ── Super Admin (hidden entry) ─────────────────────────────────────── */
  { path: "/x-admin/login", element: <SuperAdminLoginPage /> },
  {
    path: "/x-admin",
    element: <SuperAdminGuard />,
    children: [
      {
        element: <SuperAdminLayout />,
        children: [
          { index: true, element: <SuperAdminOverview /> },
          { path: "users", element: <SuperAdminUsers /> },
          { path: "approvals", element: <SuperAdminApprovals /> },
          { path: "registrations/:id", element: <SuperAdminRegistrationReview /> },
          { path: "drivers", element: <SuperAdminVehicles /> },
          { path: "partners", element: <SuperAdminPartners /> },
          { path: "partners/:id", element: <SuperAdminPartnerDetail /> },
          { path: "partner-documents", element: <SuperAdminPartnerDocuments /> },
          { path: "wallet", element: <SuperAdminWallet /> },
          { path: "transactions", element: <SuperAdminTransactions /> },
          { path: "rides", element: <SuperAdminRides /> },
          { path: "services", element: <SuperAdminServices /> },
          { path: "disputes", element: <SuperAdminDisputes /> },
          { path: "revenue", element: <SuperAdminRevenue /> },
          { path: "ai", element: <SuperAdminFraud /> },
          { path: "heatmap", element: <SuperAdminHeatmap /> },
          { path: "cms", element: <SuperAdminCms /> },
          { path: "roles", element: <SuperAdminRoles /> },
          { path: "audit", element: <SuperAdminAudit /> },
          { path: "reports", element: <SuperAdminReports /> },
          { path: "settings", element: <SuperAdminSettings /> },
          { path: "notifications", element: <SuperAdminNotifications /> },
        ],
      },
    ],
  },

  /* ── Customer ───────────────────────────────────────────────────────── */
  {
    path: "/app",
    element: <RequireRole role="customer" />,
    children: [
      {
        element: <PortalLayout role="customer" />,
        children: [
          { index: true, element: <MarketplaceHome /> },
          { path: "book/freight", element: <FreightBookingPage /> },
          { path: "book/:service", element: <ServiceBookingPage /> },
          { path: "buses", element: <BusListPage /> },
          { path: "buses/tickets", element: <BusBookingsPage /> },
          { path: "buses/:scheduleId", element: <BusDetailPage /> },
          { path: "hotels", element: <HotelListPage /> },
          { path: "hotels/bookings", element: <HotelBookingsPage /> },
          { path: "hotels/:id", element: <HotelDetailPage /> },
          { path: "restaurants", element: <RestaurantListPage /> },
          { path: "restaurants/orders", element: <FoodOrdersPage /> },
          { path: "restaurants/:id", element: <RestaurantDetailPage /> },
          { path: "grocery", element: <GroceryListPage /> },
          { path: "grocery/orders", element: <GroceryOrdersPage /> },
          { path: "grocery/:id", element: <GroceryDetailPage /> },
          { path: "wallet", element: <WalletPage /> },
          { path: "trips", element: <MyTripsPage /> },
          { path: "bookings", element: <BookingsPage /> },
          { path: "transactions", element: <TransactionsPage /> },
          { path: "support", element: <SupportPage /> },
         { path: "settings", element: <SettingsPage /> },
        ],
      },
    ],
  },

  /* ── Driver ─────────────────────────────────────────────────────────── */
  {
    path: "/driver",
    element: <RequireRole role="driver" />,
    children: [
      {
        element: <PortalLayout role="driver" />,
        children: [
          {
            // Mounted once for the whole driver portal: keeps online status,
            // GPS broadcasting, and incoming-request/current-job polling
            // alive across every driver page, not just the dashboard.
            element: <DriverPortalProvider />,
            children: [
              { index: true, element: <DriverDashboard /> },
              { path: "buses", element: <OperatorBusManager title="Buses" subtitle="Register buses, publish routes and track ticket sales." /> },
              { path: "requests", element: <RideRequestsPage /> },
              { path: "trip", element: <CurrentTripPage /> },
              { path: "earnings", element: <DriverEarningsPage /> },
              { path: "wallet", element: <DriverWalletPage /> },
              { path: "ratings", element: <DriverRatingsPage /> },
             { path: "vehicle", element: <VehiclePage /> },
              { path: "documents", element: <DriverDocumentsPage /> },
            ],
          },
        ],
      },
    ],
  },

  /* ── Bus operator ───────────────────────────────────────────────────── */
  {
    path: "/operator",
    element: <RequireRole role="bus_operator" />,
    children: [
      {
        element: <PortalLayout role="bus_operator" />,
        children: [
          {
            index: true,
            element: (
              <PartnerDashboard
                title="Operator dashboard"
                subtitle="Routes, fleet, ratings and ticket revenue."
                metricsPath="/operator/metrics"
                kpis={[
                  { label: "Seats sold (today)", icon: "Ticket", key: "seatsSoldToday", format: "number" },
                  { label: "Active routes", icon: "Milestone", key: "activeRoutes", format: "number" },
                  { label: "Fleet online", icon: "Bus", key: "fleetOnline", format: "number" },
                  { label: "Avg. rating", icon: "Star", key: "rating", format: "rating" },
                  { label: "Revenue (today)", icon: "TrendingUp", key: "revenueToday", format: "currency" },
                ]}
                chartTitle="Ticket sales"
                chartCaption="Bookings across your routes this week."
              />
            ),
          },
          { path: "routes", element: <OperatorRoutesPage /> },
          // initialTab must be passed on each route: OperatorBusManager
          // defaults to "fleet", so without it all three nav destinations
          // opened on the Fleet tab and only the page title changed — tapping
          // "Schedules" or "Bookings" appeared to do nothing. The hotel/
          // restaurant/grocery managers already did this correctly; the
          // operator routes were the ones missing it.
          { path: "schedules", element: <OperatorBusManager title="Schedules" subtitle="Publish and manage your bus routes." initialTab="schedules" /> },
          { path: "fleet", element: <OperatorBusManager title="Fleet" subtitle="Your registered buses and their schedules." initialTab="fleet" /> },
          { path: "bookings", element: <OperatorBusManager title="Bookings" subtitle="Tickets sold across your routes." initialTab="bookings" /> },
          { path: "reviews", element: <OperatorReviewsPage /> },
          { path: "revenue", element: <BusRevenuePage /> },
          { path: "documents", element: <PartnerDocumentsPage partnerType="bus_operator" /> },
        ],
      },
    ],
  },

  /* ── Freight ────────────────────────────────────────────────────────── */
  {
    path: "/freight",
    element: <RequireRole role="freight" />,
    children: [
      {
        element: <PortalLayout role="freight" />,
        children: [
          {
            index: true,
            element: (
              <PartnerDashboard
                title="Load marketplace"
                subtitle="Open loads, your bids, ratings and live shipments."
                metricsPath="/freight/metrics"
                kpis={[
                  { label: "Open loads", icon: "PackageSearch", key: "openLoads", format: "number" },
                  { label: "Active bids", icon: "Gavel", key: "activeBids", format: "number" },
                  { label: "In transit", icon: "Truck", key: "inTransit", format: "number" },
                  { label: "Avg. rating", icon: "Star", key: "rating", format: "rating" },
                  { label: "Revenue (month)", icon: "TrendingUp", key: "revenueMonth", format: "currency" },
                ]}
                chartTitle="Shipment volume"
                chartCaption="Loads matched and delivered over time."
              />
            ),
          },
          { path: "bids", element: <FreightLoadMarket /> },
          { path: "shipments", element: <FreightShipments /> },
          { path: "reviews", element: <FreightReviewsPage /> },
          { path: "tracking", element: <ScaffoldPage title="Tracking" dataLabel="Live tracking" /> },
          { path: "revenue", element: <FreightRevenuePage /> },
          { path: "documents", element: <PartnerDocumentsPage partnerType="freight" /> },
        ],
      },
    ],
  },

  /* ── Hotel ──────────────────────────────────────────────────────────── */
  {
    path: "/hotel",
    element: <RequireRole role="hotel" />,
    children: [
      {
        element: <PortalLayout role="hotel" />,
        children: [
          {
            index: true,
            element: (
              <PartnerDashboard
                title="Hotel dashboard"
                subtitle="Bookings, occupancy and reviews."
                metricsPath="/hotel/metrics"
                kpis={[
                  { label: "Bookings (today)", icon: "CalendarCheck", key: "bookingsToday", format: "number" },
                  { label: "Occupancy", icon: "BedDouble", key: "occupancy", format: "percent" },
                  { label: "Avg. rating", icon: "Star", key: "rating", format: "rating" },
                  { label: "Revenue (month)", icon: "TrendingUp", key: "revenueMonth", format: "currency" },
                ]}
                chartTitle="Occupancy & revenue"
                chartCaption="Rooms booked across the season."
              />
            ),
          },
          {
            path: "properties",
            element: (
              <HotelPartnerManager
                title="Properties"
                subtitle="List your properties and manage rooms."
                initialTab="properties"
              />
            ),
          },
          {
            path: "bookings",
            element: (
              <HotelPartnerManager
                title="Bookings"
                subtitle="Every room booked across your properties."
                initialTab="bookings"
              />
            ),
          },
          { path: "reviews", element: <HotelReviewsPage /> },
          { path: "revenue", element: <HotelRevenuePage /> },
          { path: "documents", element: <PartnerDocumentsPage partnerType="hotel" /> },
        ],
      },
    ],
  },

  /* ── Restaurant ─────────────────────────────────────────────────────── */
  {
    path: "/restaurant",
    element: <RequireRole role="restaurant" />,
    children: [
      {
        element: <PortalLayout role="restaurant" />,
        children: [
          {
            index: true,
            element: (
              <PartnerDashboard
                title="Restaurant dashboard"
                subtitle="Live orders, ratings and revenue."
                metricsPath="/restaurant/metrics"
                kpis={[
                  { label: "Orders (today)", icon: "ClipboardList", key: "ordersToday", format: "number" },
                  { label: "Pending orders", icon: "BellRing", key: "pendingOrders", format: "number" },
                  { label: "Avg. rating", icon: "Star", key: "rating", format: "rating" },
                  { label: "Revenue (month)", icon: "TrendingUp", key: "revenueMonth", format: "currency" },
                ]}
                chartTitle="Orders & revenue"
                chartCaption="Orders across your restaurants this week."
              />
            ),
          },
          {
            path: "menu",
            element: (
              <RestaurantPartnerManager
                title="Restaurants & menu"
                subtitle="Manage your restaurants, categories and dishes."
                initialTab="restaurants"
              />
            ),
          },
          {
            path: "orders",
            element: (
              <RestaurantPartnerManager
                title="Orders"
                subtitle="Live incoming orders — accept, prepare and hand over."
                initialTab="orders"
              />
            ),
          },
          { path: "reviews", element: <RestaurantReviewsPage /> },
          { path: "revenue", element: <RestaurantRevenuePage /> },
          { path: "documents", element: <PartnerDocumentsPage partnerType="restaurant" /> },
        ],
      },
    ],
  },

  /* ── Grocery ────────────────────────────────────────────────────────── */
  {
    path: "/grocery",
    element: <RequireRole role="grocery" />,
    children: [
      {
        element: <PortalLayout role="grocery" />,
        children: [
          {
            index: true,
            element: (
              <PartnerDashboard
                title="Grocery dashboard"
                subtitle="Live orders, ratings and revenue."
                metricsPath="/grocery/metrics"
                kpis={[
                  { label: "Orders (today)", icon: "ClipboardList", key: "ordersToday", format: "number" },
                  { label: "Pending orders", icon: "BellRing", key: "pendingOrders", format: "number" },
                  { label: "Avg. rating", icon: "Star", key: "rating", format: "rating" },
                  { label: "Revenue (month)", icon: "TrendingUp", key: "revenueMonth", format: "currency" },
                ]}
                chartTitle="Orders & revenue"
                chartCaption="Orders across your stores this week."
              />
            ),
          },
          {
            path: "catalog",
            element: (
              <GroceryPartnerManager
                title="Stores & catalog"
                subtitle="Manage your stores, categories and products."
                initialTab="stores"
              />
            ),
          },
          {
            path: "orders",
            element: (
              <GroceryPartnerManager
                title="Orders"
                subtitle="Live incoming orders — confirm, pack and dispatch."
                initialTab="orders"
              />
            ),
          },
        { path: "reviews", element: <GroceryReviewsPage /> },
          { path: "revenue", element: <GroceryRevenuePage /> },
          { path: "documents", element: <PartnerDocumentsPage partnerType="grocery" /> },
        ],
      },
    ],
  },

  /* ── Admin ──────────────────────────────────────────────────────────── */
  {
    path: "/admin",
    element: <RequireRole role="admin" />,
    children: [
      {
        element: <PortalLayout role="admin" />,
        children: [
          { index: true, element: <AdminOverview /> },
          { path: "users", element: <ScaffoldPage title="Users" subtitle="All accounts across the ecosystem." dataLabel="Users" /> },
          { path: "drivers", element: <ScaffoldPage title="Drivers" subtitle="Driver compliance and standing." dataLabel="Drivers" /> },
          { path: "partners", element: <ScaffoldPage title="Partners" subtitle="Hotels, operators and freight companies." dataLabel="Partners" /> },
          { path: "wallet", element: <ScaffoldPage title="Wallet & ledger" subtitle="Platform balances and settlements." dataLabel="Ledger" /> },
          { path: "transactions", element: <ScaffoldPage title="Transactions" dataLabel="Transactions" /> },
          { path: "disputes", element: <ScaffoldPage title="Disputes" subtitle="Open cases needing resolution." dataLabel="Disputes" /> },
          { path: "ai", element: <ScaffoldPage title="AI & fraud" subtitle="Model health and fraud signals." dataLabel="AI monitoring" /> },
          { path: "heatmap", element: <ScaffoldPage title="Demand heatmap" subtitle="Live ride density across the valley." dataLabel="Demand data" /> },
          { path: "revenue", element: <ScaffoldPage title="Revenue analytics" dataLabel="Revenue" /> },
          { path: "cms", element: <ScaffoldPage title="CMS" subtitle="Services, banners, promotions, pricing rules." dataLabel="CMS content" /> },
          { path: "roles", element: <ScaffoldPage title="Roles & permissions" dataLabel="Roles" /> },
          { path: "audit", element: <ScaffoldPage title="Audit log" dataLabel="Audit events" /> },
          { path: "settings", element: <ScaffoldPage title="System settings" dataLabel="Settings" /> },
        ],
      },
    ],
  },

  { path: "/404", element: <NotFound /> },
  { path: "*", element: <Navigate to="/404" replace /> },
]);
