export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Splits a Server-Sent Events byte stream into events. Network chunks can cut a
 * frame anywhere, so callers keep the returned `rest` and prepend it to the next
 * chunk. Handles LF and CRLF, comment lines (keep-alives) and multi-line data.
 */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const text = buffer.replace(/\r\n/g, "\n");
  const frames = text.split("\n\n");
  const rest = frames.pop() ?? "";

  const events: SseEvent[] = [];
  for (const frame of frames) {
    let event = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const i = line.indexOf(":");
      const field = i === -1 ? line : line.slice(0, i);
      const value = i === -1 ? "" : line.slice(i + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/**
 * Whole seconds left before an offer expires. `skewMs` is (server time - device
 * time), so a wrong phone clock can't make a live offer look expired or make an
 * expired one look live. Rounds up: 0 means it really has expired.
 */
export function secondsLeft(expiresAtIso: string, nowMs: number, skewMs = 0): number {
  const end = Date.parse(expiresAtIso);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - (nowMs + skewMs)) / 1000));
}
