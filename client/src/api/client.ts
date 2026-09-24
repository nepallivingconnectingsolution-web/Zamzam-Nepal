/**
 * Zamzam API layer — talks to the real NestJS backend (see /server).
 *
 * Adds one behavior the old mock never had: silent access-token refresh on
 * a 401. Access tokens are short-lived (15m by default — see
 * server/.env.example) for security, so without this every user would be
 * bounced to the login screen every 15 minutes. On a 401, this tries
 * POST /auth/refresh once using the stored refresh token; on success it
 * retries the original request transparently, on failure it signs the user
 * out (matching the previous behavior of just failing).
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function authToken(): string | null {
  try {
    return sessionStorage.getItem("zz_token");
  } catch {
    return null;
  }
}

function refreshTokenValue(): string | null {
  try {
    return sessionStorage.getItem("zz_refresh_token");
  } catch {
    return null;
  }
}

function signOutAndRedirect(message?: string) {
  try {
    sessionStorage.removeItem("zz_token");
    sessionStorage.removeItem("zz_refresh_token");
    sessionStorage.removeItem("zz_auth");
  } catch {
    // ignore
  }
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    if (message) {
      try {
        sessionStorage.setItem("zz_signout_reason", message);
      } catch {
        // ignore
      }
    }
    window.location.assign("/login");
  }
}

let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  const rt = refreshTokenValue();
  if (!rt) return null;

  // De-duplicate concurrent refresh attempts (e.g. several requests 401 at
  // once) into a single network call.
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { accessToken: string };
     sessionStorage.setItem("zz_token", data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function parseErrorBody(res: Response): Promise<{ message: string; code?: string; details?: unknown }> {
  try {
    const body = await res.json();
    if (body && typeof body.message === "string") {
      return {
        message: body.message,
        code: typeof body.code === "string" ? body.code : undefined,
        details: body.details,
      };
    }
  } catch {
    // fall through to generic message
  }
  return { message: "Something went wrong. Please try again." };
}

async function request<T>(method: Method, path: string, body?: unknown, _retried = false): Promise<T> {
  const token = authToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    // Every request through this client is either a live-state read (rides,
    // dashboards, polling) or a mutation — nothing here should ever be
    // served from the browser's HTTP cache. Without this, some requests
    // (like GET /rides/current) can keep silently returning an old cached
    // snapshot even while polling "succeeds," which is what made completed
    // trips keep showing as active until a hard refresh.
    cache: "no-store",
  });

  if (res.status === 401) {
    if (token && !_retried) {
      const newToken = await tryRefreshAccessToken();
      if (newToken) {
        return request<T>(method, path, body, true);
      }
    }
    // Either there was no refresh token to try, refresh itself failed, or
    // this was already a retried request that still came back 401 (a
    // refreshed token the server still rejects). Nothing left to retry —
    // sign out and send them back to log in instead of leaving the page
    // stuck on a dead-end error that only a manual reload used to clear.
    //
    // The message matters: without it an expired session dumped the user on
    // the login screen with no explanation, which reads as "the app logged
    // me out at random" or, mid-form, as "the button is broken".
    signOutAndRedirect("Your session expired. Please sign in again.");
  }

  if (res.status === 403) {
    const { code, message } = await parseErrorBody(res.clone());
    // Only ever fired by RolesGuard when the token's real role doesn't
    // match what this page required to render in the first place — i.e.
    // the session in *this* tab went stale mid-flow (most commonly:
    // another tab logged into a different-role account, which silently
    // overwrites the shared localStorage token everyone reads from).
    // No amount of retrying will fix that from inside the current page,
    // so recover the same way an expired session does: sign out and
    // send them back to log in, with a clear reason instead of a
    // dead-end "you don't have access" on whatever they were doing.
    if (code === "ROLE_MISMATCH") {
      signOutAndRedirect("Your session changed in another tab. Please sign in again.");
    }
    // A business partner's account was suspended while it was signed in (an
    // unapproved one never reaches a guarded page: RequireRole sends it to
    // /verification). Nothing on this page can work again, so end the session
    // with the server's reason.
    if (code === "PARTNER_NOT_APPROVED") {
      signOutAndRedirect(message);
    }
  }

  if (!res.ok) {
    const { message, code, details } = await parseErrorBody(res);
    throw new ApiError(res.status, message, errorDetail(message, code, details));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** `{ message, code?, details? }` — the shape every ApiError.detail carries. */
