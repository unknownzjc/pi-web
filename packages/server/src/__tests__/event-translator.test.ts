import { describe, it, expect } from "vitest";
import {
  createTranslatorState,
  translateEvent,
} from "../runtime/event-translator.js";
import type { TranslatorState } from "../runtime/event-translator.js";
import type { RuntimeEvent } from "../runtime/runtime-types.js";

const HANDLE = "local:test-session-123";

// Helper: create a mock assistant message matching SDK AssistantMessage shape
function mockAssistantMessage(text: string = "hello"): any {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    stopReason: "end_turn",
    api: {},
    usage: {},
  };
}

function mockUserMessage(text: string = "hi"): any {
  return {
    role: "user",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  };
}

function mockToolResultMessage(): any {
  return {
    role: "toolResult",
    content: [{ type: "text", text: "tool output" }],
    timestamp: Date.now(),
    toolCallId: "tc-1",
    toolName: "read",
    isError: false,
  };
}

function makeTextDelta(delta: string): any {
  return {
    type: "text_delta",
    delta,
    contentIndex: 0,
    partial: mockAssistantMessage(delta),
  };
}

function translate(
  event: any,
  state?: TranslatorState,
  getEntryId?: () => string | undefined,
): RuntimeEvent[] {
  const s = state ?? createTranslatorState();
  return translateEvent(event, s, HANDLE, getEntryId ?? (() => "entry-abc"));
}

