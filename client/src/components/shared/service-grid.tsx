import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SERVICES } from "@/config";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";

/**
 * The marketplace itself — every Zamzam vertical as a tappable tile.
 * `linked` makes tiles route into the customer app (used inside the portal);
 * on the public site they're presentational.
 */
export function ServiceGrid({
  linked = false,
  compact = false,
}: {
  linked?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-3",
        // `compact` is the in-app variant and only ever renders inside the
        // phone frame (see CustomerShell), which is a fixed 440px wide. Its
        // old responsive classes keyed off the VIEWPORT, not the frame, so on
        // a desktop screen it escalated to four columns inside a 440px box
        // and the tiles turned into unreadable slivers. Two columns, always.
        compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-2",
      )}
    >
      {SERVICES.map((s, i) => {
        const inner = (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileTap={s.live && linked ? { scale: 0.97 } : undefined}
            transition={{ delay: i * 0.03, duration: 0.4 }}
            className={cn(
              "group relative h-full overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all",
              s.live && linked && "hover:-translate-y-0.5 hover:shadow-lift",
              !s.live && "opacity-70",
            )}
          >
            <div
              className={cn(
                "absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100",
                s.accent,
              )}
            />
            <div className="relative">
              <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-fg">
                <Icon name={s.icon} className="size-5" />
              </span>
              <div className="mt-3 flex items-center gap-2">
                <h3 className="font-display font-semibold tracking-tight">{s.name}</h3>
                {!s.live && (
                  <Badge variant="outline" className="text-[10px]">
                    Soon
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-fg">{s.tagline}</p>
            </div>
          </motion.div>
        );

        if (linked && s.live) {
          return (
            <Link key={s.id} to={s.to} className="block focus-visible:rounded-2xl">
              {inner}
            </Link>
          );
        }
        return <div key={s.id}>{inner}</div>;
      })}
    </div>
  );
}
