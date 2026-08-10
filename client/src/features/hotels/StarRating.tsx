import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Five clickable stars for input, or a read-only display when `onChange`
 * is omitted. Rounds `value` for display so a 4.3 average still renders
 * sensibly as 4 filled stars.
 */
export function StarRating({
  value,
  onChange,
  size = 18,
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  className?: string;
}) {
  const readOnly = !onChange;
  const filled = Math.round(value);

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          className={cn(readOnly ? "cursor-default" : "cursor-pointer transition-transform hover:scale-110")}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
        >
          <Star
            width={size}
            height={size}
            className={star <= filled ? "fill-warning text-warning" : "text-muted-fg"}
          />
        </button>
      ))}
    </div>
  );
}