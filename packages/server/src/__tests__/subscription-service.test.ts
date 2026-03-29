import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RuntimeEvent } from "../runtime/runtime-types.js";
import { SubscriptionService } from "../services/subscription-service.js";

// Minimal WS-like client mock
function createMockClient() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
  };
}

describe("SubscriptionService", () => {
  let service: SubscriptionService;
  let onPrompt: ReturnType<typeof vi.fn>;
  let onAbort: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onPrompt = vi.fn();
    onAbort = vi.fn();
    service = new SubscriptionService({
      onPrompt,
      onAbort,
      onListModels: () => Promise.resolve([]),
      onGetState: () => Promise.resolve({ sessionHandle: "", isStreaming: false, pendingToolCalls: [] }),
      onSetModel: () => Promise.resolve(),
      onSetThinkingLevel: () => Promise.resolve(),
    });
  });

  it("addConnection registers a WS client", () => {
    const client = createMockClient();
    service.addConnection(client as any);
    // Client should be in the connections list
    expect(service.connectionCount).toBe(1);
  });

  it("removeConnection cleans up", () => {
    const client = createMockClient();
    service.addConnection(client as any);
    service.removeConnection(client as any);
    expect(service.connectionCount).toBe(0);
  });

  it("runtime events broadcast to all connected clients as ServerWsEvent", () => {
    const client1 = createMockClient();
    const client2 = createMockClient();
    service.addConnection(client1 as any);
    service.addConnection(client2 as any);

    const event: RuntimeEvent = {
      type: "session.started",
      sessionHandle: "local:sess-1",
    };

    service.broadcastEvent(event);

    expect(client1.send).toHaveBeenCalledTimes(1);
    expect(client2.send).toHaveBeenCalledTimes(1);

    const sent = JSON.parse(client1.send.mock.calls[0][0]);
    expect(sent.type).toBe("session.started");
    expect(sent.sessionHandle).toBe("local:sess-1");
  });

  it("does not broadcast to closed connections", () => {
    const client = createMockClient();
    client.readyState = 3; // CLOSED
    service.addConnection(client as any);

    service.broadcastEvent({
      type: "session.started",
      sessionHandle: "local:sess-1",
    });

    expect(client.send).not.toHaveBeenCalled();
  });

  it("session.prompt client event triggers onPrompt callback", async () => {
    const client = createMockClient();
    service.addConnection(client as any);

    await service.handleClientMessage(
      JSON.stringify({
        type: "session.prompt",
        sessionHandle: "local:sess-1",
        text: "hello",
      }),
    );

    expect(onPrompt).toHaveBeenCalledWith("local:sess-1", "hello");
  });

  it("session.abort client event triggers onAbort callback", async () => {
    const client = createMockClient();
    service.addConnection(client as any);

    await service.handleClientMessage(
      JSON.stringify({
        type: "session.abort",
        sessionHandle: "local:sess-1",
      }),
    );

    expect(onAbort).toHaveBeenCalledWith("local:sess-1");
  });

  it("ignores unknown client event types", async () => {
    const client = createMockClient();
    service.addConnection(client as any);

    await service.handleClientMessage(
      JSON.stringify({ type: "unknown.event" }),
    );

    expect(onPrompt).not.toHaveBeenCalled();
    expect(onAbort).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON messages", async () => {
    const client = createMockClient();
    service.addConnection(client as any);

    await service.handleClientMessage("not valid json {{{");

    expect(onPrompt).not.toHaveBeenCalled();
  });

  it("all 8 event types broadcast correctly", () => {
    const client = createMockClient();
    service.addConnection(client as any);

    const events: RuntimeEvent[] = [
      { type: "session.started", sessionHandle: "local:s1" },
      {
        type: "session.state",
        sessionHandle: "local:s1",
        state: { sessionHandle: "local:s1", isStreaming: true, pendingToolCalls: [] },
      },
      {
        type: "session.message_delta",
        sessionHandle: "local:s1",
        turnIndex: 0,
        streamingMessageId: "tmp-1",
        delta: "hello",
      },
      {
        type: "session.message_done",
        sessionHandle: "local:s1",
        turnIndex: 0,
        entryId: "e-1",
        message: {
          entryId: "e-1",
          timestamp: "2025-01-01T00:00:00Z",
          role: "assistant",
          content: "hello",
        },
      },
      {
        type: "session.tool_started",
        sessionHandle: "local:s1",
        toolCallId: "tc-1",
        toolName: "read_file",
        args: { path: "foo.ts" },
      },
      {
        type: "session.tool_updated",
        sessionHandle: "local:s1",
        toolCallId: "tc-1",
        toolName: "read_file",
        partialResult: "partial",
      },
      {
        type: "session.tool_finished",
        sessionHandle: "local:s1",
        toolCallId: "tc-1",
        toolName: "read_file",
      },
      {
        type: "session.error",
        sessionHandle: "local:s1",
        error: { code: "internal_error", message: "something went wrong" },
      },
    ];

    for (const event of events) {
      service.broadcastEvent(event);
    }

    expect(client.send).toHaveBeenCalledTimes(8);

    // Verify each event was sent with correct type
    const sentTypes = client.send.mock.calls.map(
      (call: any[]) => JSON.parse(call[0]).type,
    );
    expect(sentTypes).toEqual([
      "session.started",
      "session.state",
      "session.message_delta",
      "session.message_done",
      "session.tool_started",
      "session.tool_updated",
      "session.tool_finished",
      "session.error",
    ]);
  });
});
