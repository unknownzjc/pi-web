import { create } from "zustand";
import type { SessionSummaryDto, SessionStateDto, SessionMessageDto } from "../../types/dto.js";

export interface StreamingDraft {
  streamingMessageId: string;
  turnIndex: number;
  role: "assistant";
  text: string;
}

export interface ToolDraft {
  toolCallId: string;
  toolName: string;
  status: "running" | "done";
  partialResult?: unknown;
  entryId?: string;
  args?: unknown;
}

export interface SessionData {
  summary?: SessionSummaryDto;
  state?: SessionStateDto;
  messages: SessionMessageDto[];
  nextBeforeEntryId?: string;
  hasLoadedInitialPage: boolean;
  isLoadingHistory: boolean;
  streamingDraft?: StreamingDraft;
  toolDrafts?: ToolDraft[];
}

const defaultSession: SessionData = {
  messages: [],
  hasLoadedInitialPage: false,
  isLoadingHistory: false,
};

interface SessionStore {
  sessions: Record<string, SessionData>;

  getSession: (handle: string) => SessionData | undefined;
  setSession: (handle: string, patch: Partial<SessionData>) => void;
  removeSession: (handle: string) => void;
  clearSessions: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},

  getSession: (handle) => get().sessions[handle],

  setSession: (handle, patch) =>
    set((state) => {
      const existing = state.sessions[handle];
      const merged: SessionData = {
        ...defaultSession,
        ...existing,
        ...patch,
      };
      // Preserve messages unless explicitly provided in patch
      if (patch.messages === undefined && existing) {
        merged.messages = existing.messages;
      }
      // Preserve toolDrafts unless explicitly provided in patch
      if (patch.toolDrafts === undefined && existing) {
        merged.toolDrafts = existing.toolDrafts;
      }
      // Handle streamingDraft: only override if key exists in patch
      if (!("streamingDraft" in patch) && existing) {
        merged.streamingDraft = existing.streamingDraft;
      }
      return {
        sessions: {
          ...state.sessions,
          [handle]: merged,
        },
      };
    }),

  removeSession: (handle) =>
    set((state) => {
      const { [handle]: _, ...rest } = state.sessions;
      return { sessions: rest };
    }),

  clearSessions: () => set({ sessions: {} }),
}));
