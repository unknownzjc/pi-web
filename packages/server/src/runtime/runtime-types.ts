export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelDto {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export interface WorkspaceValidationResult {
  normalizedPath: string;
  isDirectory: boolean;
  isWritable: boolean;
  isGitRepo: boolean;
}

export interface SessionSummaryDto {
  sessionHandle: string;
  sessionId: string;
  runtimeId: string;
  workspacePath: string;
  sessionFile?: string;
  sessionName?: string;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
}

export interface SessionStateDto {
  sessionHandle: string;
  model?: {
    provider: string;
    id: string;
    displayName?: string;
  };
  thinkingLevel?: string;
  availableModels?: ModelDto[];
  availableThinkingLevels?: ThinkingLevel[];
  isStreaming: boolean;
  pendingToolCalls: string[];
  error?: string;
}

export interface SessionMessageDto {
  entryId: string;
  parentEntryId?: string | null;
  timestamp: string;
  role:
    | "user"
    | "assistant"
    | "toolResult"
    | "bashExecution"
    | "custom"
    | "branchSummary"
    | "compactionSummary";
  content: unknown;
  meta?: {
    toolName?: string;
    toolCallId?: string;
    isError?: boolean;
    stopReason?: string;
    model?: string;
    provider?: string;
    thinking?: string;
  };
}

export interface SessionMessagesPageDto {
  sessionHandle: string;
  items: SessionMessageDto[];
  nextBeforeEntryId?: string;
}

export interface GitChangeItemDto {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked";
  isBinary?: boolean;
}

export interface GitChangesDto {
  workspaceId: string;
  items: GitChangeItemDto[];
}

export interface GitDiffDto {
  workspaceId: string;
  path: string;
  isBinary: boolean;
  tooLarge: boolean;
  diffText?: string;
}

// Result types

export interface ListSessionsResult {
  items: SessionSummaryDto[];
  nextCursor?: string;
}

export interface CreateSessionResult {
  session: SessionSummaryDto;
}

export interface ResumeSessionResult {
  session: SessionSummaryDto;
}

// Input types

export interface ListSessionsInput {
  workspacePath: string;
  cursor?: string;
  limit: number;
}

export interface CreateSessionInput {
  workspacePath: string;
  name?: string;
}

export interface ResumeSessionInput {
  sessionHandle: string;
}

export interface GetSessionStateInput {
  sessionHandle: string;
}

export interface GetSessionMessagesInput {
  sessionHandle: string;
  beforeEntryId?: string;
  limit: number;
}

export interface PromptInput {
  sessionHandle: string;
  text: string;
}

export interface AbortInput {
  sessionHandle: string;
}

export interface GetGitChangesInput {
  workspacePath: string;
}

export interface GetGitDiffInput {
  workspacePath: string;
  relativePath: string;
}

export interface ListModelsInput {
  sessionHandle: string;
}

export interface SetModelInput {
  sessionHandle: string;
  provider: string;
  modelId: string;
}

export interface SetThinkingLevelInput {
  sessionHandle: string;
  level: ThinkingLevel;
}

// Runtime events

export type RuntimeEvent =
  | {
      type: "session.started";
      sessionHandle: string;
    }
  | {
      type: "session.state";
      sessionHandle: string;
      state: SessionStateDto;
    }
  | {
      type: "session.message_delta";
      sessionHandle: string;
      turnIndex: number;
      streamingMessageId: string;
      delta: string;
    }
  | {
      type: "session.message_done";
      sessionHandle: string;
      turnIndex: number;
      entryId: string;
      message: SessionMessageDto;
    }
  | {
      type: "session.tool_started";
      sessionHandle: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | {
      type: "session.tool_updated";
      sessionHandle: string;
      toolCallId: string;
      toolName: string;
      partialResult: unknown;
    }
  | {
      type: "session.tool_finished";
      sessionHandle: string;
      toolCallId: string;
      toolName: string;
      entryId?: string;
      message?: SessionMessageDto;
    }
  | {
      type: "session.error";
      sessionHandle: string;
      error: { code: string; message: string };
    };

export type RuntimeEventListener = (event: RuntimeEvent) => void;
