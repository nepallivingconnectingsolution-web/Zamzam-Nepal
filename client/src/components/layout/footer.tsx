import { Link, useNavigate } from "react-router-dom";
import { useRef, useState } from "react";
import { Logo } from "./logo";

const COLS = [
  {
    title: "Ride & move",
    links: ["Taxi", "Bike", "Intercity bus", "Tours"],
  },
  {
    title: "Send & ship",
    links: ["Parcel delivery", "Freight marketplace", "Business logistics"],
  },
  {
    title: "Partners",
    links: ["Drive with Zamzam", "List your hotel", "Bus operators", "Carry freight"],
  },
  {
    title: "Company",
    links: ["About", "Investors", "Careers", "Contact"],
  },
];

/**
 * Hidden super-admin trigger:
 * Triple-click the "©" symbol in the copyright line within 2 seconds.
 * This is intentionally invisible — no tooltip, no highlight, no aria hints.
 */
function useHiddenTrigger(onActivate: () => void) {
  const clickCount = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    clickCount.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      clickCount.current = 0;
    }, 2000);

    if (clickCount.current >= 3) {
      clickCount.current = 0;
      if (timer.current) clearTimeout(timer.current);
      onActivate();
    }
  }

  return handleClick;
}

export function Footer() {
  const navigate = useNavigate();
  const handleTrigger = useHiddenTrigger(() => navigate("/x-admin/login"));

  return (
    <footer className="border-t border-border bg-surface">
      <div className="container py-16">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm text-muted-fg">
              Nepal's everything app for mobility, logistics and travel. One identity, one wallet,
              one assistant.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.title}>
              <h4 className="text-sm font-semibold">{col.title}</h4>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-muted-fg transition-colors hover:text-fg">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-sm text-muted-fg sm:flex-row sm:items-center">
          <p>
            {/* Hidden trigger: triple-click the © symbol */}
            <span
              onClick={handleTrigger}
              className="select-none cursor-default"
              aria-hidden="true"
            >
              ©
            </span>{" "}
            {new Date().getFullYear()} Zamzam Technologies. Built in Kathmandu.
          </p>
          <div className="flex gap-5">
            <Link to="#" className="hover:text-fg">Privacy</Link>
            <Link to="#" className="hover:text-fg">Terms</Link>
            <Link to="#" className="hover:text-fg">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
