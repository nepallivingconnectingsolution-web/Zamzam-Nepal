export type GroceryOrderStatus =
  | "PENDING" | "CONFIRMED" | "PACKING" | "PACKED"
  | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export type Fulfillment = "delivery" | "pickup";

export interface StoreSearchResult {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  storeType: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  freeDeliveryAbove: number | null;
  deliveryEtaMinutes: number;
  fromPrice: number | null;
  rating: { average: number; count: number } | null;
  operator: string;
}

export interface ProductSummary {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  mrp: number | null;
  stock: number;
  inStock: boolean;
  photo: string | null;
  tags: string[];
}

export interface ProductCategoryGroup {
  id: string;
  name: string;
  products: ProductSummary[];
}

export interface StoreDetail {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  storeType: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  freeDeliveryAbove: number | null;
  deliveryEtaMinutes: number;
  categories: ProductCategoryGroup[];
}

export interface OrderAccount {
  name: string;
  email: string;
  mobile: string;
  kycStatus: string;
}

export interface GroceryOrderItem {
  id: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface GroceryOrder {
  id: string;
  orderRef: string;
  status: GroceryOrderStatus;
  fulfillment: Fulfillment;
  store: { storeName: string; city: string };
  storeId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  note: string | null;
  items: GroceryOrderItem[];
  itemsTotal: number;
  deliveryFee: number;
  serviceFee: number;
  grandTotal: number;
  method: string | null;
  placedAt: string;
  updatedAt: string;
  account: OrderAccount | null;
}

export interface PartnerStore {
  id: string;
  partnerId: string;
  name: string;
  city: string;
  address: string;
  description: string | null;
  storeType: string;
  photos: string[];
  openTime: string;
  closeTime: string;
  deliveryFee: number;
  minOrder: number;
  freeDeliveryAbove: number | null;
  deliveryEtaMinutes: number;
  isActive: boolean;
  createdAt: string;
}

export interface PartnerProductCategory {
  id: string;
  storeId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface PartnerProduct {
  id: string;
  storeId: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  unit: string;
  price: number;
  mrp: number | null;
  stock: number;
  photo: string | null;
  tags: string[];
  isAvailable: boolean;
  createdAt: string;
}

export interface GroceryReview {
  id: string;
  orderId: string;
  storeId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface PartnerGroceryReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  customerName: string;
  orderRef: string;
  storeName: string;
  orderedAt: string;
}

export interface GroceryReviewSummary {
  average: number;
  count: number;
  distribution: { star: number; count: number }[];
}

export interface GroceryRevenueDailyBucket {
  date: string;
  orders: number;
  grossRevenue: number;
  platformFee: number;
  netProfit: number;
  cancelled: number;
  refunded: number;
}

export interface GroceryRevenueSummary {
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

export interface PartnerGroceryRevenue {
  summary: GroceryRevenueSummary;
  daily: GroceryRevenueDailyBucket[];
}

export const STATUS_LABEL: Record<GroceryOrderStatus, string> = {
  PENDING: "Placed",
  CONFIRMED: "Confirmed",
  PACKING: "Packing",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** The next forward step a store can take for each status. */
export const NEXT_STATUS: Partial<Record<GroceryOrderStatus, { delivery: GroceryOrderStatus; pickup: GroceryOrderStatus }>> = {
  PENDING: { delivery: "CONFIRMED", pickup: "CONFIRMED" },
  CONFIRMED: { delivery: "PACKING", pickup: "PACKING" },
  PACKING: { delivery: "PACKED", pickup: "PACKED" },
  PACKED: { delivery: "OUT_FOR_DELIVERY", pickup: "DELIVERED" },
  OUT_FOR_DELIVERY: { delivery: "DELIVERED", pickup: "DELIVERED" },
};

export const COMMON_STORE_TYPES = [
  "Supermarket", "Kirana Store", "Pharmacy", "Bakery", "Dark Store", "Organic Store",
] as const;

export const COMMON_UNITS = [
  "1 pc", "500 g", "1 kg", "250 ml", "500 ml", "1 L", "6 pcs", "1 dozen", "1 pack",
] as const;