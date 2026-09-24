import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListingCardProps {
  to: string;
  photo: string | null;
  fallbackIcon: ReactNode;
  /** Tailwind gradient stops for the no-photo placeholder, e.g. "from-vertical-hotel/15 to-vertical-hotel/0". */
  fallbackClassName: string;
  title: string;
  location: string;
  rating?: { average: number; count: number } | null;
  /** Plain-text facts joined with "·", e.g. ["Nepali", "09:00–21:00", "10 delivery"]. */
  meta: string[];
  price: number | null;
  priceUnit?: string;
  emptyPriceLabel: string;
}

/**
 * Airbnb-style listing card: a photo, a title/rating line, a location line,
 * one plain-text meta line, and a bold price — nothing else competing for
 * attention. Shared by Hotels/Restaurants/Grocery; Bus keeps its own
 * route-timeline card since a photo-first layout doesn't fit that content.
 */
export function ListingCard({
  to,
  photo,
  fallbackIcon,
  fallbackClassName,
  title,
  location,
  rating,
  meta,
  price,
  priceUnit,
  emptyPriceLabel,
}: ListingCardProps) {
  return (
    <Link to={to} className="group block">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-2">
        {photo ? (
          <img
            src={photo}
            alt={title}
            className="size-full object-cover transition-transform duration-base ease-standard group-hover:scale-[1.04]"
          />
        ) : (
          <div className={cn("flex size-full items-center justify-center bg-gradient-to-br", fallbackClassName)}>
            {fallbackIcon}
          </div>
        )}
      </div>
      <div className="mt-2.5 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate font-display text-sm font-semibold">{title}</h3>
          {rating && (
            <span className="flex shrink-0 items-center gap-1 text-xs font-medium">
              <Star className="size-3 fill-warning text-warning" /> {rating.average.toFixed(1)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-fg">{location}</p>
        {meta.length > 0 && <p className="truncate text-xs text-muted-fg">{meta.join(" · ")}</p>}
        <p className="pt-1 text-sm">
          {price != null ? (
            <>
              <span className="font-display font-bold font-tabular">रू {price.toLocaleString()}</span>
              {priceUnit && <span className="text-muted-fg"> {priceUnit}</span>}
            </>
          ) : (
            <span className="text-xs text-muted-fg">{emptyPriceLabel}</span>
          )}
        </p>
      </div>
    </Link>
  );
}
