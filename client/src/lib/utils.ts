import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's built-in font sizes. This project's
 * type scale (tailwind.config.ts fontSize: display, h1, h2, body, body-sm,
 * caption) would otherwise be read as text COLOURS, so `text-white` was silently
 * dropped whenever a button also had `text-h2` / `text-body-sm`, leaving dark
 * text on a dark fill. Registering them as font sizes stops that.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "h1", "h2", "body", "body-sm", "caption"] }],
    },
  },
});

/** Merge Tailwind classes without conflicts (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an amount in Nepalese Rupees. */
export function npr(amount: number, opts: { compact?: boolean } = {}) {
  return new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: opts.compact ? 0 : 2,
    notation: opts.compact ? "compact" : "standard",
  }).format(amount);
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
