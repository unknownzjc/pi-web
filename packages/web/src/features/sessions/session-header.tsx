import { useAppStore } from "../../app/store/app-store.js";
import { useSessionStore } from "../../app/store/session-store.js";
import { abortSession } from "../../api/sessions.js";

export function SessionHeader() {
  const activeHandle = useAppStore((s) => s.activeSessionHandle);
  const session = useSessionStore(
    (s) => (activeHandle ? s.sessions[activeHandle] : undefined),
  );

  if (!session) return null;

  const { summary, state } = session;
  const isStreaming = state?.isStreaming ?? false;

  return (
    <div className="flex items-center gap-3 bg-[var(--color-bg-tertiary)] px-4 py-2">
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {summary?.sessionName ?? `Session ${activeHandle?.slice(0, 8)}`}
      </span>

      {state?.model && (
        <span className="inline-flex items-center rounded-full bg-[var(--color-bg-active)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-text-tertiary)]">
          {state.model.displayName ?? state.model.id}
        </span>
      )}

      <div className="flex-1" />

      {isStreaming && (
        <button
          onClick={() => {
            if (activeHandle) abortSession(activeHandle);
          }}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="1" />
          </svg>
          Stop
        </button>
      )}
    </div>
  );
}
