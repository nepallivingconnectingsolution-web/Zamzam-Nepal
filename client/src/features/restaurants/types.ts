export type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type Fulfillment = "delivery" | "pickup";

export interface RestaurantSearchResult {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  cuisine: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  fromPrice: number | null;
  rating: { average: number; count: number } | null;
  operator: string;
}

export interface MenuItemSummary {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  isVeg: boolean;
  spiceLevel: number;
  prepTimeMin: number;
  photo: string | null;
  tags: string[];
}

export interface MenuCategoryGroup {
  id: string;
  name: string;
  items: MenuItemSummary[];
}

export interface RestaurantDetail {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  cuisine: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  categories: MenuCategoryGroup[];
}

export interface OrderAccount {
  name: string;
  email: string;
  mobile: string;
  kycStatus: string;
}

export interface FoodOrderItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  isVeg: boolean;
}

export interface FoodOrder {
  id: string;
  orderRef: string;
  status: OrderStatus;
  fulfillment: Fulfillment;
  restaurant: { restaurantName: string; city: string };
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  note: string | null;
  items: FoodOrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  serviceFee: number;
  grandTotal: number;
  method: string | null;
  placedAt: string;
  updatedAt: string;
  account: OrderAccount | null;
}

/** Partner-side: a restaurant the partner owns. */
export interface PartnerRestaurant {
  id: string;
  partnerId: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  cuisine: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface PartnerMenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface PartnerMenuItem {
  id: string;
  restaurantId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: number;
  isVeg: boolean;
  spiceLevel: number;
  prepTimeMin: number;
  photo: string | null;
  tags: string[];
  isAvailable: boolean;
  createdAt: string;
}

export interface FoodReview {
  id: string;
  orderId: string;
  restaurantId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface PartnerFoodReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  guestName: string;
  orderRef: string;
  restaurantName: string;
  orderedAt: string;
}

export interface FoodReviewSummary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}

export interface FoodRevenueDailyBucket {
  date: string;
  orders: number;
  grossRevenue: number;
  platformFee: number;
  netProfit: number;
  cancelled: number;
  refunded: number;
}

export interface FoodRevenueSummary {
  todayRevenue: number;
  monthRevenue: number;
  totalRevenue: number;
  totalPlatformFee: number;
  totalRefunded: number;
  netProfit: number;
  totalOrders: number;
  totalCancelled: number;
  avgOrderValue: number;
}

export interface PartnerFoodRevenue {
  summary: FoodRevenueSummary;
  daily: FoodRevenueDailyBucket[];
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** The next forward step the kitchen can take for each status. */
export const NEXT_STATUS: Partial<Record<OrderStatus, { delivery: OrderStatus; pickup: OrderStatus }>> = {
  PENDING: { delivery: "ACCEPTED", pickup: "ACCEPTED" },
  ACCEPTED: { delivery: "PREPARING", pickup: "PREPARING" },
  PREPARING: { delivery: "READY", pickup: "READY" },
  READY: { delivery: "OUT_FOR_DELIVERY", pickup: "DELIVERED" },
  OUT_FOR_DELIVERY: { delivery: "DELIVERED", pickup: "DELIVERED" },
};

export const COMMON_CUISINES = [
  "Nepali", "Newari", "Indian", "Chinese", "Italian", "Fast Food", "Momo", "Continental", "Bakery",
] as const;