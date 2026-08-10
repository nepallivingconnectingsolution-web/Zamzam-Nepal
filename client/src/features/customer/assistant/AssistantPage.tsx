import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Bot, Send, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistant, WELCOME, type AssistantAction } from "./assistant-engine";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  actions?: AssistantAction[];
}

const STORAGE_KEY = "zz_assistant_chat";

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

export function AssistantPage() {
  const navigate = useNavigate();
  const saved = useRef(loadSaved()).current;

  const [messages, setMessages] = useState<ChatMessage[]>(
    saved?.messages ?? [{ id: msgId(), role: "assistant", text: WELCOME.text }],
  );
  const [followUps, setFollowUps] = useState<string[]>(saved?.followUps ?? WELCOME.followUps ?? []);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  // Keep the conversation across in-app navigation (sessionStorage, same
  // pattern as auth) so tapping an action button and coming back doesn't
  // wipe the chat. Cleared automatically when the browser tab closes.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages, followUps }));
    } catch {
      // Storage full/blocked — the chat still works, it just won't persist.
    }
  }, [messages, followUps]);

  // Always keep the newest message in view.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || thinking) return;
    setDraft("");
    setMessages((m) => [...m, { id: msgId(), role: "user", text }]);
    setThinking(true);
    try {
      // A short minimum delay so replies feel considered rather than jarring.
      const [reply] = await Promise.all([askAssistant(text), new Promise((r) => setTimeout(r, 450))]);
      setMessages((m) => [...m, { id: msgId(), role: "assistant", text: reply.text, actions: reply.actions }]);
      setFollowUps(reply.followUps ?? []);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="AI assistant" subtitle="Ask Zamzam to plan, book or compare." />

      <Card className="flex h-[calc(100vh-240px)] min-h-[420px] flex-col">
        {/* ── Conversation ── */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-5">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-fg">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                  <Bot className="size-4" />
                </span>
                <div className="max-w-[85%] space-y-2.5">
                  <div className="rounded-2xl rounded-tl-md border border-border bg-muted/40 px-4 py-2.5 text-sm leading-relaxed">
                    {m.text}
                  </div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.actions.map((a) => (
                        <Button key={a.to + a.label} variant="outline" size="sm" onClick={() => navigate(a.to)}>
                          {a.label} <ArrowRight className="size-3.5" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ),
          )}

          {thinking && (
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <Bot className="size-4" />
              </span>
              <div className="rounded-2xl rounded-tl-md border border-border bg-muted/40 px-4 py-3">
                <span className="flex gap-1">
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:0ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:150ms]" />
                  <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Suggested follow-ups ── */}
        {followUps.length > 0 && !thinking && (
          <div className="flex flex-wrap gap-2 border-t border-border px-5 py-3">
            {followUps.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-fg transition-colors hover:border-accent hover:text-accent"
              >
                <Sparkles className="size-3" /> {q}
              </button>
            ))}
          </div>
        )}

        {/* ── Composer ── */}
        <div className="flex items-center gap-2 border-t border-border p-4">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send(draft);
            }}
            placeholder="Ask anything — “book a bike”, “where is my ride?”, “wallet balance”…"
            aria-label="Message the assistant"
          />
          <Button variant="accent" size="icon" onClick={() => send(draft)} disabled={thinking || !draft.trim()} aria-label="Send">
            <Send className="size-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
}