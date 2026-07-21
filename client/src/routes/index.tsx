import { createBrowserRouter, Navigate } from "react-router-dom";
import { PortalLayout } from "@/components/layout/portal-layout";
import { ScaffoldPage } from "@/components/shared/scaffold-page";
import { SuperAdminCms } from "@/features/super-admin/pages/SuperAdminCms";
import { SuperAdminServices } from "@/features/super-admin/pages/SuperAdminServices";
import { SuperAdminFraud } from "@/features/super-admin/pages/SuperAdminFraud";

import { LandingPage } from "@/features/marketing/LandingPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ProfileSetupPage } from "@/features/auth/ProfileSetupPage";
import { NotFound } from "@/features/marketing/NotFound";

import { MarketplaceHome } from "@/features/customer/MarketplaceHome";
import { ServiceBookingPage } from "@/features/customer/marketplace/ServiceBookingPage";
import { MyTripsPage } from "@/features/customer/marketplace/MyTripsPage";
import { FreightBookingPage } from "@/features/customer/marketplace/FreightBookingPage";
import { FreightLoadMarket } from "@/features/freight/FreightLoadMarket";
import { FreightShipments } from "@/features/freight/FreightShipments";
import { FreightReviewsPage } from "@/features/freight/FreightReviewsPage";
import { FreightRevenuePage } from "@/features/freight/FreightRevenuePage";
import { WalletPage } from "@/features/customer/WalletPage";
import { TransactionsPage } from "@/features/customer/TransactionsPage";
import { BookingsPage } from "@/features/customer/BookingsPage";
import { SettingsPage } from "@/features/customer/SettingsPage";
import { SupportPage } from "@/features/customer/SupportPage";

import { BusListPage } from "@/features/buses/BusListPage";
import { BusDetailPage } from "@/features/buses/BusDetailPage";
import { BusBookingsPage } from "@/features/buses/BusBookingsPage";
import { OperatorBusManager } from "@/features/buses/OperatorBusManager";
import { OperatorReviewsPage } from "@/features/buses/OperatorReviewsPage";
import { OperatorRoutesPage } from "@/features/buses/OperatorRoutesPage";
import { BusRevenuePage } from "@/features/buses/BusRevenuePage";
import { RequireRole } from "@/components/auth/RequireRole";

import { HotelListPage } from "@/features/hotels/HotelListPage";
import { HotelDetailPage } from "@/features/hotels/HotelDetailPage";
import { HotelBookingsPage } from "@/features/hotels/HotelBookingsPage";
import { HotelPartnerManager } from "@/features/hotels/HotelPartnerManager";
import { HotelReviewsPage } from "@/features/hotels/HotelReviewsPage";
import { HotelRevenuePage } from "@/features/hotels/HotelRevenuePage";

import { RestaurantListPage } from "@/features/restaurants/RestaurantListPage";
import { RestaurantDetailPage } from "@/features/restaurants/RestaurantDetailPage";
import { FoodOrdersPage } from "@/features/restaurants/FoodOrdersPage";
import { RestaurantPartnerManager } from "@/features/restaurants/RestaurantPartnerManager";
import { RestaurantReviewsPage } from "@/features/restaurants/RestaurantReviewsPage";
import { RestaurantRevenuePage } from "@/features/restaurants/RestaurantRevenuePage";

import { GroceryListPage } from "@/features/grocery/GroceryListPage";
import { GroceryDetailPage } from "@/features/grocery/GroceryDetailPage";
import { GroceryOrdersPage } from "@/features/grocery/GroceryOrdersPage";
import { GroceryPartnerManager } from "@/features/grocery/GroceryPartnerManager";
import { GroceryReviewsPage } from "@/features/grocery/GroceryReviewsPage";
import { GroceryRevenuePage } from "@/features/grocery/GroceryRevenuePage";

import { DriverDashboard } from "@/features/driver/DriverDashboard";
import { VehiclePage } from "@/features/driver/VehiclePage";
import { DriverDocumentsPage } from "@/features/driver/DriverDocumentsPage";
import { DriverPortalProvider } from "@/features/driver/driver-portal.context";
import { RideRequestsPage } from "@/features/driver/RideRequestsPage";
import { CurrentTripPage } from "@/features/driver/CurrentTripPage";
import { DriverEarningsPage } from "@/features/driver/DriverEarningsPage";
import { DriverRatingsPage } from "@/features/driver/DriverRatingsPage";
import { DriverWalletPage } from "@/features/driver/DriverWalletPage";
import { AdminOverview } from "@/features/admin/AdminOverview";
import { PartnerDashboard } from "@/features/partner/PartnerDashboard";

import { SuperAdminLoginPage } from "@/features/super-admin/SuperAdminLoginPage";
import { SuperAdminGuard } from "@/features/super-admin/SuperAdminGuard";
import { SuperAdminLayout } from "@/features/super-admin/SuperAdminLayout";
import { SuperAdminOverview } from "@/features/super-admin/SuperAdminOverview";
import { SuperAdminUsers } from "@/features/super-admin/pages/SuperAdminUsers";
import { SuperAdminApprovals } from "@/features/super-admin/pages/SuperAdminApprovals";
import { SuperAdminVehicles } from "@/features/super-admin/pages/SuperAdminVehicles";
import { SuperAdminRegistrationReview } from "@/features/super-admin/pages/SuperAdminRegReview";
import { SuperAdminPartners } from "@/features/super-admin/pages/SuperAdminPartners";
import { SuperAdminPartnerDetail } from "@/features/super-admin/pages/SuperAdminPartnerDetail";
import { SuperAdminRevenue } from "@/features/super-admin/pages/SuperAdminRevenue";
import { SuperAdminSettings } from "@/features/super-admin/pages/SuperAdminSettings";
import { SuperAdminNotifications } from "@/features/super-admin/pages/SuperAdminNotifications";
import { SuperAdminDisputes } from "@/features/super-admin/pages/SuperAdminDisputes";
import { SuperAdminTransactions } from "@/features/super-admin/pages/SuperAdminTransactions";
import { SuperAdminWallet } from "@/features/super-admin/pages/SuperAdminWallet";
import { SuperAdminRides } from "@/features/super-admin/pages/SuperAdminRides";
import { SuperAdminHeatmap } from "@/features/super-admin/pages/SuperAdminHeatmap";
import { SuperAdminAudit } from "@/features/super-admin/pages/SuperAdminAudit";
import { SuperAdminRoles } from "@/features/super-admin/pages/SuperAdminRoles";
import { SuperAdminReports } from "@/features/super-admin/pages/SuperAdminReports";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
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
          { path: "schedules", element: <OperatorBusManager title="Schedules" subtitle="Publish and manage your bus routes." /> },
          { path: "fleet", element: <OperatorBusManager title="Fleet" subtitle="Your registered buses and their schedules." /> },
          { path: "bookings", element: <OperatorBusManager title="Bookings" subtitle="Tickets sold across your routes." /> },
          { path: "reviews", element: <OperatorReviewsPage /> },
          { path: "revenue", element: <BusRevenuePage /> },
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