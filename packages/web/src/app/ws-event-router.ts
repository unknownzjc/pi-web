import type { SessionStateDto, SessionMessageDto, ModelDto } from "../types/dto.js";
import { useSessionStore } from "./store/session-store.js";

interface WsEvent {
  type: string;
  sessionHandle: string;
  [key: string]: unknown;
}

interface SessionStateEvent extends WsEvent {
  type: "session.state";
  state: SessionStateDto;
}

interface MessageDeltaEvent extends WsEvent {
  type: "session.message_delta";
  streamingMessageId: string;
  turnIndex: number;
  delta: string;
}

interface MessageDoneEvent extends WsEvent {
  type: "session.message_done";
  entryId: string;
  message: SessionMessageDto;
}

interface ToolStartedEvent extends WsEvent {
  type: "session.tool_started";
  toolCallId: string;
  toolName: string;
  args?: unknown;
}

interface ToolUpdatedEvent extends WsEvent {
  type: "session.tool_updated";
  toolCallId: string;
  toolName: string;
  partialResult?: unknown;
}

interface ToolFinishedEvent extends WsEvent {
  type: "session.tool_finished";
  toolCallId: string;
  toolName: string;
  entryId?: string;
  message?: SessionMessageDto;
}

interface SessionErrorEvent extends WsEvent {
  type: "session.error";
  message: string;
}

interface SessionModelsEvent extends WsEvent {
  type: "session.models";
  models: ModelDto[];
}

type ServerWsEvent =
  | SessionStateEvent
  | MessageDeltaEvent
  | MessageDoneEvent
  | ToolStartedEvent
  | ToolUpdatedEvent
  | ToolFinishedEvent
  | SessionErrorEvent
  | SessionModelsEvent
  | WsEvent;

export function routeWsEvent(event: ServerWsEvent): void {
  const { type, sessionHandle } = event;
  const store = useSessionStore.getState();

  switch (type) {
    case "session.state": {
      const e = event as SessionStateEvent;
      store.setSession(sessionHandle, { state: e.state });
      break;
    }

    case "session.message_delta": {
      const e = event as MessageDeltaEvent;
      const session = store.sessions[sessionHandle];
      const existing = session?.streamingDraft;
      store.setSession(sessionHandle, {
        streamingDraft: {
          streamingMessageId: e.streamingMessageId,
          turnIndex: e.turnIndex,
          role: "assistant",
          text: existing?.streamingMessageId === e.streamingMessageId
            ? existing.text + e.delta
            : e.delta,
        },
      });
      break;
    }

    case "session.message_done": {
      const e = event as MessageDoneEvent;
      const session = store.sessions[sessionHandle];
      const messages = session?.messages ?? [];
      // Remove any existing message with same entryId (dedup by message.entryId)
      const filtered = messages.filter((m) => m.entryId !== e.message.entryId);
      store.setSession(sessionHandle, {
        messages: [...filtered, e.message],
        streamingDraft: undefined,
      });
      break;
    }

    case "session.tool_started": {
      const e = event as ToolStartedEvent;
      const session = store.sessions[sessionHandle];
      const existing = session?.toolDrafts ?? [];
      store.setSession(sessionHandle, {
        toolDrafts: [
          ...existing.filter((t) => t.toolCallId !== e.toolCallId),
          {
            toolCallId: e.toolCallId,
            toolName: e.toolName,
            status: "running" as const,
            args: e.args,
          },
        ],
      });
      break;
    }

    case "session.tool_updated": {
      const e = event as ToolUpdatedEvent;
      const session = store.sessions[sessionHandle];
      const existing = session?.toolDrafts ?? [];
      store.setSession(sessionHandle, {
        toolDrafts: existing.map((t) =>
          t.toolCallId === e.toolCallId
            ? { ...t, partialResult: e.partialResult }
            : t,
        ),
      });
      break;
    }

    case "session.tool_finished": {
      const e = event as ToolFinishedEvent;
      const session = store.sessions[sessionHandle];
      const existing = session?.toolDrafts ?? [];
      const updatedDrafts = existing.map((t) =>
        t.toolCallId === e.toolCallId
          ? { ...t, status: "done" as const, entryId: e.entryId }
          : t,
      );
      // If the tool finished with a message, add it to messages
      const messages = session?.messages ?? [];
      const newMessages = e.message
        ? [...messages.filter((m) => m.entryId !== e.message!.entryId), e.message]
        : messages;
      store.setSession(sessionHandle, {
        toolDrafts: updatedDrafts,
        messages: newMessages,
      });
      break;
    }

    case "session.error": {
      const e = event as SessionErrorEvent;
      const session = store.sessions[sessionHandle];
      if (session?.state) {
        store.setSession(sessionHandle, {
          state: { ...session.state, error: e.message },
        });
      }
      break;
    }

    case "session.models": {
      // Models are now carried in session.state.availableModels, but
      // we handle this dedicated response for explicit list requests too.
      break;
    }

    default:
      // Unknown event type - ignore
      break;
  }
}