function errorDetail(message: string, code?: string, details?: unknown) {
  return { message, ...(code ? { code } : {}), ...(details !== undefined ? { details } : {}) };
}

interface RequestOptions {
  /** Kept for call-site compatibility; auth is implicit via the stored token. */
  auth?: boolean;
}

/**
 * Multipart upload — deliberately not routed through request() above, since
 * that always JSON.stringifies the body and sets Content-Type: application/json.
 * For a FormData body the browser must set its own Content-Type (with the
 * multipart boundary), so it's omitted here entirely. Shares the same
 * silent-401-refresh-then-retry behavior as every other call.
 */
async function upload<T>(path: string, formData: FormData, _retried = false): Promise<T> {
  const token = authToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
    cache: "no-store",
  });

  if (res.status === 401) {
    if (token && !_retried) {
      const newToken = await tryRefreshAccessToken();
      if (newToken) {
        return upload<T>(path, formData, true);
      }
    }
    signOutAndRedirect();
  }

  if (!res.ok) {
    const { message, code } = await parseErrorBody(res);
    throw new ApiError(res.status, message, code ? { message, code } : { message });
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Fetches a private file (an onboarding document) with the caller's token and
 * returns its bytes. Private files are never public URLs, so an <img src>
 * cannot load them; callers turn the Blob into an object URL instead.
 */
async function getBlob(path: string, _retried = false): Promise<Blob> {
  const token = authToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: "no-store",
  });
  if (res.status === 401 && token && !_retried && (await tryRefreshAccessToken())) {
    return getBlob(path, true);
  }
  if (!res.ok) {
    const { message, code } = await parseErrorBody(res);
    throw new ApiError(res.status, message, errorDetail(message, code));
  }
  return res.blob();
}

/**
 * Multipart upload with a progress callback (fetch cannot report upload
 * progress, XMLHttpRequest can). Same one-shot silent token refresh as the
 * other calls. A dropped connection surfaces as ApiError(0) so the UI can
 * offer a Retry instead of failing silently.
 */
function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  _retried = false,
): Promise<T> {
  const token = authToken();
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, "Connection lost. Check your internet and try again.", { message: "Connection lost." }));
    xhr.ontimeout = xhr.onerror;
    xhr.onload = async () => {
      if (xhr.status === 401 && token && !_retried && (await tryRefreshAccessToken())) {
        uploadWithProgress<T>(path, formData, onProgress, true).then(resolve, reject);
        return;
      }
      let body: { message?: string; code?: string; details?: unknown } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON body: fall through
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      const message = body?.message ?? "Something went wrong. Please try again.";
      reject(new ApiError(xhr.status, message, errorDetail(message, body?.code, body?.details)));
    };
    xhr.send(formData);
  });
}

export const api = {
  get: <T>(path: string, _opts?: RequestOptions) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, _opts?: RequestOptions) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown, _opts?: RequestOptions) => request<T>("PUT", path, body),
  blob: getBlob,
  uploadWithProgress,
  patch: <T>(path: string, body?: unknown, _opts?: RequestOptions) => request<T>("PATCH", path, body),
  delete: <T>(path: string, _opts?: RequestOptions) => request<T>("DELETE", path),
  upload: <T>(path: string, formData: FormData) => upload<T>(path, formData),
};

/** Base URL prefix needed to build a viewable link out of a server-relative fileUrl (e.g. "/uploads/…"). */
export const API_ORIGIN = API_BASE_URL;



