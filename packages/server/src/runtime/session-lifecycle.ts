import type { AgentSession } from "@mariozechner/pi-coding-agent";
import type { TranslatorState } from "./event-translator.js";

/**
 * Tracks an active (AgentSession` instance with metadata needed for event bridging.
 */
export interface ActiveSession {
  /** The `AgentSession` instance from the SDK. */
  agentSession: AgentSession;
  /** Extracted sessionId from the session handle. */
  sessionId: string;
  /** The full `sessionHandle` for event emission. */
  sessionHandle: string;
  /** The workspace path where this session was rooted. */
  workspacePath: string;
  /** Unsubscribe function from the SDK event subscription. */
  unsubscribeFromSdk: () => void;
  /** Mutable translator state for event translation. */
  translatorState: TranslatorState;
}

/**
 * Manages a lifecycle of `AgentSession` instances.
 * Provides add/get/remove operations and a session map.
 * Handles disposal of all sessions on shutdown.
 */
export class SessionLifecycle {
  private sessions = new Map<string, ActiveSession>();

  /**
   * Register an active session.
   * @throws if a session already exists (should not happen in normal flow)
   */
  add(session: ActiveSession): void {
    if (this.sessions.has(session.sessionId)) {
      throw new Error(
        `Session already active: ${session.sessionId}`,
      );
    }
    this.sessions.set(session.sessionId, session);
  }

  /**
   * Retrieve an active session by ID.
   * @returns `undefined` if not active.
   */
  get(sessionId: string): ActiveSession | undefined {
    return this.sessions.get(sessionId);
  }
  /**
   * Remove and dispose an active session.
   * No-op if not active.
   */
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.unsubscribeFromSdk();
    session.agentSession.dispose();
    this.sessions.delete(sessionId);
  }
  /**
   * Remove all sessions and dispose them.
   * Called on server shutdown.
   */
  disposeAll(): void {
    for (const session of this.sessions.values()) {
      session.unsubscribeFromSdk();
      session.agentSession.dispose();
    }
    this.sessions.clear();
  }
  get size(): number {
    return this.sessions.size;
  }
}
