import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const TabsCtx = createContext<{ value: string; set: (v: string) => void } | null>(null);

export function Tabs({
  defaultValue,
  children,
  className,
}: {
  defaultValue: string;
  children: ReactNode;
  className?: string;
}) {
  const [value, set] = useState(defaultValue);
  return (
    <TabsCtx.Provider value={{ value, set }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-xl bg-surface-2 p-1", className)} role="tablist">
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsCtx)!;
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => ctx.set(value)}
      className={cn(
        "rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-surface text-fg shadow-sm" : "text-muted-fg hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsCtx)!;
  if (ctx.value !== value) return null;
  return <div className="mt-4 animate-fade-up">{children}</div>;
}
