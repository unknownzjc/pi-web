import { useEffect } from "react";
import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { SessionHeader } from "./session-header.js";
import { MessageTimeline } from "./message-timeline.js";
import { Composer } from "./composer/index.js";
import { wsSend } from "../../app/ws-instance.js";

export function SessionMain() {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const sessionState = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle]?.state : undefined),
  );

  // Request session state when switching to a session that has no state yet.
  // This ensures the model/thinking selectors are populated immediately.
  useEffect(() => {
    if (activeHandle && !sessionState) {
      wsSend({
        type: "session.get_state",
        sessionHandle: activeHandle,
      });
    }
  }, [activeHandle, sessionState]);

  if (!activeHandle) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-[var(--color-text-tertiary)]"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              No active session
            </p>
            <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
              Select or create a session to begin
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SessionHeader />
      {/* Messages area + bottom gradient mask */}
      <div className="relative flex-1 overflow-hidden">
        <MessageTimeline />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[150px]"
          style={{
            background:
              "linear-gradient(to bottom, transparent 0%, var(--color-bg-primary) 100%)",
          }}
        />
      </div>
      <Composer wsSend={wsSend} />
    </div>
  );
}
