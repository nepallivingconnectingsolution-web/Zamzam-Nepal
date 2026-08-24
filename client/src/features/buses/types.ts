/** Shared types for the ported bus-booking feature. */

export interface BusSearchResult {
  id: string;
  operator: string;
  from: string;
  to: string;
  date: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  seatsLeft: number;
  type: string;
  amenities: string[];
  busPhoto: string | null;
}

export interface BusScheduleDetail extends BusSearchResult {
  totalSeats: number;
  totalRows: number;
  bookedSeats: string[];
  status: "active" | "cancelled" | "completed";
}

export interface Passenger {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  age: number;
  gender: "male" | "female" | "other";
}

export interface BusTicket {
  id: string;
  bookingRef: string | null;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  bus: {
    operator: string;
    from: string;
    to: string;
    date: string;
    departure: string;
    arrival: string;
    type: string;
  } | null;
  seats: string[];
  passengers: Passenger[];
  totalPrice: number;
  serviceFee: number;
  grandTotal: number;
  method: string | null;
  bookedAt: string;
}

export interface OperatorBus {
  id: string;
  busName: string;
  busNumber: string;
  registrationNo: string;
  type: string;
  fuelType: string;
  totalSeats: number;
  totalRows: number;
  amenities: string[];
  busPhoto: string | null;
  isActive: boolean;
  createdAt: string;
}

export type ScheduleFrequency = "once" | "daily" | "weekly";

/** A recurring (or one-off) route template. Generates dated `OperatorTrip`s. */
export interface OperatorSchedule {
  id: string;
  busId: string;
  fromCity: string;
  toCity: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  status: "active" | "cancelled" | "completed";
  frequency: ScheduleFrequency;
  operatingDays: number[]; // 0=Sun..6=Sat, only meaningful when frequency === "weekly"
  onceDate: string | null; // only meaningful when frequency === "once"
  validFrom: string;
  validUntil: string | null;
  busName: string;
  busType: string;
  totalSeats: number;
  upcomingTrips: number;
}

/** A single dated departure generated from a schedule template — this is what gets booked. */
export interface OperatorTrip {
  id: string;
  scheduleId: string;
  busId: string;
  fromCity: string;
  toCity: string;
  date: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  status: "scheduled" | "cancelled" | "completed";
  seatsLeft: number;
  totalSeats: number;
}

export const WEEKDAYS: { value: number; label: string; short: string }[] = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

export const BUS_TYPES = [
  "AC Deluxe",
  "Non-AC Deluxe",
  "AC Tourist",
  "Non-AC Tourist",
  "Night Coach",
  "Semi-Sleeper",
  "Full-Sleeper",
  "Micro Bus",
  "Sumo/Jeep",
] as const;

export const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "Electric", "Hybrid"] as const;

export const AMENITIES: { id: string; label: string; icon: string }[] = [
  { id: "wifi", label: "WiFi", icon: "Wifi" },
  { id: "ac", label: "AC", icon: "Wind" },
  { id: "charging", label: "USB Charging", icon: "Zap" },
  { id: "tv", label: "TV / Screen", icon: "Monitor" },
  { id: "water", label: "Water", icon: "Droplets" },
  { id: "blanket", label: "Blanket", icon: "Bed" },
  { id: "gps", label: "GPS Tracked", icon: "MapPin" },
  { id: "emergency", label: "Emergency Kit", icon: "Cross" },
];

export const PAYMENT_METHODS: { id: string; label: string }[] = [
  { id: "wallet", label: "Zamzam Wallet" },
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "connectips", label: "ConnectIPS" },
  { id: "imepay", label: "IME Pay" },
  { id: "card", label: "Card" },
  { id: "cash", label: "Cash" },
];

export const NEPAL_CITIES = [
  "Kathmandu",
  "Pokhara",
  "Chitwan (Bharatpur)",
  "Butwal",
  "Bhairahawa (Siddharthanagar)",
  "Biratnagar",
  "Dharan",
  "Itahari",
  "Dhangadhi",
  "Nepalgunj",
  "Birgunj",
  "Hetauda",
  "Janakpur",
  "Baglung",
  "Beni",
  "Tansen",
  "Palpa",
  "Surkhet",
  "Gorkha",
  "Lamjung",
  "Syangja",
];

/** A distinct fromCity → toCity pair, aggregated live from the operator's schedules — see BusesService.operatorRoutes. */
export interface OperatorRoute {
  fromCity: string;
  toCity: string;
  activeSchedules: number;
  buses: string[];
  priceMin: number;
  priceMax: number;
  upcomingDepartures: number;
  ticketsSold: number;
  revenue: number;
}

export interface BusReview {
  id: string;
  ticketId: string;
  operatorId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** A review as seen by the operator, with enough booking context to place it — matches BusesService.operatorReviews. */
export interface PartnerBusReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string;
  bookingRef: string;
  from: string;
  to: string;
  tripDate: string;
}

export interface BusReviewSummary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}

export interface BusRevenueDailyBucket {
  date: string;
  bookings: number;
  seats: number;
  grossRevenue: number;
  platformFee: number;
  netProfit: number;
  cancelled: number;
  refunded: number;
}

export interface BusRevenueSummary {
  todayRevenue: number;
  monthRevenue: number;
  totalRevenue: number;
  totalPlatformFee: number;
  totalRefunded: number;
  netProfit: number;
  totalBookings: number;
  totalCancelled: number;
  avgBookingValue: number;
}

export interface PartnerBusRevenue {
  summary: BusRevenueSummary;
  daily: BusRevenueDailyBucket[];
}

/** Seat IDs: rows × columns A–D, e.g. "1A".."10D". */
export function generateSeats(totalRows: number, bookedSeats: string[] = []) {
  const cols = ["A", "B", "C", "D"];
  const seats: { id: string; row: number; col: string; booked: boolean }[] = [];
  for (let row = 1; row <= totalRows; row++) {
    cols.forEach((col) => {
      const id = `${row}${col}`;
      seats.push({ id, row, col, booked: bookedSeats.includes(id) });
    });
  }
  return seats;
}