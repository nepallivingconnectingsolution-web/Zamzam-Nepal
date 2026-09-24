import { describe, expect, it } from "vitest";
import { parseSse, secondsLeft } from "./sse";

describe("parseSse", () => {
  it("parses complete frames and keeps the incomplete tail", () => {
    const chunk = 'event: offer\ndata: {"offerId":"o1"}\n\nevent: ping\ndata: {}\n\nevent: offer\ndata: {"off';
    const { events, rest } = parseSse(chunk);
    expect(events).toEqual([
      { event: "offer", data: '{"offerId":"o1"}' },
      { event: "ping", data: "{}" },
    ]);
    expect(rest).toBe('event: offer\ndata: {"off');
  });

  it("reassembles a frame that arrives split across network chunks", () => {
    let buffer = "";
    const seen: string[] = [];
    for (const piece of ["event: off", 'er\ndata: {"a"', ":1}\n", "\nevent: status\ndata: {}\n\n"]) {
      buffer += piece;
      const { events, rest } = parseSse(buffer);
      seen.push(...events.map((e) => e.event));
      buffer = rest;
    }
    expect(seen).toEqual(["offer", "status"]);
    expect(buffer).toBe("");
  });

  it("handles CRLF line endings, comments and multi-line data", () => {
    const { events } = parseSse(": keep-alive\r\n\r\nevent: offer\r\ndata: line1\r\ndata: line2\r\n\r\n");
    expect(events).toEqual([{ event: "offer", data: "line1\nline2" }]);
  });

  it("uses the default event name when none is given", () => {
    expect(parseSse("data: hi\n\n").events).toEqual([{ event: "message", data: "hi" }]);
  });

  it("returns nothing for an empty or partial buffer", () => {
    expect(parseSse("")).toEqual({ events: [], rest: "" });
    expect(parseSse("event: offer\ndata: x")).toEqual({ events: [], rest: "event: offer\ndata: x" });
  });
});

describe("secondsLeft", () => {
  const expiresAt = "2026-09-21T10:00:15.000Z";
  const at = (iso: string) => Date.parse(iso);

  it("counts down whole seconds, rounding up so 0 means truly expired", () => {
    expect(secondsLeft(expiresAt, at("2026-09-21T10:00:00.000Z"))).toBe(15);
    expect(secondsLeft(expiresAt, at("2026-09-21T10:00:14.200Z"))).toBe(1);
    expect(secondsLeft(expiresAt, at("2026-09-21T10:00:15.000Z"))).toBe(0);
  });

  it("never goes negative", () => {
    expect(secondsLeft(expiresAt, at("2026-09-21T10:05:00.000Z"))).toBe(0);
  });

  it("corrects for a device clock that is ahead or behind the server", () => {
    // device thinks it is 10:00:20 but the server says 10:00:05 -> skew is -15s
    expect(secondsLeft(expiresAt, at("2026-09-21T10:00:20.000Z"), -15_000)).toBe(10);
    // device is 5s slow -> skew +5s
    expect(secondsLeft(expiresAt, at("2026-09-21T10:00:00.000Z"), 5_000)).toBe(10);
  });

  it("treats an unparseable time as already expired", () => {
    expect(secondsLeft("nonsense", Date.now())).toBe(0);
  });
});
