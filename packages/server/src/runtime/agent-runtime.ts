import type {
  WorkspaceValidationResult,
  ListSessionsInput,
  ListSessionsResult,
  CreateSessionInput,
  CreateSessionResult,
  ResumeSessionInput,
  ResumeSessionResult,
  GetSessionStateInput,
  SessionStateDto,
  GetSessionMessagesInput,
  SessionMessagesPageDto,
  PromptInput,
  AbortInput,
  GetGitChangesInput,
  GitChangesDto,
  GetGitDiffInput,
  GitDiffDto,
  RuntimeEventListener,
  ListModelsInput,
  ModelDto,
  SetModelInput,
  SetThinkingLevelInput,
} from "./runtime-types.js";

export interface AgentRuntime {
  readonly runtimeId: string;

  validateWorkspace(inputPath: string): Promise<WorkspaceValidationResult>;

  listSessions(input: ListSessionsInput): Promise<ListSessionsResult>;

  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;

  resumeSession(input: ResumeSessionInput): Promise<ResumeSessionResult>;

  getSessionState(input: GetSessionStateInput): Promise<SessionStateDto>;

  getSessionMessages(
    input: GetSessionMessagesInput,
  ): Promise<SessionMessagesPageDto>;

  prompt(input: PromptInput): Promise<void>;

  abort(input: AbortInput): Promise<void>;

  getGitChanges(input: GetGitChangesInput): Promise<GitChangesDto>;

  getGitDiff(input: GetGitDiffInput): Promise<GitDiffDto>;

  listModels(input: ListModelsInput): Promise<ModelDto[]>;

  setModel(input: SetModelInput): Promise<void>;

  setThinkingLevel(input: SetThinkingLevelInput): Promise<void>;

  subscribe(listener: RuntimeEventListener): () => void;
}