describe("event-translator", () => {
  describe("createTranslatorState", () => {
    it("returns initial state with turnIndex=0 and no streamingMessageId", () => {
      const state = createTranslatorState();
      expect(state.turnIndex).toBe(0);
      expect(state.streamingMessageId).toBeNull();
    });
  });

  describe("agent_start", () => {
    it("resets turnIndex to 0 and returns no events", () => {
      const state = createTranslatorState();
      state.turnIndex = 5;
      const events = translate({ type: "agent_start" }, state);
      expect(events).toHaveLength(0);
      expect(state.turnIndex).toBe(0);
    });
  });

  describe("agent_end", () => {
    it("returns no events", () => {
      const events = translate({
        type: "agent_end",
        messages: [],
      });
      expect(events).toHaveLength(0);
    });
  });

  describe("turn_start", () => {
    it("increments turnIndex", () => {
      const state = createTranslatorState();
      const events = translate({ type: "turn_start" }, state);
      expect(events).toHaveLength(0);
      expect(state.turnIndex).toBe(1);
    });

    it("increments turnIndex from existing value", () => {
      const state = createTranslatorState();
      state.turnIndex = 3;
      translate({ type: "turn_start" }, state);
      expect(state.turnIndex).toBe(4);
    });
  });

  describe("turn_end", () => {
    it("returns no events", () => {
      const events = translate({
        type: "turn_end",
        message: mockAssistantMessage(),
        toolResults: [],
      });
      expect(events).toHaveLength(0);
    });
  });

  describe("message_start", () => {
    it("generates streamingMessageId for assistant messages", () => {
      const state = createTranslatorState();
      const events = translate(
        { type: "message_start", message: mockAssistantMessage() },
        state,
      );
      expect(events).toHaveLength(0);
      expect(state.streamingMessageId).toBeTruthy();
    });

    it("does not generate streamingMessageId for user messages", () => {
      const state = createTranslatorState();
      translate(
        { type: "message_start", message: mockUserMessage() },
        state,
      );
      expect(state.streamingMessageId).toBeNull();
    });
  });

  describe("message_update", () => {
    it("produces session.message_delta for text_delta events", () => {
      const state = createTranslatorState();
      // First start a message to get streamingMessageId
      translate(
        { type: "message_start", message: mockAssistantMessage() },
        state,
      );
      const streamingId = state.streamingMessageId!;

      const events = translate(
        {
          type: "message_update",
          message: mockAssistantMessage("partial"),
          assistantMessageEvent: makeTextDelta("Hello "),
        },
        state,
      );

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session.message_delta",
        sessionHandle: HANDLE,
        turnIndex: 0,
        streamingMessageId: streamingId,
        delta: "Hello ",
      });
    });

    it("produces no events when there is no streamingMessageId", () => {
      const state = createTranslatorState();
      const events = translate(
        {
          type: "message_update",
          message: mockAssistantMessage(),
          assistantMessageEvent: makeTextDelta("Hello "),
        },
        state,
      );
      expect(events).toHaveLength(0);
    });

    it("produces no events for non-text_delta events", () => {
      const state = createTranslatorState();
      translate(
        { type: "message_start", message: mockAssistantMessage() },
        state,
      );

      const events = translate(
        {
          type: "message_update",
          message: mockAssistantMessage(),
          assistantMessageEvent: {
            type: "thinking_delta",
            delta: "thinking...",
            contentIndex: 0,
            partial: mockAssistantMessage(),
          },
        },
        state,
      );
      expect(events).toHaveLength(0);
    });
  });

  describe("message_end", () => {
    it("produces session.message_done for assistant messages", () => {
      const state = createTranslatorState();
      // Start a message first
      translate(
        { type: "message_start", message: mockAssistantMessage("world") },
        state,
      );

      const events = translate(
        {
          type: "message_end",
          message: mockAssistantMessage("Hello world"),
        },
        state,
        () => "entry-xyz",
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("session.message_done");
      const done = events[0] as Extract<RuntimeEvent, { type: "session.message_done" }>;
      expect(done.sessionHandle).toBe(HANDLE);
      expect(done.entryId).toBe("entry-xyz");
      expect(done.message).toBeDefined();
      expect(done.message.role).toBe("assistant");
    });

    it("clears streamingMessageId after message_done", () => {
      const state = createTranslatorState();
      translate(
        { type: "message_start", message: mockAssistantMessage() },
        state,
      );
      expect(state.streamingMessageId).toBeTruthy();

      translate(
        { type: "message_end", message: mockAssistantMessage() },
        state,
      );
      expect(state.streamingMessageId).toBeNull();
    });

    it("produces no events for user messages (handled optimistically by client)", () => {
      const events = translate(
        { type: "message_end", message: mockUserMessage() },
      );
      expect(events).toHaveLength(0);
    });

    it("falls back to generated entryId when getEntryId returns undefined", () => {
      const state = createTranslatorState();
      translate(
        { type: "message_start", message: mockAssistantMessage() },
        state,
      );

      const events = translate(
        { type: "message_end", message: mockAssistantMessage() },
        state,
        () => undefined,
      );

      expect(events).toHaveLength(1);
      const done = events[0] as Extract<RuntimeEvent, { type: "session.message_done" }>;
      expect(done.entryId).toBeTruthy(); // Generated UUID
    });
  });

  describe("tool_execution_start", () => {
    it("produces session.tool_started", () => {
      const events = translate({
        type: "tool_execution_start",
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "/foo/bar.ts" },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session.tool_started",
        sessionHandle: HANDLE,
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "/foo/bar.ts" },
      });
    });
  });

  describe("tool_execution_update", () => {
    it("produces session.tool_updated", () => {
      const events = translate({
        type: "tool_execution_update",
        toolCallId: "tc-1",
        toolName: "bash",
        args: {},
        partialResult: { content: [{ type: "text", text: "running..." }] },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "session.tool_updated",
        sessionHandle: HANDLE,
        toolCallId: "tc-1",
        toolName: "bash",
        partialResult: { content: [{ type: "text", text: "running..." }] },
      });
    });
  });

  describe("tool_execution_end", () => {
    it("produces session.tool_finished with tool result message", () => {
      const events = translate(
        {
          type: "tool_execution_end",
          toolCallId: "tc-1",
          toolName: "read",
          result: { content: [{ type: "text", text: "file contents" }] },
          isError: false,
        },
        undefined,
        () => "entry-tool-1",
      );

      expect(events).toHaveLength(1);
      const finished = events[0] as Extract<
        RuntimeEvent,
        { type: "session.tool_finished" }
      >;
      expect(finished.type).toBe("session.tool_finished");
      expect(finished.sessionHandle).toBe(HANDLE);
      expect(finished.toolCallId).toBe("tc-1");
      expect(finished.toolName).toBe("read");
      expect(finished.entryId).toBe("entry-tool-1");
      // Verify the tool result message is included
      expect(finished.message).toBeDefined();
      expect(finished.message!.role).toBe("toolResult");
      expect(finished.message!.content).toBe("file contents");
      expect(finished.message!.meta?.toolName).toBe("read");
      expect(finished.message!.meta?.toolCallId).toBe("tc-1");
      expect(finished.message!.meta?.isError).toBe(false);
    });

    it("includes tool args from tool_execution_start in result message", () => {
      const state = createTranslatorState();
      // First emit tool_execution_start to save args
      translate(
        {
          type: "tool_execution_start",
          toolCallId: "tc-2",
          toolName: "read",
          args: { path: "/foo.ts" },
        },
        state,
      );
      // Then emit tool_execution_end
      const events = translate(
        {
          type: "tool_execution_end",
          toolCallId: "tc-2",
          toolName: "read",
          result: "file contents",
          isError: false,
        },
        state,
        () => "entry-tool-2",
      );

      expect(events).toHaveLength(1);
      const finished = events[0] as Extract<
        RuntimeEvent,
        { type: "session.tool_finished" }
      >;
      expect(finished.message?.meta?.toolArgs).toEqual({ path: "/foo.ts" });
    });

    it("omits entryId when getEntryId returns undefined", () => {
      const events = translate(
        {
          type: "tool_execution_end",
          toolCallId: "tc-1",
          toolName: "bash",
          result: {},
          isError: false,
        },
        undefined,
        () => undefined,
      );

      expect(events).toHaveLength(1);
      const finished = events[0] as Extract<
        RuntimeEvent,
        { type: "session.tool_finished" }
      >;
      expect(finished.entryId).toBeUndefined();
      // message should still be present with a generated entryId
      expect(finished.message).toBeDefined();
      expect(finished.message!.entryId).toBeTruthy();
    });
  });

  describe("SDK lifecycle events", () => {
    it("produces no events for compaction_start", () => {
      const events = translate({
        type: "compaction_start",
        reason: "manual",
      });
      expect(events).toHaveLength(0);
    });

    it("produces no events for compaction_end", () => {
      const events = translate({
        type: "compaction_end",
        reason: "manual",
        result: undefined,
        aborted: false,
        willRetry: false,
      });
      expect(events).toHaveLength(0);
    });
  });

  describe("full streaming sequence", () => {
    it("produces correct event sequence for a typical prompt flow", () => {
      const state = createTranslatorState();
      const allEvents: RuntimeEvent[] = [];

      function step(event: any, entryId?: string) {
        const translated = translateEvent(
          event,
          state,
          HANDLE,
          () => entryId,
        );
        allEvents.push(...translated);
      }

      // Agent starts
      step({ type: "agent_start" });

      // Turn 1: assistant text response
      step({ type: "turn_start" });
      step({ type: "message_start", message: mockAssistantMessage() });
      step({
        type: "message_update",
        message: mockAssistantMessage("Hello"),
        assistantMessageEvent: makeTextDelta("Hello"),
      });
      step({
        type: "message_update",
        message: mockAssistantMessage("Hello world"),
        assistantMessageEvent: makeTextDelta(" world"),
      });
      step(
        { type: "message_end", message: mockAssistantMessage("Hello world") },
        "entry-msg-1",
      );
      step({
        type: "turn_end",
        message: mockAssistantMessage("Hello world"),
        toolResults: [],
      });

      // Turn 2: assistant uses a tool
      step({ type: "turn_start" });
      step({ type: "message_start", message: mockAssistantMessage() });
      step(
        { type: "message_end", message: mockAssistantMessage("I'll read a file") },
        "entry-msg-2",
      );
      step({
        type: "tool_execution_start",
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "/foo.ts" },
      });
      step({
        type: "tool_execution_update",
        toolCallId: "tc-1",
        toolName: "read",
        args: { path: "/foo.ts" },
        partialResult: "loading...",
      });
      step({
        type: "tool_execution_end",
        toolCallId: "tc-1",
        toolName: "read",
        result: "file contents",
        isError: false,
      });
      step({
        type: "turn_end",
        message: mockAssistantMessage(),
        toolResults: [mockToolResultMessage()],
      });

      // Agent ends
      step({ type: "agent_end", messages: [] });

      // Verify event sequence
      expect(allEvents.map((e) => e.type)).toEqual([
        "session.message_delta",      // "Hello"
        "session.message_delta",      // " world"
        "session.message_done",       // entry-msg-1
        "session.message_done",       // entry-msg-2 (tool call message)
        "session.tool_started",       // tc-1 read
        "session.tool_updated",       // tc-1 read partial
        "session.tool_finished",      // tc-1 read done
      ]);

      // Verify turnIndex progression
      const delta1 = allEvents[0] as Extract<
        RuntimeEvent,
        { type: "session.message_delta" }
      >;
      expect(delta1.turnIndex).toBe(1); // First turn after turn_start

    });
  });
});
