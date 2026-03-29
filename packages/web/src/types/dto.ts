export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ModelDto {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
}

export interface WorkspaceDto {
  workspaceId: string;
  runtimeId: string;
  path: string;
  name?: string;
  isGitRepo: boolean;
  lastUsedAt?: string;
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
    toolArgs?: unknown;
  };
}

export interface SessionMessagesPageDto {
  sessionHandle: string;
  items: SessionMessageDto[];
  nextBeforeEntryId?: string;
}

export interface OkResponse<T> {
  ok: true;
  data: T;
}

export interface ErrorResponse {
  ok: false;
  error: { code: string; message: string };
}

export type ApiResponse<T> = OkResponse<T> | ErrorResponse;
