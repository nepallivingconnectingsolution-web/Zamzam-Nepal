import * as React from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { haptics } from "@/lib/native/haptics";

const TRIGGER_DISTANCE = 72;
const MAX_PULL = 110;

export interface PullToRefreshProps {
  onRefresh: () => Promise<unknown> | void;
  children: React.ReactNode;
  /** Disable while a screen has its own reason to ignore pulls (e.g. mid-transition). */
  disabled?: boolean;
}

/**
 * Wraps a screen with native-style pull-to-refresh. This app scrolls at the
 * document/window level (see globals.css's note on why `<body>` never gets
 * its own `overflow`), so — deliberately, to keep that one scroll owner —
 * this component does NOT introduce a nested scroll container. It only
 * gates on `window.scrollY`, then translates its children via a motion
 * value while the page itself keeps scrolling normally.
 *
 * Only engages when the page is already scrolled to the top — pulling down
 * mid-list just scrolls normally. Fires `haptics.action()` the instant the
 * pull crosses the trigger threshold, matching the "pull-to-refresh
 * trigger" haptic moment from the design mandate.
 */
export function PullToRefresh({ onRefresh, children, disabled }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = React.useState(false);
  const [armed, setArmed] = React.useState(false);
  const startY = React.useRef<number | null>(null);
  const pull = useMotionValue(0);
  const iconRotate = useTransform(pull, [0, TRIGGER_DISTANCE], [0, 180]);
  const indicatorOpacity = useTransform(pull, [0, 24], [0, 1]);

  function atTop() {
    return window.scrollY <= 0;
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (disabled || refreshing) return;
    startY.current = atTop() ? e.touches[0].clientY : null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startY.current == null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      pull.set(0);
      return;
    }
    // Rubber-band past the trigger point instead of tracking 1:1 forever.
    const damped = delta < TRIGGER_DISTANCE ? delta : TRIGGER_DISTANCE + (delta - TRIGGER_DISTANCE) * 0.35;
    const clamped = Math.min(damped, MAX_PULL);
    pull.set(clamped);
    if (clamped >= TRIGGER_DISTANCE && !armed) {
      setArmed(true);
      void haptics.action();
    } else if (clamped < TRIGGER_DISTANCE && armed) {
      setArmed(false);
    }
  }

  async function handleTouchEnd() {
    if (startY.current == null) return;
    const shouldRefresh = pull.get() >= TRIGGER_DISTANCE;
    startY.current = null;
    setArmed(false);
    if (shouldRefresh) {
      setRefreshing(true);
      animate(pull, 40, { type: "spring", damping: 24, stiffness: 300 });
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        animate(pull, 0, { type: "spring", damping: 24, stiffness: 300 });
      }
    } else {
      animate(pull, 0, { type: "spring", damping: 24, stiffness: 300 });
    }
  }

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      <motion.div
        style={{ opacity: indicatorOpacity }}
        className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"
      >
        <span className="grid size-9 place-items-center rounded-full bg-card shadow-e2">
          <motion.span style={{ rotate: iconRotate }}>
            <RefreshCw className={refreshing ? "size-4 animate-spin text-accent" : "size-4 text-muted-fg"} />
          </motion.span>
        </span>
      </motion.div>
      <motion.div style={{ y: pull }}>{children}</motion.div>
    </div>
  );
}