/** Endpoint registry — single source of truth for the app's routes. */
export const endpoints = {
  auth: {
    register: "/auth/register",
    login: "/auth/login",
    google: "/auth/google",
    me: "/auth/me",
    refresh: "/auth/refresh",
    forgotPassword: "/auth/forgot-password",
    verifyResetOtp: "/auth/verify-reset-otp",
    resetPassword: "/auth/reset-password",
    verifyEmail: "/auth/verify-email",
    verifyMobile: "/auth/verify-mobile",
    resendEmailOtp: "/auth/resend-email-otp",
    resendMobileOtp: "/auth/resend-mobile-otp",
  },
  superAdminAuth: {
    login: "/super-admin/auth/login",
    forgotPassword: "/super-admin/auth/forgot-password",
    verifyResetOtp: "/super-admin/auth/verify-reset-otp",
    resetPassword: "/super-admin/auth/reset-password",
  },
  profile: { customer: "/profile/customer", business: "/profile/business", me: "/profile/me", password: "/profile/password" },
  wallet: { balance: "/wallet/balance", transactions: "/wallet/transactions", topup: "/wallet/topup" },
  rides: {
    request: "/rides",
    history: "/rides/history",
    active: "/rides/active",
    cancel: (id: string) => `/rides/${id}/cancel`,
    review: (id: string) => `/rides/${id}/review`,
    incoming: "/rides/incoming",
    current: "/rides/current",
    accept: (id: string) => `/rides/${id}/accept`,
    start: (id: string) => `/rides/${id}/start`,
    complete: (id: string) => `/rides/${id}/complete`,
    // Post-trip settlement: driver confirms cash, customer pays in-app.
    confirmCash: (id: string) => `/rides/${id}/confirm-cash`,
    pay: (id: string) => `/rides/${id}/pay`,
    // In-trip chat between the matched customer and driver.
   messages: (id: string) => `/rides/${id}/messages`,
    rateCustomer: (id: string) => `/rides/${id}/rate-customer`,
    detail: (id: string) => `/rides/${id}`,
  },
bookings: { list: "/bookings" },
  locations: { search: (q: string) => `/locations/search?q=${encodeURIComponent(q)}` },
  support: { tickets: "/support/tickets" },
  // Public, unauthenticated read of active promo banners + which services
  // are switched on — see server's PublicCmsController. Managed from the
  // super-admin CMS page; this is the customer-facing consumer of it.
  cms: { public: "/cms" },
  notifications: {
    list: "/notifications",
    unreadCount: "/notifications/unread-count",
    markRead: (id: string) => `/notifications/${id}/read`,
    markAllRead: "/notifications/read-all",
  },
  
 buses: {
  list: '/buses',
  detail: (id: string) => `/buses/${id}`,
  book: (id: string) => `/buses/${id}/book`,
  myBookings: '/buses/bookings/mine',
  cancel: (ticketId: string) => `/buses/bookings/${ticketId}/cancel`,
  review: (ticketId: string) => `/buses/bookings/${ticketId}/review`,
  op: {
    buses: '/operator/buses',
    bus: (id: string) => `/operator/buses/${id}`,
    busPhotos: (id: string) => `/operator/buses/${id}/photos`,
    busPhotoDelete: (id: string, publicId: string) => `/operator/buses/${id}/photos/${publicId}`,
    metrics: '/operator/buses/metrics',
    schedules: '/operator/buses/schedules',
    schedule: (id: string) => `/operator/buses/schedules/${id}`,
    scheduleTrips: (id: string) => `/operator/buses/schedules/${id}/trips`,
    trip: (id: string) => `/operator/buses/trips/${id}`,
    bookings: '/operator/buses/bookings',
    reviews: '/operator/buses/reviews',
    reviewSummary: '/operator/buses/reviews/summary',
    revenue: '/operator/buses/revenue',
    routes: '/operator/buses/routes',
  },
},
 

  hotels: {
    list: "/hotels",
    detail: (id: string) => `/hotels/${id}`,
    availability: (roomTypeId: string) => `/hotels/room-types/${roomTypeId}/availability`,
    book: (id: string) => `/hotels/${id}/book`,
    myBookings: "/hotels/bookings/mine",
    cancel: (id: string) => `/hotels/bookings/${id}/cancel`,
    review: (bookingId: string) => `/hotels/bookings/${bookingId}/review`,
    partner: {
      hotels: "/hotel/hotels",
      hotel: (id: string) => `/hotel/hotels/${id}`,
      roomTypes: (hotelId: string) => `/hotel/hotels/${hotelId}/room-types`,
      roomType: (hotelId: string, roomTypeId: string) => `/hotel/hotels/${hotelId}/room-types/${roomTypeId}`,
      hotelPhotos: (id: string) => `/hotel/hotels/${id}/photos`,
      hotelPhotoDelete: (id: string, publicId: string) => `/hotel/hotels/${id}/photos/${publicId}`,
      roomTypePhotos: (hotelId: string, roomTypeId: string) => `/hotel/hotels/${hotelId}/room-types/${roomTypeId}/photos`,
      roomTypePhotoDelete: (hotelId: string, roomTypeId: string, publicId: string) =>
        `/hotel/hotels/${hotelId}/room-types/${roomTypeId}/photos/${publicId}`,
      bookings: "/hotel/hotels/bookings/all",
      bookingDetail: (bookingId: string) => `/hotel/hotels/bookings/${bookingId}`,
      cancelBooking: (bookingId: string) => `/hotel/hotels/bookings/${bookingId}/cancel`,
      reviews: "/hotel/hotels/reviews/all",
      reviewSummary: "/hotel/hotels/reviews/summary",
      revenue: "/hotel/revenue",
    },
  },

  restaurants: {
    list: "/restaurants",
    detail: (id: string) => `/restaurants/${id}`,
    order: (id: string) => `/restaurants/${id}/order`,
    myOrders: "/restaurants/orders/mine",
    cancel: (orderId: string) => `/restaurants/orders/${orderId}/cancel`,
    review: (orderId: string) => `/restaurants/orders/${orderId}/review`,
    partner: {
      restaurants: "/restaurant/restaurants",
      restaurant: (id: string) => `/restaurant/restaurants/${id}`,
      restaurantPhotos: (id: string) => `/restaurant/restaurants/${id}/photos`,
      restaurantPhotoDelete: (id: string, publicId: string) => `/restaurant/restaurants/${id}/photos/${publicId}`,
      categories: (restaurantId: string) => `/restaurant/restaurants/${restaurantId}/categories`,
      category: (restaurantId: string, categoryId: string) => `/restaurant/restaurants/${restaurantId}/categories/${categoryId}`,
      items: (restaurantId: string) => `/restaurant/restaurants/${restaurantId}/items`,
      item: (restaurantId: string, itemId: string) => `/restaurant/restaurants/${restaurantId}/items/${itemId}`,
      itemPhoto: (restaurantId: string, itemId: string) => `/restaurant/restaurants/${restaurantId}/items/${itemId}/photo`,
      orders: "/restaurant/restaurants/orders/all",
      orderDetail: (orderId: string) => `/restaurant/restaurants/orders/${orderId}`,
      orderStatus: (orderId: string) => `/restaurant/restaurants/orders/${orderId}/status`,
      reviews: "/restaurant/restaurants/reviews/all",
      reviewSummary: "/restaurant/restaurants/reviews/summary",
      revenue: "/restaurant/revenue",
    },
  },

  grocery: {
  list: "/grocery-stores",
  detail: (id: string) => `/grocery-stores/${id}`,
  order: (id: string) => `/grocery-stores/${id}/order`,
  myOrders: "/grocery-stores/orders/mine",
  cancel: (orderId: string) => `/grocery-stores/orders/${orderId}/cancel`,
  review: (orderId: string) => `/grocery-stores/orders/${orderId}/review`,
  partner: {
    stores: "/grocery/stores",
    store: (id: string) => `/grocery/stores/${id}`,
    storePhotos: (id: string) => `/grocery/stores/${id}/photos`,
    storePhotoDelete: (id: string, publicId: string) => `/grocery/stores/${id}/photos/${publicId}`,
    categories: (storeId: string) => `/grocery/stores/${storeId}/categories`,
    category: (storeId: string, categoryId: string) => `/grocery/stores/${storeId}/categories/${categoryId}`,
    products: (storeId: string) => `/grocery/stores/${storeId}/products`,
    product: (storeId: string, productId: string) => `/grocery/stores/${storeId}/products/${productId}`,
    productPhoto: (storeId: string, productId: string) => `/grocery/stores/${storeId}/products/${productId}/photo`,
    restock: (storeId: string, productId: string) => `/grocery/stores/${storeId}/products/${productId}/restock`,
    orders: "/grocery/stores/orders/all",
    orderDetail: (orderId: string) => `/grocery/stores/orders/${orderId}`,
    orderStatus: (orderId: string) => `/grocery/stores/orders/${orderId}/status`,
    reviews: "/grocery/stores/reviews/all",
    reviewSummary: "/grocery/stores/reviews/summary",
    revenue: "/grocery/revenue",
  },
},
  
  admin: {
    metrics: "/admin/metrics",
    users: "/admin/users",
    revenue: "/admin/revenue",
    disputes: "/admin/disputes",
  },
  driver: {
    earnings: "/driver/earnings",
   requests: "/rides/incoming",
    status: "/driver/status",
    location: "/driver/location",
    reviews: "/driver/reviews",
    reviewSummary: "/driver/reviews/summary",
  },
  drivers: { nearby: "/drivers/nearby" },
  // Driver onboarding, verification and dispatch (server modules driver-onboarding + driver-dispatch).
  driverOnboarding: {
    application: "/driver/application",
    profile: "/driver/application/profile",
    vehicle: "/driver/application/vehicle",
    files: "/driver/application/files",
    file: (docId: string) => `/driver/application/files/${docId}`,
    submit: "/driver/application/submit",
    reopen: "/driver/application/reopen",
    requirements: (vehicleType: string) => `/driver/requirements?vehicleType=${vehicleType}`,
    otpSend: "/driver/otp/send",
    otpVerify: "/driver/otp/verify",
    fileBlob: (fileId: string) => `/driver/files/${fileId}`,
    eligibility: "/driver/eligibility",
    goOnline: "/driver/go-online",
    goOffline: "/driver/go-offline",
    offersPending: "/driver/offers/pending",
    offerAccept: (id: string) => `/driver/offers/${id}/accept`,
    offerDecline: (id: string) => `/driver/offers/${id}/decline`,
    stream: "/driver/stream",
  },
vehicles: {
    register: "/vehicles",
    mine: "/vehicles/mine",
    update: (id: string) => `/vehicles/${id}`,
    photos: (id: string) => `/vehicles/${id}/photos`,
    photoDelete: (id: string, publicId: string) => `/vehicles/${id}/photos/${publicId}`,
    activate: (id: string) => `/vehicles/${id}/activate`,
    remove: (id: string) => `/vehicles/${id}`,
  },
 driverDocuments: {
    mine: "/driver/documents/mine",
    upload: (type: string) => `/driver/documents/${type}`,
  },
  partnerDocuments: {
    mine: "/partner/documents/mine",
    upload: (type: string) => `/partner/documents/${type}`,
  },
  
  loads: {
    create: "/loads",
    mine: "/loads/mine",
    bids: (id: string) => `/loads/${id}/bids`,
    acceptBid: (id: string, bidId: string) => `/loads/${id}/bids/${bidId}/accept`,
    cancel: (id: string) => `/loads/${id}/cancel`,
    review: (id: string) => `/loads/${id}/review`,
  },
  freight: {
    metrics: "/freight/metrics",
    openLoads: "/freight/loads",
    placeBid: (id: string) => `/freight/loads/${id}/bid`,
    withdrawBid: (id: string) => `/freight/bids/${id}/withdraw`,
    shipments: "/freight/shipments",
    startShipment: (id: string) => `/freight/shipments/${id}/in-transit`,
    deliverShipment: (id: string) => `/freight/shipments/${id}/delivered`,
    reviews: "/freight/reviews",
    reviewSummary: "/freight/reviews/summary",
    revenue: "/freight/revenue",
  },
} as const;