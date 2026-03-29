import { describe, it, expect, vi } from "vitest";
import { SessionLifecycle } from "../runtime/session-lifecycle.js";
import type { ActiveSession } from "../runtime/session-lifecycle.js";
import { createTranslatorState } from "../runtime/event-translator.js";
import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { randomUUID } from "node:crypto";

// Helpers
const makeMockSession = (overrides?: Partial<ActiveSession>): ActiveSession => {
  const unsubscribe = vi.fn();
  const dispose = vi.fn();
  return {
    agentSession: { dispose, subscribe: vi.fn() } as unknown as AgentSession,
    sessionId: randomUUID(),
    sessionHandle: "local:test-session",
    workspacePath: "/tmp/test-workspace",
    unsubscribeFromSdk: unsubscribe,
    translatorState: createTranslatorState(),
    ...overrides,
  };
};

describe("SessionLifecycle", () => {
  it("add() registers a session", () => {
    const lifecycle = new SessionLifecycle();
    const session = makeMockSession();
    lifecycle.add(session);
    expect(lifecycle.get(session.sessionId)).toBe(session);
    expect(lifecycle.size).toBe(1);
  });

  it("add() throws if session already exists", () => {
    const lifecycle = new SessionLifecycle();
    const session = makeMockSession();
    lifecycle.add(session);
    expect(() => lifecycle.add(session)).toThrow("already active");
  });

  it("get() returns undefined for unknown session", () => {
    const lifecycle = new SessionLifecycle();
    expect(lifecycle.get("nonexistent")).toBeUndefined();
  });

  it("remove() disposes and removes a session", () => {
    const lifecycle = new SessionLifecycle();
    const unsubscribe = vi.fn();
    const dispose = vi.fn();
    const session = makeMockSession({
      unsubscribeFromSdk: unsubscribe,
      agentSession: { dispose } as unknown as AgentSession,
    });
    lifecycle.add(session);
    lifecycle.remove(session.sessionId);
    expect(lifecycle.get(session.sessionId)).toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    expect(lifecycle.size).toBe(0);
  });

  it("remove() is no-op for unknown session", () => {
    const lifecycle = new SessionLifecycle();
    expect(() => lifecycle.remove("nonexistent")).not.toThrow();
  });

  it("disposeAll() disposes all sessions", () => {
    const lifecycle = new SessionLifecycle();
    const unsub1 = vi.fn();
    const unsub2 = vi.fn();
    const disp1 = vi.fn();
    const disp2 = vi.fn();
    lifecycle.add(
      makeMockSession({
        unsubscribeFromSdk: unsub1,
        agentSession: { dispose: disp1 } as unknown as AgentSession,
      }),
    );
    lifecycle.add(
      makeMockSession({
        unsubscribeFromSdk: unsub2,
        agentSession: { dispose: disp2 } as unknown as AgentSession,
      }),
    );
    lifecycle.disposeAll();
    expect(unsub1).toHaveBeenCalled();
    expect(unsub2).toHaveBeenCalled();
    expect(disp1).toHaveBeenCalled();
    expect(disp2).toHaveBeenCalled();
    expect(lifecycle.size).toBe(0);
  });

  it("disposeAll() is no-op when empty", () => {
    const lifecycle = new SessionLifecycle();
    expect(() => lifecycle.disposeAll()).not.toThrow();
    expect(lifecycle.size).toBe(0);
  });
});
