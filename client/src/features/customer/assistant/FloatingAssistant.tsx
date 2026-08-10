import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Send, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { askAssistant, WELCOME, type AssistantAction } from "./assistant-engine";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
}

const STORAGE_KEY = "zz_assistant_chat";
const OPEN_KEY = "zz_assistant_open";

/** The Zamzam mark (same glyph as the sidebar logo), used instead of a
 *  generic bot icon so the launcher reads as "your app talking to you", not
 *  a stock chatbot. */
function AssistantMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path d="M6 6h11l-7 6.5H16L6 18V6z" fill="currentColor" />
    </svg>
  );
}

function loadSaved(): { messages: ChatMessage[]; followUps: string[] } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let nextId = 0;
const msgId = () => `m${Date.now()}_${nextId++}`;

/**
 * Zamzam's assistant, as a floating launcher + panel available from every
 * customer screen (marketplace, bookings, wallet, etc.) instead of living on
 * its own sidebar page. Same brain (assistant-engine), same conversation
 * (still persisted to sessionStorage) — just presented as an overlay so it
 * never gets in the way of the page underneath it.
 */
/**
 * Detail/checkout routes render their own sticky action bar pinned above the
 * tab bar, which is exactly where this launcher sits — they collide, and the
 * FAB ends up half-hidden behind the bar. It also shouldn't be competing for
 * attention mid-checkout in the first place, so it's hidden on those routes
 * rather than repositioned.
 */
const CHECKOUT_ROUTE = /^\/app\/(buses|hotels|restaurants|grocery)\/(?!tickets|bookings|orders)[^/]+$/;

export function FloatingAssistant() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const saved = useRef(loadSaved()).current;

  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(OPEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>(
    saved?.messages ?? [{ id: msgId(), role: "assistant", text: WELCOME.text }],
  );
  const [followUps, setFollowUps] = useState<string[]>(saved?.followUps ?? WELCOME.followUps ?? []);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, followUps }));
    } catch {
      // Storage full/blocked — the chat still works, it just won't persist.
    }
  }, [messages, followUps]);

  useEffect(() => {
    try {
      sessionStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      // ignore
    }
  }, [open]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, open]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || thinking) return;
    setDraft("");
    setMessages((m) => [...m, { id: msgId(), role: "user", text }]);
    setThinking(true);
    try {
      const [reply] = await Promise.all([askAssistant(text), new Promise((r) => setTimeout(r, 450))]);
      setMessages((m) => [...m, { id: msgId(), role: "assistant", text: reply.text, actions: reply.actions }]);
      setFollowUps(reply.followUps ?? []);
    } finally {
      setThinking(false);
    }
  }

  function goTo(to: string) {
    setOpen(false);
    navigate(to);
  }

  // Placed after every hook so the hook order stays stable across routes.
  if (CHECKOUT_ROUTE.test(pathname)) return null;

  return (
    <>
      {/* ── Launcher ── */}
   {/* Persistent chrome, deliberately NOT amber: this button is on every
       screen, so an amber fill here would spend each screen's single accent
       before that screen even got to choose its own primary action. Solid
       teal, Level-2 elevation, and nothing else — the previous version
       stacked a sonar ping, a three-stop gradient, a glossy sheen, a custom
       amber glow shadow and a decorative sparkle badge, none of which
       carried information. */}
   <div className="fixed right-6 z-40" style={{ bottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close assistant" : "Open Zamzam assistant"}
          aria-expanded={open}
          className={cn(
            "group relative grid size-14 place-items-center rounded-full",
            "bg-teal-700 text-white shadow-e2",
            "transition-transform duration-fast ease-standard active:scale-[0.95]",
          )}
        >

          <AnimatePresence mode="wait" initial={false}>
            {open ? (
              <motion.span
                key="close"
                initial={{ opacity: 0, rotate: -45, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 45, scale: 0.8 }}
                transition={{ duration: 0.18 }}
                className="relative"
              >
                <X className="size-6 text-white" />
              </motion.span>
            ) : (
              <motion.span
                key="mark"
                initial={{ opacity: 0, rotate: 45, scale: 0.8 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: -45, scale: 0.8 }}
                transition={{ duration: 0.18 }}
                className="relative"
              >
                <AssistantMark className="size-6 text-white" />
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* ── Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            style={{ transformOrigin: "bottom right", bottom: "calc(150px + env(safe-area-inset-bottom))" }}
            className="fixed right-6 z-40 flex h-[min(640px,calc(100vh-160px))] w-[calc(100vw-3rem)] max-w-[380px] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-card shadow-lift ring-1 ring-black/5 dark:ring-white/5"
            role="dialog"
            aria-modal="false"
            aria-label="Zamzam assistant"
          >
            {/* Header — textured gradient instead of a flat fill */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-900 px-5 py-4 dark:from-brand-950 dark:via-brand-900 dark:to-brand-950">
              <div className="grain pointer-events-none absolute inset-0 opacity-[0.05]" aria-hidden />
              <div className="pointer-events-none absolute -right-8 -top-14 size-36 rounded-full bg-accent/25 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-16 -left-10 size-32 rounded-full bg-accent/10 blur-3xl" aria-hidden />
              <div className="relative flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <AssistantMark className="size-5 text-accent" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-semibold text-white">Zamzam Assistant</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-white/65">
                    <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                    Online — replies instantly
                  </p>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close assistant"
                  className="grid size-8 shrink-0 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>

            {/* Conversation */}
            <div ref={scrollRef} className="flex-1 space-y-3.5 overflow-y-auto p-4">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-sm text-accent-fg">
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                      <AssistantMark className="size-3.5" />
                    </span>
                    <div className="max-w-[85%] space-y-2">
                      <div className="rounded-2xl rounded-tl-md border border-border bg-muted/40 px-3.5 py-2 text-[13px] leading-relaxed">
                        {m.text}
                      </div>
                      {m.actions && m.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.actions.map((a) => (
                            <button
                              key={a.to + a.label}
                              onClick={() => goTo(a.to)}
                              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:border-accent hover:text-accent"
                            >
                              {a.label} <ArrowRight className="size-3" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              )}

              {thinking && (
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                    <AssistantMark className="size-3.5" />
                  </span>
                  <div className="rounded-2xl rounded-tl-md border border-border bg-muted/40 px-3.5 py-2.5">
                    <span className="flex gap-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:0ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:150ms]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Suggested follow-ups */}
            {followUps.length > 0 && !thinking && (
              <div className="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border px-4 py-2.5">
                {followUps.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[11px] text-muted-fg transition-colors hover:border-accent hover:text-accent"
                  >
                    <Sparkles className="size-3" /> {q}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") send(draft);
                }}
                placeholder="Ask anything…"
                aria-label="Message the assistant"
                className="flex h-10 w-full rounded-xl border border-input bg-surface px-3.5 text-sm text-fg placeholder:text-muted-fg transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                onClick={() => send(draft)}
                disabled={thinking || !draft.trim()}
                aria-label="Send"
                className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg transition-all hover:bg-accent-600 hover:shadow-glow disabled:pointer-events-none disabled:opacity-50"
              >
                <Send className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}