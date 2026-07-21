/**
 * The assistant's brain — a deterministic intent engine.
 *
 * Every user message is scored against keyword lists; the best-matching
 * intent produces the reply. Two intents (wallet balance, active ride) are
 * "live": they call the real API so the answer reflects the person's actual
 * account, not canned text. Everything else is hand-written guidance that is
 * always accurate for Zamzam's real flows — which is the point: a help bot
 * for new users must never invent features that don't exist.
 *
 * Swapping this for a real LLM later means replacing askAssistant() only;
 * the chat UI doesn't care where replies come from.
 */
import { api, endpoints } from "@/api/client";
import { npr } from "@/lib/utils";

export interface AssistantAction {
  label: string;
  to: string;
}

export interface AssistantReply {
  text: string;
  actions?: AssistantAction[];
  followUps?: string[];
}

interface ActiveRide {
  id: string;
  service: string;
  from: string;
  to: string;
  fare: number;
  status: "REQUESTED" | "ACCEPTED" | "ONGOING" | "PAYMENT_PENDING";
  driverName: string | null;
  driverMobile: string | null;
}

const DEFAULT_FOLLOW_UPS = [
  "How do I book a ride?",
  "Where is my current ride?",
  "Check my wallet balance",
  "How do payments work?",
];

export const WELCOME: AssistantReply = {
  text:
    "Namaste! I'm your Zamzam guide. I can walk you through booking rides, buses, hotels, food and more — " +
    "or check your live trip and wallet right now. What would you like to do?",
  followUps: DEFAULT_FOLLOW_UPS,
};

const FALLBACK: AssistantReply = {
  text:
    "I didn't quite catch that — here's what I can help with: booking (rides, parcels, freight, buses, hotels, " +
    "food, groceries), tracking your current trip, your wallet and payments, cancelling, trip history, and " +
    "reaching support. Try one of the suggestions below, or ask in your own words.",
  followUps: [...DEFAULT_FOLLOW_UPS, "Contact support"],
};

interface Intent {
  id: string;
  keywords: string[];
  resolve: () => AssistantReply | Promise<AssistantReply>;
}

/* ── Live intents — fetch the person's real data ─────────────────────────── */

async function walletReply(): Promise<AssistantReply> {
  try {
    const { available } = await api.get<{ available: number }>(endpoints.wallet.balance);
    return {
      text:
        `Your wallet balance is ${npr(available)}. You can use it to settle fares instantly at drop-off — ` +
        "no cash needed. To add money, open your wallet and tap Top up.",
      actions: [{ label: "Open my wallet", to: "/app/wallet" }],
      followUps: ["How do payments work?", "Show my transactions"],
    };
  } catch {
    return {
      text: "I couldn't reach your wallet right now — the connection may be down. You can also check it directly:",
      actions: [{ label: "Open my wallet", to: "/app/wallet" }],
      followUps: DEFAULT_FOLLOW_UPS,
    };
  }
}

async function activeRideReply(): Promise<AssistantReply> {
  try {
    const ride = await api.get<ActiveRide | null>(endpoints.rides.active);
    if (!ride) {
      return {
        text: "You don't have an active booking right now. Want to start one?",
        actions: [
          { label: "Book a bike", to: "/app/book/bike" },
          { label: "Book a taxi", to: "/app/book/taxi" },
        ],
        followUps: ["How do I book a ride?", "Show my past trips"],
      };
    }
    const where = `${ride.from} → ${ride.to}`;
    const statusLine =
      ride.status === "REQUESTED"
        ? `We're finding you a driver for ${where}. This usually takes under a minute.`
        : ride.status === "ACCEPTED"
          ? `${ride.driverName ?? "Your driver"} has accepted and is heading to ${ride.from}.` +
            (ride.driverMobile ? ` You can call them at ${ride.driverMobile}.` : "")
          : ride.status === "ONGOING"
            ? `Your ${ride.service} trip (${where}) is in progress. You'll settle ${npr(ride.fare)} at drop-off.`
            : `Your trip has ended — ${npr(ride.fare)} is due. Pay from your wallet in one tap, or hand the driver cash.`;
    return {
      text: statusLine,
      actions: [{ label: "View live trip", to: `/app/book/${ride.service}` }],
      followUps: ["How do payments work?", "Can I cancel my booking?"],
    };
  } catch {
    return {
      text: "I couldn't check your trip right now — the connection may be down. Try the booking page directly:",
      actions: [{ label: "Open bookings", to: "/app/bookings" }],
      followUps: DEFAULT_FOLLOW_UPS,
    };
  }
}

