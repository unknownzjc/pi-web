import { randomUUID } from "node:crypto";
import type { AgentSessionEvent } from "@mariozechner/pi-coding-agent";
import type {
  RuntimeEvent,
  SessionMessageDto,
} from "./runtime-types.js";

/** Mutable state tracked across events for a single session. */
export interface TranslatorState {
  turnIndex: number;
  streamingMessageId: string | null;
  /** Track tool args from tool_execution_start so they can be included in tool_finished messages. */
  pendingToolArgs: Map<string, unknown>;
}

/** Create a fresh translator state. */
export function createTranslatorState(): TranslatorState {
  return { turnIndex: 0, streamingMessageId: null, pendingToolArgs: new Map() };
}

/**
 * Translate a single SDK `AgentSessionEvent` into zero or more `RuntimeEvent`s.
 *
 * Mutates `state` for `turnIndex` and `streamingMessageId` tracking.
 * `getEntryId` is called to resolve the stable entry ID from the session manager
 * after message/tool persistence.
 */
export function translateEvent(
  event: AgentSessionEvent,
  state: TranslatorState,
  sessionHandle: string,
  getEntryId: () => string | undefined,
): RuntimeEvent[] {
  const results: RuntimeEvent[] = [];

  switch (event.type) {
    case "agent_start": {
      state.turnIndex = 0;
      break;
    }

    case "agent_end": {
      // No specific event; caller may emit session.state separately
      break;
    }

    case "turn_start": {
      state.turnIndex++;
      break;
    }

    case "turn_end": {
      // No specific event; caller may emit session.state separately
      break;
    }

    case "message_start": {
      if (event.message.role === "assistant") {
        state.streamingMessageId = randomUUID();
      }
      break;
    }

    case "message_update": {
      if (
        state.streamingMessageId &&
        event.assistantMessageEvent?.type === "text_delta"
      ) {
        results.push({
          type: "session.message_delta",
          sessionHandle,
          turnIndex: state.turnIndex,
          streamingMessageId: state.streamingMessageId,
          delta: event.assistantMessageEvent.delta,
        });
      }
      break;
    }

    case "message_end": {
      if (event.message.role === "assistant" && state.streamingMessageId) {
        const entryId = getEntryId() ?? randomUUID();
        const dto = agentMessageToDto(event.message);
        dto.entryId = entryId;
        results.push({
          type: "session.message_done",
          sessionHandle,
          turnIndex: state.turnIndex,
          entryId,
          message: dto,
        });
        state.streamingMessageId = null;
      }
      // User messages are NOT emitted here — the client adds them
      // optimistically when sending, and the REST re-fetch provides
      // the authoritative version with the stable JSONL entry ID.
      break;
    }

    case "tool_execution_start": {
      // Save args for later inclusion in tool_finished message
      state.pendingToolArgs.set(event.toolCallId, event.args);
      results.push({
        type: "session.tool_started",
        sessionHandle,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      });
      break;
    }

    case "tool_execution_update": {
      results.push({
        type: "session.tool_updated",
        sessionHandle,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      });
      break;
    }

    case "tool_execution_end": {
      const entryId = getEntryId() ?? undefined;
      const args = state.pendingToolArgs.get(event.toolCallId);
      state.pendingToolArgs.delete(event.toolCallId);

      // Build a tool result DTO so the client can persist it in messages
      const resultContent = extractToolResultContent(event.result);
      const toolMessage: SessionMessageDto = {
        entryId: entryId ?? randomUUID(),
        timestamp: new Date().toISOString(),
        role: "toolResult",
        content: resultContent,
        meta: {
          toolName: event.toolName,
          toolCallId: event.toolCallId,
          isError: event.isError ?? false,
          toolArgs: args,
        },
      };

      results.push({
        type: "session.tool_finished",
        sessionHandle,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        entryId,
        message: toolMessage,
      });
      break;
    }

    // Compaction, auto-retry, and other internal SDK events are not
    // forwarded to the frontend in the current implementation.
    default:
      break;
  }

  return results;
}

/** Extract displayable content from a tool execution result. */
function extractToolResultContent(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object" && Array.isArray((result as any).content)) {
    return (result as any).content
      .map((b: any) => (typeof b.text === "string" ? b.text : JSON.stringify(b)))
      .join("\n");
  }
  return JSON.stringify(result);
}

/**
 * Convert an SDK AgentMessage to a SessionMessageDto.
 *
 * This is a best-effort conversion that handles the common message shapes.
 * For MVP, we focus on user, assistant, and toolResult roles.
 */
export function agentMessageToDto(message: any): SessionMessageDto {
  const role = message.role as SessionMessageDto["role"];
  const meta: SessionMessageDto["meta"] = {};

  if (message.stopReason) meta.stopReason = message.stopReason;
  if (message.model) meta.model = message.model;
  if (message.provider) meta.provider = message.provider;
  if (message.toolName) meta.toolName = message.toolName;
  if (message.toolCallId) meta.toolCallId = message.toolCallId;
  if (message.isError !== undefined) meta.isError = message.isError;
  if (message.args !== undefined) meta.toolArgs = message.args;

  // Extract text and thinking from content blocks if content is an array
  let content: unknown = message.content;
  if (Array.isArray(content)) {
    const originalBlocks = content;

    // Extract thinking blocks (skip empty-string thinking from encrypted/opaque providers)
    const thinkingParts = content
      .filter((block: any) => block.type === "thinking" && typeof block.thinking === "string" && block.thinking.length > 0)
      .map((block: any) => block.thinking as string);
    if (thinkingParts.length > 0) {
      meta.thinking = thinkingParts.join("\n");
    }

    // Extract text blocks
    const textParts = content
      .filter((block: any) => block.type === "text" && typeof block.text === "string")
      .map((block: any) => block.text as string);
    content = textParts.join("\n");

    // If no text blocks found, check for error or leave empty
    if ((content as string).length === 0) {
      // Recognised non-text block types that are handled elsewhere (tool panels, thinking)
      const hasKnownBlocks = originalBlocks.some(
        (block: any) =>
          block.type === "thinking" ||
          block.type === "tool_use" ||
          block.type === "toolCall",
      );

      if (message.stopReason === "error" && message.errorMessage) {
        content = `**Error:** ${message.errorMessage}`;
      } else if (!hasKnownBlocks && originalBlocks.length > 0) {
        // Only fall back to raw JSON for truly unknown block types
        content = JSON.stringify(message.content, null, 2);
      } else {
        content = "";
      }
    }
  }

  return {
    entryId: randomUUID(), // Will be overridden by caller when entryId is known
    timestamp:
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : message.timestamp ?? new Date().toISOString(),
    role,
    content,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}
