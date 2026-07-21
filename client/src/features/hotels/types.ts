export interface HotelSearchResult {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  amenities: string[];
  photos: string[];
  fromPrice: number | null;
  operator: string;
}

export interface RoomTypeSummary {
  id: string;
  name: string;
  description: string | null;
  pricePerNight: number;
  totalRooms: number;
  maxGuests: number;
  amenities: string[];
}

export interface HotelDetail {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  amenities: string[];
  photos: string[];
  checkInTime: string;
  checkOutTime: string;
  operator: string;
  roomTypes: RoomTypeSummary[];
}

export interface RoomAvailability {
  available: number;
  totalRooms: number;
  nights: number;
  pricePerNight: number;
  totalPrice: number;
}

/** The account that made the booking — may differ from the guestName/guestPhone actually staying. */
export interface BookingAccount {
  name: string;
  email: string;
  mobile: string;
  kycStatus: string;
}

export interface HotelBooking {
  id: string;
  bookingRef: string;
  status: "CONFIRMED" | "CANCELLED";
  hotel: { hotelName: string; city: string; roomTypeName: string; pricePerNight: string };
  hotelId: string;
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCount: number;
  guests: number;
  guestName: string;
  guestPhone: string;
  pricePerNight: number;
  totalPrice: number;
  serviceFee: number;
  grandTotal: number;
  method: string | null;
  bookedAt: string;
  account: BookingAccount | null;
}

/** Full detail view for a single booking, including room type info. */
export interface HotelBookingDetail extends HotelBooking {
  roomType: {
    id: string;
    name: string;
    description: string | null;
    maxGuests: number;
    amenities: string[];
  } | null;
}

/** Partner-side: a hotel the partner owns. */
export interface PartnerHotel {
  id: string;
  partnerId: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  amenities: string[];
  photos: string[];
  checkInTime: string;
  checkOutTime: string;
  isActive: boolean;
  createdAt: string;
}

/** Partner-side: a room type belonging to one of the partner's hotels. */
export interface PartnerRoomType {
  id: string;
  hotelId: string;
  name: string;
  description: string | null;
  pricePerNight: number;
  totalRooms: number;
  maxGuests: number;
  amenities: string[];
  isActive: boolean;
  createdAt: string;
}

export const COMMON_HOTEL_AMENITIES = [
  "Free WiFi",
  "Breakfast included",
  "Parking",
  "Hot water",
  "Room service",
  "Mountain view",
  "Restaurant",
  "Airport pickup",
] as const;


/** Guest-side: the review a customer left (or can leave) for one of their own bookings. */
export interface HotelReview {
  id: string;
  bookingId: string;
  hotelId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

/** Partner-side: one review left on any of the partner's hotels, with guest + stay context. */
export interface PartnerReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  guestName: string;
  bookingRef: string;
  hotelName: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}

export interface RevenueDailyBucket {
  date: string;
  bookings: number;
  grossRevenue: number;
  platformFee: number;
  netProfit: number;
  cancelled: number;
  refunded: number;
}

export interface RevenueSummary {
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

export interface PartnerRevenue {
  summary: RevenueSummary;
  daily: RevenueDailyBucket[];
}