/* ── Intent table ─────────────────────────────────────────────────────────── */

const INTENTS: Intent[] = [
  {
    id: "greeting",
    keywords: ["hi", "hello", "hey", "namaste", "good morning", "good evening"],
    resolve: () => WELCOME,
  },
  {
    id: "book_ride",
    keywords: ["book", "ride", "bike", "taxi", "cab", "go to", "travel", "how do i book"],
    resolve: () => ({
      text:
        "Booking takes three steps: 1) pick your pickup and drop-off (or use your live location), " +
        "2) tap Find — the fare is fixed up-front before you confirm, and 3) a nearby driver accepts " +
        "and you'll see their name, vehicle and phone number. You settle the fare at drop-off, by cash or wallet.",
      actions: [
        { label: "Book a bike", to: "/app/book/bike" },
        { label: "Book a taxi", to: "/app/book/taxi" },
      ],
      followUps: ["How do payments work?", "Send a parcel instead"],
    }),
  },
  {
    id: "parcel",
    keywords: ["parcel", "package", "courier", "deliver", "send something"],
    resolve: () => ({
      text:
        "Parcel delivery works like a ride: set pickup and drop-off, enter the package weight, and a rider " +
        "carries it across town. The fare is fixed before you confirm.",
      actions: [{ label: "Send a parcel", to: "/app/book/parcel" }],
      followUps: ["How do I book a ride?", "Move freight instead"],
    }),
  },
  {
    id: "freight",
    keywords: ["freight", "truck", "cargo", "load", "heavy"],
    resolve: () => ({
      text:
        "For big loads, post your freight job with route and cargo details — verified freight partners then bid " +
        "on it, and you pick the offer you like. You stay in control of the price.",
      actions: [{ label: "Post a freight load", to: "/app/book/freight" }],
      followUps: ["Send a small parcel instead", "Show my bookings"],
    }),
  },
  {
    id: "bus",
    keywords: ["bus", "intercity", "ticket", "seat"],
    resolve: () => ({
      text:
        "Intercity buses: browse routes and departure times, pick your seats on the seat map, and pay to " +
        "confirm your ticket. Your tickets live under Bus tickets, where you can also cancel or review a trip.",
      actions: [
        { label: "Browse buses", to: "/app/buses" },
        { label: "My tickets", to: "/app/buses/tickets" },
      ],
      followUps: ["Book a hotel", "How do payments work?"],
    }),
  },
  {
    id: "hotel",
    keywords: ["hotel", "room", "stay", "night", "hostel"],
    resolve: () => ({
      text:
        "Hotels: browse verified stays, check live room availability for your dates, and book instantly. " +
        "Your reservations are under Hotel bookings — cancellation and reviews live there too.",
      actions: [
        { label: "Browse hotels", to: "/app/hotels" },
        { label: "My hotel bookings", to: "/app/hotels/bookings" },
      ],
      followUps: ["Book a bus", "Show my bookings"],
    }),
  },
  {
    id: "food",
    keywords: ["food", "restaurant", "eat", "hungry", "meal", "momo", "order food"],
    resolve: () => ({
      text:
        "Food delivery: pick a restaurant, build your order from the menu, and track it from the kitchen to " +
        "your door under Food orders.",
      actions: [
        { label: "Browse restaurants", to: "/app/restaurants" },
        { label: "My food orders", to: "/app/restaurants/orders" },
      ],
      followUps: ["Order groceries", "Check my wallet balance"],
    }),
  },
  {
    id: "grocery",
    keywords: ["grocery", "groceries", "vegetable", "store", "essentials"],
    resolve: () => ({
      text: "Groceries: pick a store, fill your basket, and it's delivered to you. Track it under Grocery orders.",
      actions: [
        { label: "Browse stores", to: "/app/grocery" },
        { label: "My grocery orders", to: "/app/grocery/orders" },
      ],
      followUps: ["Order food instead", "How do payments work?"],
    }),
  },
  { id: "wallet", keywords: ["wallet", "balance", "top up", "topup", "add money", "money"], resolve: walletReply },
  { id: "active_ride", keywords: ["where", "track", "status", "current ride", "my ride", "my trip", "driver"], resolve: activeRideReply },
  {
    id: "payments",
    keywords: ["pay", "payment", "cash", "settle", "fare", "how much", "price"],
    resolve: () => ({
      text:
        "Fares are fixed up-front — what you see when booking is what you pay, no surprises. You settle at " +
        "drop-off, two ways: tap Pay from wallet for instant in-app payment, or hand the driver cash and " +
        "they confirm it. Either way you'll get a trip receipt and a chance to rate your driver.",
      actions: [{ label: "Open my wallet", to: "/app/wallet" }],
      followUps: ["Check my wallet balance", "Show my transactions"],
    }),
  },
  {
    id: "cancel",
    keywords: ["cancel"],
    resolve: () => ({
      text:
        "You can cancel a ride while it's still being matched or the driver is on the way — open your live " +
        "booking and tap Cancel booking. Once the trip has started it can't be cancelled. Bus and hotel " +
        "bookings are cancelled from their own booking pages.",
      actions: [{ label: "My bookings", to: "/app/bookings" }],
      followUps: ["Where is my current ride?", "Contact support"],
    }),
  },
  {
    id: "history",
    keywords: ["history", "past", "previous", "receipt", "trips", "transactions"],
    resolve: () => ({
      text:
        "Every completed trip is under My trips, and every payment (wallet top-ups, fares) is under " +
        "Transactions. All your bookings across services are collected in Bookings.",
      actions: [
        { label: "My trips", to: "/app/trips" },
        { label: "Transactions", to: "/app/transactions" },
      ],
      followUps: ["Check my wallet balance", "Book a ride"],
    }),
  },
  {
    id: "support",
    keywords: ["support", "help", "problem", "issue", "complaint", "refund", "stuck", "wrong"],
    resolve: () => ({
      text:
        "Sorry something's not right. Open Support and raise a ticket describing the problem — the team " +
        "tracks every ticket and you can follow its status on the same page. For anything about a specific " +
        "trip, mention when it happened so it's easy to find.",
      actions: [{ label: "Open support", to: "/app/support" }],
      followUps: ["Where is my current ride?", "Show my past trips"],
    }),
  },
  {
    id: "thanks",
    keywords: ["thank", "thanks", "dhanyabad", "great", "awesome"],
    resolve: () => ({
      text: "Anytime! I'm always here on this page if you need a hand with anything in Zamzam.",
      followUps: DEFAULT_FOLLOW_UPS,
    }),
  },
];

/** Score the message against every intent; multi-word keywords weigh double. */
export async function askAssistant(raw: string): Promise<AssistantReply> {
  const text = raw.toLowerCase().trim();
  if (!text) return FALLBACK;

  let best: Intent | null = null;
  let bestScore = 0;
  for (const intent of INTENTS) {
    let score = 0;
    for (const kw of intent.keywords) {
      if (text.includes(kw)) score += kw.includes(" ") ? 2 : 1;
    }
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  if (!best) return FALLBACK;
  return best.resolve();
}