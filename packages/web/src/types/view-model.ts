import type {
  SessionSummaryDto,
  SessionStateDto,
  SessionMessageDto,
} from "./dto.js";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "hydrating";

export interface FrontendAppState {
  workspaces: import("./dto.js").WorkspaceDto[];
  selectedWorkspaceId?: string;
  activeSessionHandle?: string;
  connectionStatus: ConnectionStatus;
}

export interface FrontendSessionState {
  summary: SessionSummaryDto;
  state?: SessionStateDto;
  messages: SessionMessageDto[];
  nextBeforeEntryId?: string;
  hasLoadedInitialPage: boolean;
  isLoadingHistory: boolean;
  streamingDraft?: {
    streamingMessageId: string;
    turnIndex: number;
    role: "assistant";
    text: string;
  };
  toolDrafts?: Array<{
    toolCallId: string;
    toolName: string;
    status: "running" | "done";
    partialResult?: unknown;
    entryId?: string;
  }>;
}

export interface FrontendUiState {
  gitDrawerOpen: boolean;
  selectedGitPath?: string;
}
